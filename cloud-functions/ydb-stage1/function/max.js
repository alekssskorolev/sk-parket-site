'use strict';
const {randomBytes,createHash}=require('node:crypto');
const https=require('node:https');
const {readFileSync,existsSync}=require('node:fs');
const path=require('node:path');
const BOT='id781699104994_bot',API='https://platform-api2.max.ru';
const caFile=path.join(__dirname,'certs/max-root.pem');
// Trust this CA only for MAX, preserving certificate and hostname verification.
const agent=new https.Agent({keepAlive:true,maxSockets:2,...(existsSync(caFile)?{ca:readFileSync(caFile)}:{})});
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status,publicError:true})};
function maxFetch(url,options){return new Promise((resolve,reject)=>{
 let phase='dns';
 const req=https.request(url,{...options,family:4,agent},res=>{const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy();req.destroy();reject(Error('Response too large'));return}chunks.push(chunk)});res.on('error',reject);res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString('utf8'))}))});
 req.on('socket',s=>{if(!s.connecting)phase='response';s.on('lookup',()=>{phase='connect'});s.on('connect',()=>{phase='tls'});s.on('secureConnect',()=>{phase='response'})});
 req.on('error',e=>{e.safePhase=phase;reject(e)});req.end(options.body);
})}
function createMax({storage,env=process.env,fetchImpl=maxFetch,now=()=>Date.now()}){
 const ready=()=>typeof env.MAX_BOT_TOKEN==='string'&&env.MAX_BOT_TOKEN.trim().length>0?'max':false;
 async function call(route,method='GET',data){
  if(!ready())fail(503,'Токен MAX не настроен в Lockbox');
  let r,b;
  try{r=await fetchImpl(API+route,{method,headers:{Authorization:env.MAX_BOT_TOKEN,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(6000)});b=await r.json()}
  catch(e){const code=/^[A-Z_]{2,50}$/.test(e.code||'')?e.code:'NETWORK';fail(503,'Соединение с MAX недоступно (этап: '+(e.safePhase||'ответ')+', код: '+code+').')}
  if(!r.ok){const error=Object.assign(Error(r.status===401?'MAX отклонил токен. Проверьте секрет Lockbox.':r.status===403?'MAX запретил действие. Откройте бота и начните диалог.':'MAX временно не принял запрос (HTTP '+Number(r.status)+').'),{status:503,publicError:true});if(r.status===429)error.retryAfter=60;throw error}
  return b;
 }
 async function status(){const s=await storage.maxSettings();return {ready:!!ready(),connected:!!s?.userId,bot:BOT,pending:(await storage.maxPending()).filter(j=>j.provider==='max').length}}
 async function send(userId,test=false){
  if(!await storage.limit('max-send',2,1000,now()))throw Object.assign(Error('MAX: повторите через секунду'),{retryAfter:1});
  return call('/messages?user_id='+encodeURIComponent(userId),'POST',{text:test?'SK Паркет: проверка уведомлений MAX. Новая заявка не создавалась.':'Новая заявка на сайте SK Паркет. Откройте защищённую админку, чтобы посмотреть обращение.',attachments:[{type:'inline_keyboard',payload:{buttons:[[{type:'link',text:'Открыть заявки',url:env.ADMIN_ORIGIN+'/admin'}]]}}]});
 }
 async function action(action){
  if(action==='diagnose'){if(!await storage.limit('max-diagnose',12,3600000,now()))fail(429,'Повторите проверку позже');const me=await call('/me');return {ok:true,bot:me.username,correctBot:me.username?.toLowerCase()===BOT}}
  if(action==='pair'){
   if(!await storage.limit('max-pair',10,3600000,now()))fail(429,'Повторите подключение через час');
   const me=await call('/me');if(me.username?.toLowerCase()!==BOT)fail(409,'Токен принадлежит другому боту MAX');
   const subscriptions=await call('/subscriptions');if(!Array.isArray(subscriptions.subscriptions))fail(503,'MAX вернул неожиданный ответ');
   if(subscriptions.subscriptions.length)fail(409,'У бота MAX уже подключён другой сервис. Настройки не изменены.');
   // Read a cursor only during explicit admin setup; no background polling of messages.
   const snapshot=await call('/updates?timeout=0&limit=100');
   const code=randomBytes(24).toString('base64url');
   await storage.maxChange(s=>({value:{...s,pairHash:hash(code),pairExpires:now()+600000,pairSince:now()-5000,marker:snapshot.marker??null},result:true}));
   return {url:'https://max.ru/'+BOT+'?start='+code,code,expiresIn:600};
  }
  if(action==='confirm'){
   const s=await storage.maxSettings();if(!s?.pairHash||s.pairExpires<=now())fail(409,'Ссылка истекла. Создайте новую.');
   if(!await storage.limit('max-confirm',60,3600000,now()))fail(429,'Повторите проверку позже');
   const r=await call('/updates?timeout=0&limit=100'+(s.marker!==null?'&marker='+encodeURIComponent(s.marker):''));
   if(!Array.isArray(r.updates))fail(503,'MAX вернул неожиданный ответ');
   let userId;
   for(const u of r.updates){
    let code,user;
    if(u.update_type==='bot_started'){code=u.payload;user=u.user}
    if(u.update_type==='message_created'&&u.message?.recipient?.chat_type==='dialog'){code=u.message.body?.text?.match(/^\/start ([A-Za-z0-9_-]{32})$/)?.[1];user=u.message.sender}
    if(u.timestamp>=s.pairSince&&typeof code==='string'&&hash(code)===s.pairHash&&Number.isSafeInteger(user?.user_id)&&!user.is_bot){userId=String(user.user_id);break}
   }
   const connected=await storage.maxChange(current=>{
    if(current?.pairHash!==s.pairHash||current.pairExpires<=now())return {result:false};
    return {value:userId?{userId,connectedAt:now()}:{...current,marker:r.marker??s.marker},result:!!userId};
   });
   if(!connected)return {connected:false,message:'Откройте ссылку в MAX и нажмите «Начать». Если диалог уже открыт, отправьте боту указанную команду /start с кодом, затем повторите проверку.'};
   try{await send(userId,true);return {connected:true,testSent:true}}catch{return {connected:true,testSent:false}}
  }
  if(action==='test'){const s=await storage.maxSettings();if(!s?.userId)fail(409,'Сначала подключите личный чат MAX');if(!await storage.limit('max-test',12,3600000,now()))fail(429,'Повторите проверку позже');await send(s.userId,true);return {ok:true}}
  fail(400,'Неизвестное действие MAX');
 }
 async function flush(max=1){
  if(!ready())return;const s=await storage.maxSettings();if(!s?.userId)return;
  const jobs=(await storage.maxPending()).filter(j=>j.provider==='max');let sent=0;
  for(const job of jobs){if(sent>=max)break;if(job.next>now()||job.leaseUntil>now()||job.expires<=now())continue;
   const lease=randomBytes(16).toString('hex');const claimed=await storage.maxJob(job.id,p=>{
    if(!p||p.provider!=='max'||p.expires<=now()||p.next>now()||p.leaseUntil>now())return {result:false};
    return {value:{...p,lease,leaseUntil:now()+60000,attempts:p.attempts+1},result:true};
   });if(!claimed)continue;sent++;
   try{await send(s.userId);await storage.maxJob(job.id,p=>p?.lease===lease?{value:null,result:true}:{result:false})}
   catch(e){await storage.maxJob(job.id,p=>p?.lease===lease?{value:{...p,leaseUntil:0,next:now()+Math.max(e.retryAfter||0,Math.min(3600,30*2**Math.min(p.attempts,7)))*1000},result:true}:{result:false})}
  }
 }
 return {ready,status,action,flush};
}
module.exports={createMax};
