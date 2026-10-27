const {test}=require('node:test');const assert=require('node:assert/strict');
const {createMax}=require('../function/max');
function fixture(){let settings=null,t=1700000000000,updates=[],failure=false;const calls=[],jobs=new Map();
 const storage={maxSettings:async()=>structuredClone(settings),maxChange:async fn=>{const r=fn(structuredClone(settings));if(r.value!==undefined)settings=r.value;return r.result},limit:async()=>true,maxPending:async()=>[...jobs].map(([id,p])=>({id,...p})),maxJob:async(id,fn)=>{const r=fn(structuredClone(jobs.get(id)||null));if(r.value===null)jobs.delete(id);else if(r.value!==undefined)jobs.set(id,r.value);return r.result}};
 const token='fake-max-token-for-tests';
 const fetchImpl=async(url,options)=>{assert.equal(options.headers.Authorization,token);assert(!url.includes(token));const u=new URL(url);calls.push({url:u,options});if(failure)throw Error('credential '+token);return {ok:true,status:200,json:async()=>u.pathname==='/me'?{username:'id781699104994_bot'}:u.pathname==='/subscriptions'?{subscriptions:[]}:u.pathname==='/updates'?{updates,marker:123}:{message:{body:{mid:'test'}}}}};
 const max=createMax({storage,env:{MAX_BOT_TOKEN:token,ADMIN_ORIGIN:'https://admin.example'},fetchImpl,now:()=>t});
 return {max,storage,jobs,calls,get settings(){return settings},set settings(s){settings=s},set updates(u){updates=u},set failure(v){failure=v},advance:n=>t+=n,now:()=>t};
}
test('MAX binds only a fresh matching code to a human and consumes it once',async()=>{
 const f=fixture(),p=await f.max.action('pair'),code=new URL(p.url).searchParams.get('start');assert.equal(code,p.code);assert(!JSON.stringify(f.settings).includes(code));
 f.updates=[{update_type:'bot_started',timestamp:f.now(),payload:'wrong',user:{user_id:7,is_bot:false}}];assert.equal((await f.max.action('confirm')).connected,false);
 f.updates=[{update_type:'bot_started',timestamp:f.now(),payload:code,user:{user_id:7,is_bot:true}}];assert.equal((await f.max.action('confirm')).connected,false);
 f.updates=[{update_type:'message_created',timestamp:f.now(),message:{recipient:{chat_type:'chat'},sender:{user_id:8},body:{text:'/start '+code}}}];assert.equal((await f.max.action('confirm')).connected,false);
 f.updates=[{update_type:'bot_started',timestamp:f.now(),payload:code,user:{user_id:7,is_bot:false}}];assert.equal((await f.max.action('confirm')).connected,true);assert.equal(f.settings.userId,'7');await assert.rejects(f.max.action('confirm'),/истекла/);
 const send=f.calls.find(x=>x.url.pathname==='/messages');assert.equal(send.url.searchParams.get('user_id'),'7');assert.equal(send.options.method,'POST');assert(JSON.parse(send.options.body).text.includes('проверка'));
});
test('expired MAX pairing preserves the recipient and errors never expose the token',async()=>{
 const f=fixture();f.settings={userId:'old'};await f.max.action('pair');f.advance(600001);await assert.rejects(f.max.action('confirm'),/истекла/);assert.equal(f.settings.userId,'old');f.failure=true;await assert.rejects(f.max.action('diagnose'),e=>e.publicError&&!e.message.includes('fake-max-token'));
});
test('MAX queue retries durable jobs, isolates Telegram jobs, and leases concurrent workers',async()=>{
 const f=fixture();f.settings={userId:'7'};const job={expires:f.now()+86400000,attempts:0,next:0,leaseUntil:0};f.jobs.set('telegram',{...job,provider:'telegram'});f.jobs.set('max',{...job,provider:'max'});
 f.failure=true;await f.max.flush();assert.equal(f.jobs.get('max').attempts,1);assert.equal(f.jobs.get('telegram').attempts,0);
 f.advance(61000);f.failure=false;await Promise.all([f.max.flush(),f.max.flush()]);assert(!f.jobs.has('max'));assert(f.jobs.has('telegram'));const sends=f.calls.filter(x=>x.url.pathname==='/messages');assert.equal(sends.length,2);const message=JSON.parse(sends.at(-1).options.body);assert.equal(message.attachments[0].payload.buttons[0][0].url,'https://admin.example/admin');assert(!message.text.includes('Телефон'));
});
test('MAX token absence never drains queue or starts pairing',async()=>{const f=fixture();const max=createMax({storage:f.storage,env:{}});assert.equal(max.ready(),false);await max.flush();await assert.rejects(max.action('pair'),/Lockbox/)});
