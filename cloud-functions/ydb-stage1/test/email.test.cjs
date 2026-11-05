const {test}=require('node:test');const assert=require('node:assert/strict');
const {createEmail}=require('../function/email');
const ENV={EMAIL_ENABLED:'true',EMAIL_TO:'recipient@mail.ru',SMTP_USER:'sender@mail.ru',SMTP_PASSWORD:'fixture-application-password',ADMIN_ORIGIN:'https://admin.example'};
function fixture(env={}){
 let t=1700000000000,broken=false,accepted=true,limited=false,closed=0;const jobs=new Map(),calls=[],options=[];
 const leads=new Map([['lead-1',{id:'lead-1',created:'2026-11-05T12:00:00Z',name:'Тест',phone:'70000000000',comment:'<img src="https://example.test">\nКомментарий',estimate:{area:12,total:[100,200],pattern:'Ёлочка',spec:'Дуб; фанера; лак',partial:true,scope:'Без доставки',selection:{ownParquet:true,ownSupplies:false},groups:[{title:'Материалы',rows:[{name:'Дуб',detail:'Отборный',quantity:12,unit:'м²',excluded:true},{name:'Лак',quantity:1,unit:'уп.',cost:[100,200]}]},{title:'Работы',rows:[{name:'Укладка',quantity:12,unit:'м²',pending:true}]}]}}]]);
 const storage={emailPending:async()=>[...jobs].map(([id,p])=>({id,...structuredClone(p)})),emailJob:async(id,fn)=>{const r=fn(structuredClone(jobs.get(id)||null));if(r.value===null)jobs.delete(id);else if(r.value!==undefined)jobs.set(id,r.value);return r.result},getLead:async id=>leads.get(id),limit:async()=>!limited};
 const email=createEmail({storage,env:{...ENV,...env},now:()=>t,createTransport:opt=>{options.push(opt);return {sendMail:async mail=>{calls.push(mail);if(broken)throw Error('private SMTP reply '+ENV.SMTP_PASSWORD);return {accepted:accepted?[ENV.EMAIL_TO]:[]}},close:()=>closed++}}});
 return {email,storage,jobs,calls,options,leads,now:()=>t,advance:ms=>t+=ms,set broken(v){broken=v},set accepted(v){accepted=v},set limited(v){limited=v},get closed(){return closed},enqueue(id='lead-1'){jobs.set(id,{expires:t+7*86400000,attempts:0,next:0,leaseUntil:0})}};
}
test('mail remains disabled until complete configuration is supplied',async()=>{
 for(const env of [{EMAIL_ENABLED:'false'},{SMTP_PASSWORD:''},{EMAIL_TO:'a@mail.ru,b@mail.ru'},{SMTP_USER:'a@other.example'},{ADMIN_ORIGIN:'http://admin.example'}]){const f=fixture(env);f.enqueue();assert.equal(f.email.ready(),false);await f.email.flush();assert.equal(f.calls.length,0);assert.equal(f.jobs.size,1);}
});
test('SMTP uses TLS and app password; test mail creates no order and reveals no credentials',async()=>{
 const f=fixture();await f.email.action('test');assert.equal(f.calls.length,1);assert.equal(f.jobs.size,0);assert.equal(f.closed,1);
 assert.equal(f.options[0].host,'smtp.mail.ru');assert.equal(f.options[0].port,465);assert.equal(f.options[0].secure,true);assert.equal(f.options[0].tls.rejectUnauthorized,true);assert.equal(f.options[0].auth.pass,ENV.SMTP_PASSWORD);
 const status=await f.email.status();assert.equal(status.ready,true);assert.equal(status.recipient,ENV.EMAIL_TO);assert.ok(!JSON.stringify(status).includes(ENV.SMTP_PASSWORD));assert.ok(!JSON.stringify(f.calls).includes(ENV.SMTP_PASSWORD));
});
test('email contains plain-text lead details and estimate, and is removed after acceptance',async()=>{
 const f=fixture();f.enqueue();await f.email.flush();assert.equal(f.jobs.size,0);const m=f.calls[0];assert.equal(m.to,ENV.EMAIL_TO);assert.equal(m.from.address,ENV.SMTP_USER);assert.match(m.text,/Телефон: \+70000000000/);assert.match(m.text,/Площадь: 12 м²/);assert.match(m.text,/100 — 200 ₽/);assert.match(m.text,/https:\/\/admin.example\/admin/);assert.match(m.html,/href="tel:\+70000000000"/);assert.ok(!m.html.includes('<img'));assert.match(m.html,/&lt;img/);assert.equal(m.text.split('\n').at(-1),'Номер заявки: lead-1');assert.match(m.text,/Рисунок: Ёлочка/);assert.match(m.text,/Дуб — Отборный · Количество: 12 м² · Материал клиента/);assert.match(m.text,/Укладка.*индивидуальная оценка/);assert.match(m.text,/Без доставки/);assert.equal(m.attachments.length,1);assert.equal(m.attachments[0].filename,'Заявка-lead-1-смета.xlsx');assert.equal(m.attachments[0].content.readUInt32LE(0),0x04034b50);const {leadWorkbook}=await import('../function/admin-public/lead-export.js');assert.deepEqual(m.attachments[0].content,Buffer.from(await leadWorkbook(f.leads.get('lead-1')).arrayBuffer()));
});
test('SMTP failure retains job with backoff and safe error; retry reuses message ID',async()=>{
 const f=fixture();f.enqueue();f.broken=true;await f.email.flush();assert.equal(f.jobs.size,1);assert.equal(f.jobs.get('lead-1').attempts,1);assert.equal(f.jobs.get('lead-1').leaseUntil,0);assert.ok(!JSON.stringify([...f.jobs]).includes(ENV.SMTP_PASSWORD));await f.email.flush();assert.equal(f.calls.length,1);
 f.advance(61000);f.broken=false;await f.email.flush();assert.equal(f.jobs.size,0);assert.equal(f.calls[0].messageId,f.calls[1].messageId);assert.equal(f.closed,2);
});
test('unaccepted recipient is retried, and raw SMTP errors are never returned',async()=>{
 const f=fixture();f.enqueue();f.accepted=false;await f.email.flush();assert.equal(f.jobs.size,1);f.broken=true;await assert.rejects(f.email.action('test'),e=>e.status===503&&!e.message.includes(ENV.SMTP_PASSWORD)&&!e.message.includes('private SMTP'));assert.equal(f.closed,2);
});
test('expired and leased jobs are skipped; deleted orders are never mailed',async()=>{
 const f=fixture();f.enqueue();f.jobs.get('lead-1').leaseUntil=f.now()+60000;await f.email.flush();assert.equal(f.calls.length,0);f.advance(61000);f.leads.clear();await f.email.flush();assert.equal(f.calls.length,0);assert.equal(f.jobs.size,0);f.enqueue();f.advance(8*86400000);await f.email.flush();assert.equal(f.calls.length,0);
});
test('concurrent timer invocations claim a job once; each invocation processes at most one',async()=>{
 const f=fixture();f.enqueue();await Promise.all([f.email.flush(),f.email.flush()]);assert.equal(f.calls.length,1);
 f.enqueue();f.enqueue('lead-2');f.leads.set('lead-2',{...f.leads.get('lead-1'),id:'lead-2'});await f.email.flush();assert.equal(f.calls.length,2);assert.equal(f.jobs.size,1);
});
test('test send is limited and rejects unsupported actions',async()=>{const f=fixture();f.limited=true;await assert.rejects(f.email.action('test'),e=>e.status===429);await assert.rejects(f.email.action('pair'),e=>e.status===400);assert.equal(f.calls.length,0)});

test('callback without estimate and test mail have no workbook attached',async()=>{
 const f=fixture();f.leads.get('lead-1').estimate=null;f.enqueue();await f.email.flush();assert.equal(f.calls[0].attachments,undefined);assert.match(f.calls[0].html,/tel:/);await f.email.action('test');assert.equal(f.calls[1].attachments,undefined);
});
