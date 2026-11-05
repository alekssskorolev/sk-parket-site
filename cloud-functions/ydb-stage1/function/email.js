'use strict';
const {randomBytes,createHash}=require('node:crypto');
const nodemailer=require('nodemailer');
const address=x=>typeof x==='string'&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(x)&&x.length<=254;
const fail=(status,message)=>{throw Object.assign(Error(message),{status,publicError:true})};
function leadText(lead,origin){
 const lines=['Новая заявка на сайте SK Паркет.','','Номер: '+lead.id,'Имя: '+(lead.name||'Не указано'),'Телефон: +'+lead.phone,'Комментарий: '+(lead.comment||'Не указан')];
 if(lead.estimate){const e=lead.estimate;lines.push('','Предварительный расчёт:');if(e.area!==undefined)lines.push('Площадь: '+e.area+' м²');if(Array.isArray(e.total))lines.push('Стоимость: '+e.total.map(x=>Number(x).toLocaleString('ru-RU')).join(' — ')+' ₽');}
 lines.push('','Открыть заявки: '+origin+'/admin');return lines.join('\n');
}
function createEmail({storage,env=process.env,createTransport=nodemailer.createTransport,now=()=>Date.now()}){
 const ready=()=>env.EMAIL_ENABLED==='true'&&address(env.EMAIL_TO)&&address(env.SMTP_USER)&&/@(?:mail|bk|list|inbox|internet)\.ru$/i.test(env.SMTP_USER)&&typeof env.SMTP_PASSWORD==='string'&&env.SMTP_PASSWORD.length>0&&/^https:\/\/[a-z0-9.-]+$/.test(env.ADMIN_ORIGIN||'');
 async function send(lead){
  if(!ready())fail(503,'Почта не подключена. Настройте пароль приложения в Lockbox.');
  const transport=createTransport({host:'smtp.mail.ru',port:465,secure:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:3000,greetingTimeout:3000,socketTimeout:5000,dnsTimeout:2000,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
  try{
   const id=lead?createHash('sha256').update(lead.id).digest('hex'):randomBytes(16).toString('hex');
   const result=await transport.sendMail({from:{name:'SK Паркет',address:env.SMTP_USER},to:env.EMAIL_TO,subject:lead?'Новая заявка — SK Паркет':'Проверка почты — SK Паркет',messageId:'<skparket-'+id+'@'+env.SMTP_USER.split('@')[1]+'>',text:lead?leadText(lead,env.ADMIN_ORIGIN):'SK Паркет: проверка уведомлений. Новая заявка не создавалась.\n\nОткрыть заявки: '+env.ADMIN_ORIGIN+'/admin'});
   if(!result.accepted?.some(x=>String(x).toLowerCase()===env.EMAIL_TO.toLowerCase()))throw Error('Not accepted');
  }catch{fail(503,'Почтовый сервер не принял письмо. Проверьте пароль приложения и повторите позже.');}
  finally{transport.close();}
 }
 async function status(){return {ready:ready(),recipient:env.EMAIL_TO||null,sender:env.SMTP_USER||null,pending:(await storage.emailPending()).length}}
 async function action(action){
  if(action!=='test')fail(400,'Неизвестное действие почты');
  if(!await storage.limit('email-test',12,3600000,now()))fail(429,'Повторите проверку почты позже');
  await send(null);return {ok:true};
 }
 // Only the private timer sends queued mail; SMTP latency never delays accepting a lead.
 async function flush(max=1){
  if(!ready())return;let processed=0;
  for(const job of await storage.emailPending()){
   if(processed>=max)break;if(job.next>now()||job.leaseUntil>now()||job.expires<=now())continue;
   const lease=randomBytes(16).toString('hex');
   const claimed=await storage.emailJob(job.id,p=>{
    if(!p||p.expires<=now()||p.next>now()||p.leaseUntil>now())return {result:false};
    return {value:{...p,lease,leaseUntil:now()+60000,attempts:p.attempts+1},result:true};
   });if(!claimed)continue;processed++;
   try{
    const lead=await storage.getLead(job.id);if(lead)await send(lead);
    await storage.emailJob(job.id,p=>p?.lease===lease?{value:null,result:true}:{result:false});
   }catch{
    await storage.emailJob(job.id,p=>p?.lease===lease?{value:{...p,leaseUntil:0,next:now()+Math.min(3600,30*2**Math.min(p.attempts,7))*1000},result:true}:{result:false});
   }
  }
 }
 return {ready,status,action,flush};
}
module.exports={createEmail,leadText};
