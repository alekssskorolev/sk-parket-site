import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {validateConfig,calculate} from './public/engine.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const env=process.env,port=Number(env.PORT||3000),host=env.HOST||'127.0.0.1',origin=env.PUBLIC_ORIGIN||`http://localhost:${port}`,production=env.NODE_ENV==='production';
const secret=env.ADMIN_PASSWORD_HASH||'';
if(!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(secret))throw Error('Настройте ADMIN_PASSWORD_HASH: npm run setup');
if(new URL(origin).origin!==origin||production&&!origin.startsWith('https://'))throw Error('PUBLIC_ORIGIN должен содержать точный адрес сайта, в production — HTTPS');
const leadsEnabled=env.LEADS_ENABLED==='true';
if(leadsEnabled&&(!env.PRIVACY_OPERATOR_CONFIRMED||env.PRIVACY_OPERATOR_CONFIRMED!=='yes'))throw Error('Для приёма заявок сначала оформите документы и установите PRIVACY_OPERATOR_CONFIRMED=yes');
const data=path.resolve(root,env.DATA_DIR||'data');mkdirSync(data,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(data,'parket.sqlite'));db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL, config TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS draft (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL, phone TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', version INTEGER, estimate TEXT, consent_version TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE, content BLOB NOT NULL, mime TEXT NOT NULL);
`);
if(!db.prepare('PRAGMA table_info(leads)').all().some(x=>x.name==='name'))db.exec("ALTER TABLE leads ADD COLUMN name TEXT NOT NULL DEFAULT ''");
if(!db.prepare('SELECT id FROM versions LIMIT 1').get()){
 const seed=validateConfig(JSON.parse(readFileSync(path.join(root,'config.seed.json'),'utf8')));
 db.prepare('INSERT INTO versions(created,config) VALUES(?,?)').run(new Date().toISOString(),JSON.stringify(seed));db.prepare('INSERT INTO draft VALUES(1,?,1)').run(JSON.stringify(seed));
}
function current(){const v=db.prepare('SELECT * FROM versions ORDER BY id DESC LIMIT 1').get();return {version:v.id,updated:v.created,config:JSON.parse(v.config)}}
function state(){const d=db.prepare('SELECT * FROM draft WHERE id=1').get();return {draft:JSON.parse(d.config),revision:d.revision,published:current(),history:db.prepare('SELECT id,created FROM versions ORDER BY id DESC LIMIT 20').all()}}
const hash=s=>createHash('sha256').update(s).digest('hex');
const limits=new Map();
function limited(req,key,max,ms){const ip=env.TRUST_PROXY==='true'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress,k=key+':'+ip;let r=limits.get(k);if(!r||r.until<Date.now()){r={count:0,until:Date.now()+ms};limits.set(k,r)}return ++r.count>max}
const timer=setInterval(()=>{for(const [k,v] of limits)if(v.until<Date.now())limits.delete(k);db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())},60000);timer.unref();
function fail(status,message){const e=new Error(message);e.status=status;throw e}
function session(req){const m=(req.headers.cookie||'').match(/(?:^|;\s*)sk_session=([a-f0-9]{64})(?:;|$)/);if(!m)return null;const s=db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(m[1]),Date.now());return s||null}
function auth(req,write=false){const s=session(req);if(!s)fail(401,'Войдите в админку');if(write&&req.headers['x-csrf-token']!==s.csrf)fail(403,'Обновите страницу и повторите действие');return s}
async function body(req,max=1024*1024){if(!String(req.headers['content-type']).startsWith('application/json'))fail(415,'Нужен JSON');let size=0,chunks=[];for await(const x of req){size+=x.length;if(size>max)fail(413,'Слишком большой запрос');chunks.push(x)}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{fail(400,'Неверный JSON')}}
const commonHeaders={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const cookie=(token,age)=>`sk_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${production?'; Secure':''}`;
const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
 for(const [k,v] of Object.entries(commonHeaders))res.setHeader(k,v);if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
 try{
  const u=new URL(req.url,origin),p=u.pathname;
  if(p.startsWith('/api/')&&['POST','PUT','DELETE','PATCH'].includes(req.method)&&req.headers.origin!==origin)fail(403,'Запрос с другого сайта запрещён');
  if(p==='/api/config'&&req.method==='GET')return send(200,{...current(),leadsEnabled});
  if(p==='/api/session'&&req.method==='GET'){const s=auth(req);return send(200,{csrf:s.csrf})}
  if(p==='/api/login'&&req.method==='POST'){
   if(limited(req,'login',8,15*60000))fail(429,'Слишком много попыток. Повторите через 15 минут.');
   const b=await body(req,4096);if(typeof b.password!=='string'||b.password.length>256)fail(400,'Проверьте пароль');
   const [,salt,expected]=secret.split(':'),actual=await promisify(scrypt)(b.password,salt,64);
   if(!timingSafeEqual(actual,Buffer.from(expected,'hex')))fail(401,'Неверный пароль');
   const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
   db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),csrf,Date.now()+8*3600000);
   res.setHeader('Set-Cookie',cookie(token,8*3600));return send(200,{csrf});
  }
  if(p==='/api/logout'&&req.method==='POST'){const s=auth(req,true);db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);res.setHeader('Set-Cookie',cookie('',0));return send(200,{ok:true})}
  if(p==='/api/admin/config'&&req.method==='GET'){auth(req);return send(200,state())}
  if(p==='/api/admin/config'&&req.method==='PUT'){
   auth(req,true);const b=await body(req);const d=db.prepare('SELECT revision FROM draft WHERE id=1').get();if(b.revision!==d.revision)fail(409,'Черновик изменён в другой вкладке. Обновите данные, прежде чем сохранять.');
   validateConfig(b.config);db.prepare('UPDATE draft SET config=?,revision=revision+1 WHERE id=1').run(JSON.stringify(b.config));return send(200,state());
  }
  if(p==='/api/admin/publish'&&req.method==='POST'){
   auth(req,true);const b=await body(req);const d=db.prepare('SELECT * FROM draft WHERE id=1').get();if(b.revision!==d.revision)fail(409,'Черновик изменился. Откройте свежий предпросмотр.');validateConfig(JSON.parse(d.config));
   db.prepare('INSERT INTO versions(created,config) VALUES(?,?)').run(new Date().toISOString(),d.config);return send(200,state());
  }
  if(p==='/api/admin/restore'&&req.method==='POST'){
   auth(req,true);const b=await body(req);const d=db.prepare('SELECT revision FROM draft WHERE id=1').get();if(b.revision!==d.revision)fail(409,'Данные изменились в другой вкладке');
   const v=db.prepare('SELECT config FROM versions WHERE id=?').get(Number(b.version));if(!v)fail(404,'Версия не найдена');
   db.prepare('UPDATE draft SET config=?,revision=revision+1 WHERE id=1').run(v.config);return send(200,state());
  }
  if(p==='/api/leads'&&req.method==='POST'){
   if(!leadsEnabled)fail(503,'Приём заявок пока не включён.');if(limited(req,'leads',6,3600000))fail(429,'Слишком много обращений. Попробуйте позже.');
   const b=await body(req,13*1024*1024);if(b.website)fail(400,'Не удалось принять заявку');
   const phone=String(b.phone||'').replace(/\D/g,'');if(!/^(?:[78])?\d{10}$/.test(phone)||b.consent!==true)fail(400,'Проверьте телефон и согласие');
   if(b.name!==undefined&&(typeof b.name!=='string'||b.name.length>100||/[\u0000-\u001f\u007f]/.test(b.name)))fail(400,'Имя — до 100 символов');const name=(b.name||'').trim();
   if(typeof b.comment!=='string'||b.comment.length>2000)fail(400,'Комментарий — до 2000 символов');
   const v=current();let estimate=null;if(b.selection){if(b.version!==v.version)fail(409,'Цены обновились. Пересчитайте стоимость и отправьте заявку ещё раз.');estimate=calculate(v.config,b.selection)}
   const photos=b.photos||[];if(!Array.isArray(photos)||photos.length>6)fail(400,'Не более шести фото');
   const attachments=photos.map(x=>{if(typeof x.data!=='string'||x.data.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(x.data))fail(400,'Неверное фото');const data=Buffer.from(x.data,'base64');if(data.length>2*1024*1024||data.length<4||data[0]!==255||data[1]!==216||data[2]!==255)fail(400,'Принимаются JPEG-фотографии до 2 МБ');return data});
   db.exec('BEGIN');let id;try{const r=db.prepare('INSERT INTO leads(created,phone,name,comment,version,estimate,consent_version) VALUES(?,?,?,?,?,?,?)').run(new Date().toISOString(),phone,name,b.comment,v.version,estimate?JSON.stringify(estimate):null,'policy-v1');id=Number(r.lastInsertRowid);for(const data of attachments)db.prepare('INSERT INTO photos(lead_id,content,mime) VALUES(?,?,?)').run(id,data,'image/jpeg');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
   return send(201,{ok:true,id});
  }
  if(p==='/api/admin/leads'&&req.method==='GET'){
   auth(req);const after=Math.max(0,Number(u.searchParams.get('before')||0));
   const rows=db.prepare('SELECT id,created,phone,name,comment,status,note,version,estimate FROM leads WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT 50').all(after,after);
   return send(200,{leads:rows.map(({estimate,...x})=>{const e=estimate?JSON.parse(estimate):null;return {...x,estimateSummary:e?{total:e.total,partial:e.partial,area:e.area,pattern:e.pattern}:null}}),newCount:db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status='new'").get().n,next:rows.length===50?rows.at(-1).id:null});
  }
  const lm=p.match(/^\/api\/admin\/leads\/(\d+)$/);
  if(lm){auth(req,req.method!=='GET');const id=Number(lm[1]);if(!db.prepare('SELECT id FROM leads WHERE id=?').get(id))fail(404,'Заявка не найдена');
   if(req.method==='GET'){const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(id);lead.estimate=lead.estimate?JSON.parse(lead.estimate):null;lead.photos=db.prepare('SELECT id FROM photos WHERE lead_id=?').all(id);return send(200,lead)}
   if(req.method==='PATCH'){const b=await body(req,10000);if(!['new','progress','closed'].includes(b.status)||typeof b.note!=='string'||b.note.length>2000)fail(400,'Проверьте статус и заметку');db.prepare('UPDATE leads SET status=?,note=? WHERE id=?').run(b.status,b.note,id);return send(200,{ok:true})}
   if(req.method==='DELETE'){db.prepare('DELETE FROM leads WHERE id=?').run(id);return send(200,{ok:true})}
  }
  const pm=p.match(/^\/api\/admin\/photos\/(\d+)$/);if(pm&&req.method==='GET'){auth(req);const photo=db.prepare('SELECT content,mime FROM photos WHERE id=?').get(Number(pm[1]));if(!photo)fail(404,'Фото не найдено');res.writeHead(200,{'Content-Type':photo.mime,'Cache-Control':'no-store','Content-Disposition':'inline'});return res.end(Buffer.from(photo.content))}
  if(p==='/health'&&req.method==='GET')return send(200,{ok:true});
  const staticFiles={'/':'index.html','/admin':'admin.html','/admin/':'admin.html','/admin.html':'admin.html','/site.js':'site.js','/admin.js':'admin.js','/admin.css':'admin.css','/engine.js':'engine.js','/lead-export.js':'lead-export.js','/privacy':'privacy.html','/consent':'consent.html'};
  const f=staticFiles[p];if(!f||!['GET','HEAD'].includes(req.method))fail(404,'Не найдено');
  const ext=path.extname(f),types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};const content=readFileSync(path.join(root,'public',f));
  res.writeHead(200,{'Content-Type':types[ext]+'; charset=utf-8','Cache-Control':'no-store',...(p.includes('admin')?{'X-Robots-Tag':'noindex, nofollow'}:{})});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){const status=e.status||500;if(status>=500)console.error('Request failed:',req.method, String(req.url).split('?')[0],e.code||'internal');if(!res.headersSent)send(status,{error:status>=500?'Сервис временно недоступен. Повторите позже.':e.message});else res.end()}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,()=>console.log(`SK Паркет: ${origin}; admin: /admin; заявки: ${leadsEnabled?'включены':'выключены'}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{db.close();process.exit(0)}));
