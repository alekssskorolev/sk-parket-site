'use strict';
const {randomBytes,createHash}=require('node:crypto');
const https=require('node:https');
const telegramAgent=new https.Agent({keepAlive:true,maxSockets:4});
// Explicit IPv4 avoids Node 22 fetch/IPv6 stalls on serverless egress. TLS hostname verification stays enabled.
function telegramFetch(url,options){return new Promise((resolve,reject)=>{let phase='dns';const req=https.request(url,{method:'POST',headers:options.headers,signal:options.signal,family:4,agent:telegramAgent},res=>{const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>2097152){res.destroy();req.destroy();reject(Error('Response too large'));return}chunks.push(chunk)});res.on('error',reject);res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString('utf8'))}))});req.on('socket',socket=>{if(!socket.connecting)phase='tls';socket.on('lookup',()=>{phase='connect'});socket.on('connect',()=>{phase='tls-handshake'});socket.on('secureConnect',()=>{phase='response'})});req.on('error',e=>{e.safePhase=phase;reject(e)});req.end(options.body)})}
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status,publicError:true})};
// Timer invocations are raw, authenticated platform events, never HTTP/gateway requests.
function isTimerEvent(e){return !e.httpMethod&&!e.headers&&!e.path&&Array.isArray(e.messages)&&e.messages.length===1&&e.messages[0]?.event_metadata?.event_type==='yandex.cloud.events.serverless.triggers.TimerMessage'&&e.messages[0]?.event_metadata?.folder_id==='b1g5jvictf4s63dq76k4'}
function createTelegram({storage,env=process.env,fetchImpl=telegramFetch,now=()=>Date.now()}){
 const ready=()=>typeof env.TELEGRAM_BOT_TOKEN==='string'&&/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN);
 async function call(method,data={}){
  if(!ready())fail(503,'Токен Telegram не настроен в Lockbox');
  let r,b;try{r=await fetchImpl('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(4500)});try{b=await r.json()}catch{fail(503,'Telegram вернул неожиданный ответ (HTTP '+r.status+').')}}catch(e){if(e.publicError)throw e;const codes=[e.code,e.cause?.code,...(e.cause?.errors||[]).map(x=>x.code)].filter(x=>typeof x==='string'&&/^[A-Z_]{2,40}$/.test(x));const reason=(e.name==='TimeoutError'||e.name==='AbortError'?'тайм-аут':codes.join(', ')||'сетевая ошибка')+(e.safePhase?' / '+e.safePhase:'');fail(503,'Соединение с Telegram недоступно ('+reason+'). Повторите позже.');}
  // Never expose Telegram's raw errors, request URLs, update payloads or credentials.
  if(!r.ok||b.ok!==true){const error=Object.assign(Error(b.error_code===403?'Бот не может написать в этот чат. Разблокируйте его и нажмите «Старт».':'Telegram отклонил запрос. Проверьте токен и повторите позже.'),{status:503,publicError:true});if(b.error_code===429)error.retryAfter=Math.min(86400,Math.max(60,Number(b.parameters?.retry_after)||60));throw error}
  return b.result;
 }
 async function status(){const s=await storage.telegramSettings();return {transport:'https-ipv4-v1',proxyConfigured:!!(env.HTTPS_PROXY||env.https_proxy),ready:ready(),connected:!!s?.chatId,bot:'skparket_bot',pending:(await storage.telegramPending()).length,pairing:!!(s?.pairHash&&s.pairExpires>now())}}
 async function send(chatId,test=false){return call('sendMessage',{chat_id:chatId,text:test?'SK Паркет: проверка уведомлений. Новая заявка не создавалась.':'Новая заявка на сайте SK Паркет. Откройте защищённую админку, чтобы посмотреть обращение.',protect_content:true,reply_markup:{inline_keyboard:[[{text:'Открыть заявки',url:env.ADMIN_ORIGIN+'/admin'}]]}})}
 async function action(action){
  if(action==='diagnose'){
   if(!await storage.limit('telegram-diagnose',12,3600000,now()))fail(429,'Повторите проверку соединения позже');
   const result={transport:'https-ipv4-v1'};
   for(const [key,url] of [['telegram','https://api.telegram.org/'],['external','https://example.com/']]){
    try{const r=await telegramFetch(url,{headers:{},signal:AbortSignal.timeout(4500)});result[key]={reachable:true,status:r.status}}
    catch(e){result[key]={reachable:false,phase:e.safePhase||'unknown',code:/^[A-Z_]{2,40}$/.test(e.code||'')?e.code:'NETWORK'}}
   }return result;
  }
  if(action==='pair'){
   if(!await storage.limit('telegram-pair',10,3600000,now()))fail(429,'Слишком много попыток подключения. Повторите через час.');
   const me=await call('getMe');if(me.username?.toLowerCase()!=='skparket_bot')fail(409,'Этот токен принадлежит другому боту. Нужен @skparket_bot.');
   if((await call('getWebhookInfo')).url)fail(409,'У бота уже подключён другой сервис (webhook). Подключение не изменено.');
   const code=randomBytes(24).toString('base64url');await storage.telegramChange(s=>({value:{...s,pairHash:hash(code),pairExpires:now()+600000,pairSince:Math.floor(now()/1000)-5,offset:null},result:true}));
   return {url:'https://t.me/skparket_bot?start='+code,expiresIn:600};
  }
  if(action==='confirm'){
   let s=await storage.telegramSettings();if(!s?.pairHash||s.pairExpires<=now())fail(409,'Ссылка подключения истекла. Создайте новую.');
   // Only a private /start message containing the one-time code can bind a recipient.
   const updates=await call('getUpdates',{timeout:0,limit:100,...(s.offset!==null?{offset:s.offset}:{})});
   const match=updates.find(u=>{const m=u.message,code=m?.text?.match(/^\/start(?:@skparket_bot)? ([A-Za-z0-9_-]{32})$/i)?.[1];return m?.chat?.type==='private'&&m.from?.id===m.chat.id&&m.date>=s.pairSince&&code&&hash(code)===s.pairHash});
   const offset=updates.length?Math.max(...updates.map(u=>u.update_id))+1:s.offset;
   const connected=await storage.telegramChange(current=>{
    if(current?.pairHash!==s.pairHash||current.pairExpires<=now())return {result:false};
    return {value:match?{chatId:String(match.message.chat.id),connectedAt:now()}:{...current,offset},result:!!match};
   });
   if(!connected)return {connected:false,message:'Откройте ссылку, нажмите «Старт» в личном чате с ботом и повторите проверку.'};
   // Settings commit first; a temporary send failure does not lose the confirmed recipient.
   try{await send(String(match.message.chat.id),true)}catch{return {connected:true,testSent:false}}
   return {connected:true,testSent:true};
  }
  if(action==='test'){const s=await storage.telegramSettings();if(!s?.chatId)fail(409,'Сначала подключите личный чат');if(!await storage.limit('telegram-test',12,3600000,now()))fail(429,'Повторите проверку позже');await send(s.chatId,true);return {ok:true}}
  fail(400,'Неизвестное действие Telegram');
 }
 async function flush(max=3){
  if(!ready())return;const s=await storage.telegramSettings();if(!s?.chatId)return;
  const jobs=await storage.telegramPending();let sent=0;
  for(const job of jobs){if(sent>=max)break;if(job.next>now()||job.leaseUntil>now()||job.expires<=now())continue;
   const lease=randomBytes(16).toString('hex');const claimed=await storage.telegramJob(job.id,p=>{
    if(!p||p.expires<=now()||p.next>now()||p.leaseUntil>now())return {result:false};
    return {value:{...p,lease,leaseUntil:now()+60000,attempts:p.attempts+1},result:true};
   });if(!claimed)continue;sent++;
   try{await send(s.chatId);await storage.telegramJob(job.id,p=>p?.lease===lease?{value:null,result:true}:{result:false})}
   catch(e){await storage.telegramJob(job.id,p=>p?.lease===lease?{value:{...p,leaseUntil:0,next:now()+Math.max(e.retryAfter||0,Math.min(3600,30*2**Math.min(p.attempts,7)))*1000},result:true}:{result:false})}
  }
 }
 return {ready,status,action,flush};
}
module.exports={createTelegram,isTimerEvent};
