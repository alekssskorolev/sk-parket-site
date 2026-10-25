'use strict';
const fs=require('node:fs');const path=require('node:path');
const {randomBytes,createHash,scrypt,timingSafeEqual}=require('node:crypto');const {promisify}=require('node:util');
const derive=promisify(scrypt);const digest=x=>createHash('sha256').update(x).digest('hex');
const AGE=8*3600;const COOKIE='__Secure-sk_admin';
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const token=()=>randomBytes(32).toString('hex');
const SAFE={
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function createAdminHandler({storage,env=process.env,validateConfig,now=()=>Date.now()}){
 let verifier;
 const cookie=(value,age)=>`${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
 function passwordReady(){return typeof env.ADMIN_PASSWORD==='string'&&env.ADMIN_PASSWORD.length>=14&&env.ADMIN_PASSWORD.length<=256}
 async function validPassword(password){
  if(!passwordReady())return false;
  verifier||=(async()=>{const salt=randomBytes(16);return {salt,value:await derive(env.ADMIN_PASSWORD,salt,64)}})();
  const v=await verifier;return timingSafeEqual(await derive(password,v.salt,64),v.value);
 }
 return async function admin(event,context){
  const route=event.queryStringParameters?.route||event.path||event.rawPath||'/health';
  const method=String(event.httpMethod||'GET').toUpperCase();
  const assets={'/admin':'admin.html','/admin/':'admin.html','/admin.html':'admin.html','/admin.js':'admin.js','/admin.css':'admin.css','/engine.js':'engine.js','/lead-export.js':'lead-export.js','/notifications-sw.js':'notifications-sw.js'};
  if(!assets[route]&&!['/api/login','/api/session','/api/logout'].includes(route)&&!route.startsWith('/api/admin/'))return null;
  const h=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));const out={...SAFE,'Content-Type':'application/json; charset=utf-8'};
  const reply=(statusCode,body)=>({statusCode,headers:out,body:JSON.stringify(body)});
  const json=(max=262144)=>{
   if(!/^application\/json(?:\s*;|$)/i.test(h['content-type']||''))fail(415,'Нужен JSON');
   if(typeof event.body!=='string'||event.body.length>max*2)fail(413,'Слишком большой запрос');
   const bytes=Buffer.from(event.body,event.isBase64Encoded?'base64':'utf8');if(bytes.length>max)fail(413,'Слишком большой запрос');
   let p;try{p=JSON.parse(bytes.toString())}catch{fail(400,'Неверный JSON')}
   if(!p||typeof p!=='object'||Array.isArray(p))fail(400,'Нужен JSON-объект');return p;
  };
  try{
   // Only expose the admin on an isolated API Gateway origin, never the shared Functions host.
   const origin=env.ADMIN_ORIGIN;const goodOrigin=typeof origin==='string'&&/^https:\/\/[a-z0-9.-]+$/.test(origin)&&!origin.includes('functions.yandexcloud.net');
   if(!goodOrigin||!passwordReady())fail(503,'Админка ещё настраивается');
   if(h.host!==new URL(origin).host)fail(403,'Используйте защищённый адрес админки');
   if(h.origin&&h.origin!==origin)fail(403,'Запрос с другого сайта запрещён');
   const write=!['GET','HEAD'].includes(method);
   if(write&&h.origin!==origin)fail(403,'Запрос с другого сайта запрещён');
   if(assets[route]&&['GET','HEAD'].includes(method)){
    const ext=path.extname(assets[route]);out['Content-Type']=({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[ext]+'; charset=utf-8';
    return {statusCode:200,headers:out,body:method==='HEAD'?'':fs.readFileSync(path.join(__dirname,'admin-public',assets[route]),'utf8')};
   }
   if(route==='/api/login'&&method==='POST'){
    const ip=event.requestContext?.identity?.sourceIp;
    // API Gateway source IP is trusted; X-Forwarded-For from the client is never used.
    const bucket='login:'+digest(String(ip||'unknown'))+':'+Math.floor(now()/900000);
    if(!await storage.limit(bucket,8,900000,now())||!await storage.limit('login-global:'+Math.floor(now()/900000),80,900000,now()))fail(429,'Слишком много попыток. Повторите через 15 минут.');
    const b=json(4096);if(typeof b.password!=='string'||b.password.length>256)fail(400,'Проверьте пароль');
    if(!await validPassword(b.password))fail(401,'Неверный пароль');
    const value=token(),csrf=token();await storage.putSession(digest(value),{csrf,expires:now()+AGE*1000,credential:digest(env.ADMIN_PASSWORD)});
    out['Set-Cookie']=cookie(value,AGE);return reply(200,{csrf});
   }
   const value=(h.cookie||'').match(/(?:^|;\s*)__Secure-sk_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
   const s=value?await storage.getSession(digest(value)):null;
   if(!s||s.expires<=now()||s.credential!==digest(env.ADMIN_PASSWORD))fail(401,'Войдите в админку');
   if(write&&(typeof h['x-csrf-token']!=='string'||h['x-csrf-token']!==s.csrf))fail(403,'Обновите страницу и повторите действие');
   if(route==='/api/session'&&method==='GET')return reply(200,{csrf:s.csrf});
   if(route==='/api/logout'&&method==='POST'){await storage.deleteSession(digest(value));out['Set-Cookie']=cookie('',0);return reply(200,{ok:true})}
   if(route==='/api/admin/config'&&method==='GET')return reply(200,await storage.state());
   if(route==='/api/admin/config'&&method==='PUT'){
    const b=json();try{validateConfig(b.config)}catch{fail(422,'Проверьте настройки цен')}
    await storage.changeState(b.revision,p=>({...p,draft:b.config}));return reply(200,await storage.state());
   }
   if(route==='/api/admin/publish'&&method==='POST'){
    const b=json();await storage.changeState(b.revision,p=>{validateConfig(p.draft);const version=p.published.version+1,created=new Date(now()).toISOString();return {...p,published:{version,updated:created,config:p.draft},history:[{id:version,created,config:p.draft},...p.history].slice(0,20)}});return reply(200,await storage.state());
   }
   if(route==='/api/admin/restore'&&method==='POST'){
    const b=json();await storage.changeState(b.revision,p=>{const v=p.history.find(x=>x.id===b.version);if(!v)fail(404,'Версия не найдена');return {...p,draft:v.config}});return reply(200,await storage.state());
   }
   if(route==='/api/admin/leads'&&method==='GET'){
    const before=event.queryStringParameters?.before;if(before&&(!/^[A-Za-z0-9_-]{1,512}$/.test(before)))fail(400,'Неверная страница');return reply(200,await storage.list(before));
   }
   const m=route.match(/^\/api\/admin\/leads\/([a-zA-Z0-9_-]{1,100})$/);
   if(m){const id=m[1],lead=await storage.getLead(id);if(!lead)fail(404,'Заявка не найдена');
    if(method==='GET')return reply(200,lead);
    if(method==='PATCH'){const b=json(10000);if(!['new','progress','closed'].includes(b.status)||typeof b.note!=='string'||b.note.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(b.note))fail(422,'Проверьте статус и заметку');await storage.updateLead(id,b.status,b.note);return reply(200,{ok:true})}
    if(method==='DELETE'){await storage.deleteLead(id);return reply(200,{ok:true})}
   }
   fail(404,'Не найдено');
  }catch(e){const status=Number.isInteger(e.status)&&e.status>=400&&e.status<500?e.status:503;return reply(status,{error:status===503?'Сервис временно недоступен. Повторите позже.':e.message})}
 };
}
module.exports={createAdminHandler,digest};
