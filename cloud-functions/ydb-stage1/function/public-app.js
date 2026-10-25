'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {checkedSelection}=require('./app');
const PUBLIC_ORIGIN='https://alekssskorolev.github.io';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status,publicError:true})};
function intakeEnabled(env){return env.LEADS_ENABLED==='true'&&env.PRIVACY_OPERATOR_CONFIRMED==='yes'&&/^[a-zA-Z0-9_-]{3,80}$/.test(env.CONSENT_VERSION||'')}
function readJson(event,headers){
 if(!/^application\/json(?:\s*;|$)/i.test(headers['content-type']||''))fail(415,'Нужен JSON');
 if(typeof event.body!=='string'||event.body.length>65536)fail(413,'Слишком большой запрос');
 const bytes=Buffer.from(event.body,event.isBase64Encoded?'base64':'utf8');if(bytes.length>32768)fail(413,'Слишком большой запрос');
 let b;try{b=JSON.parse(bytes.toString())}catch{fail(400,'Неверный JSON')}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Нужен JSON-объект');return b;
}
function createPublicHandler({storage,env=process.env,calculate,now=()=>new Date(),makeId=()=>randomUUID()}){
 return async(event={})=>{
  const route=event.queryStringParameters?.route||event.path||event.rawPath||'/health';if(!['/api/config','/api/leads'].includes(route))return null;
  const method=String(event.httpMethod||'GET').toUpperCase(),headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  const origin=headers.origin,out={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  const allowed=origin===PUBLIC_ORIGIN||origin===env.ADMIN_ORIGIN;if(allowed)out['Access-Control-Allow-Origin']=origin;
  const reply=(statusCode,result)=>({statusCode,headers:out,body:statusCode===204?'':JSON.stringify(result)});
  try{
   if(origin&&!allowed)fail(403,'Запрос с другого сайта запрещён');
   if(method==='OPTIONS'){
    if(!allowed)fail(403,'Источник не разрешён');
    out['Access-Control-Allow-Methods']='GET, POST, OPTIONS';out['Access-Control-Allow-Headers']='Content-Type';out['Access-Control-Max-Age']='600';return reply(204,null);
   }
   const enabled=intakeEnabled(env);
   if(route==='/api/config'&&method==='GET')return reply(200,{...await storage.current(),leadsEnabled:enabled,photosEnabled:false,consentVersion:enabled?env.CONSENT_VERSION:null});
   if(route!=='/api/leads'||method!=='POST')fail(405,'Метод не поддерживается');
   if(!allowed)fail(403,'Источник не разрешён');
   if(!enabled)fail(503,'Приём заявок пока выключен: документы по персональным данным готовятся. Реальные контакты не отправляйте.');
   const b=readJson(event,headers);if(b.website)fail(400,'Не удалось принять заявку');
   if(typeof b.name!=='string'||b.name.length>100||/[\u0000-\u001f\u007f]/.test(b.name))fail(422,'Имя — до 100 символов');
   if(typeof b.phone!=='string'||!/^\+?[\d ()-]{10,25}$/.test(b.phone))fail(422,'Проверьте телефон');
   let phone=b.phone.replace(/\D/g,'');if(phone.length===10)phone='7'+phone;if(phone.length===11&&phone[0]==='8')phone='7'+phone.slice(1);if(!/^7\d{10}$/.test(phone))fail(422,'Проверьте телефон');
   if(typeof b.comment!=='string'||b.comment.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(b.comment))fail(422,'Комментарий — до 2000 символов');
   if(b.consent!==true||typeof b.consentVersion!=='string')fail(422,'Нужно согласие на обработку данных');
   if(b.photos!==undefined&&(!Array.isArray(b.photos)||b.photos.length))fail(422,'Фотографии пока не подключены. Уберите вложения и отправьте заявку заново.');
   if(typeof b.requestId!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i).test(b.requestId))fail(422,'Обновите страницу и повторите отправку');
   const selection=b.selection===undefined?null:checkedSelection(b.selection);
   const normalized={name:b.name.trim(),phone,comment:b.comment,consentVersion:b.consentVersion,selection,version:selection?b.version:null};
   const requestId=b.requestId.toLowerCase(),fingerprint=hash(JSON.stringify(normalized));
   // Recover an already committed submission even if prices changed since the lost response.
   const existing=await storage.lookupRequest(requestId);
   if(existing&&existing.expires>+now()){
    if(existing.fingerprint!==fingerprint)fail(409,'Данные заявки изменились. Начните новую отправку.');return reply(200,{ok:true,id:existing.id,duplicate:true});
   }
   if(b.consentVersion!==env.CONSENT_VERSION)fail(409,'Текст согласия обновился. Обновите страницу и подтвердите его заново.');
   const date=now(),ip=String(event.requestContext?.identity?.sourceIp||'unknown');
   if(!await storage.limit('leads-ip:'+hash(ip)+':'+Math.floor(+date/3600000),8,3600000,+date)||!await storage.limit('leads-global:'+Math.floor(+date/3600000),150,3600000,+date))fail(429,'Слишком много обращений. Попробуйте позже.');
   const current=await storage.current();let estimate=null;
   if(selection){if(b.version!==current.version)fail(409,'Цены обновились. Пересчитайте стоимость перед отправкой.');estimate={...calculate(current.config,selection),priceVersion:current.version}}
   const order={id:makeId(),created:date,name:normalized.name,phone,comment:normalized.comment,estimate,consentVersion:env.CONSENT_VERSION};
   const saved=await storage.insertLeadOnce(order,requestId,fingerprint,+date+7*86400000);
   return reply(saved.created?201:200,{ok:true,id:saved.id,duplicate:!saved.created});
  }catch(e){const clientError=Number.isInteger(e.status)&&e.status>=400&&e.status<500;const status=e.publicError||clientError?e.status:503;return reply(status,{ok:false,error:e.publicError||clientError?e.message:'Не удалось подтвердить сохранение. Повторите отправку — повторная заявка не создастся.'})}
 };
}
module.exports={createPublicHandler,intakeEnabled};
