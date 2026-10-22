/* GitHub Pages DEMO ONLY. No authentication and no network API. Do not use for real leads. */
import {validateConfig,calculate} from './engine.js';
const nativeFetch=globalThis.fetch.bind(globalThis),KEY='sk-parket-pages-demo-v1';
const response=await nativeFetch(new URL('./config.seed.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить демонстрационные данные');const seed=validateConfig(await response.json());
function initial(){return {schema:1,revision:1,draft:structuredClone(seed),versions:[{version:1,updated:new Date().toISOString(),config:structuredClone(seed)}],leads:[],nextId:1,nextPhotoId:1}}
function read(){try{const raw=localStorage.getItem(KEY);if(!raw)return initial();const s=JSON.parse(raw);if(s.schema!==1)throw Error();return s}catch{throw Error('Нет доступа к локальным данным. Разрешите хранилище сайта или сбросьте демо-данные.')}}
function write(s){try{localStorage.setItem(KEY,JSON.stringify(s));dispatchEvent(new Event('sk-demo-update'))}catch{throw Error('Браузер не смог сохранить данные: возможно, закончилось место. Удалите тестовые фотографии или старые заявки.')}}
function current(s){return s.versions.at(-1)}
function state(s){return {draft:s.draft,revision:s.revision,published:current(s),history:s.versions.slice(-20).reverse().map(v=>({id:v.version,created:v.updated}))}}
function err(status,message){const e=Error(message);e.status=status;throw e}
function conflict(b,s){if(b.revision!==s.revision)err(409,'Данные изменились в другой вкладке. Обновите страницу.')}
globalThis.skDemoPhoto=id=>{const s=read();for(const x of s.leads){const p=x.photos.find(p=>p.id===id);if(p)return 'data:image/jpeg;base64,'+p.data}return ''};
globalThis.fetch=async(input,options={})=>{
 const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url,url=new URL(raw,location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
 let status=200,result;try{
 const method=options.method||'GET',b=options.body?JSON.parse(options.body):{},s=read(),p=url.pathname;
 if(p==='/api/config')result={...current(s),leadsEnabled:true};
 else if(p==='/api/session'||p==='/api/login')result={csrf:'DEMO-NO-AUTH'};
 else if(p==='/api/logout')result={ok:true};
 else if(p==='/api/admin/config'&&method==='GET')result=state(s);
 else if(p==='/api/admin/config'&&method==='PUT'){conflict(b,s);validateConfig(b.config);s.draft=b.config;s.revision++;write(s);result=state(s)}
 else if(p==='/api/admin/publish'&&method==='POST'){conflict(b,s);validateConfig(s.draft);s.versions.push({version:current(s).version+1,updated:new Date().toISOString(),config:structuredClone(s.draft)});s.versions=s.versions.slice(-20);write(s);result=state(s)}
 else if(p==='/api/admin/restore'&&method==='POST'){conflict(b,s);const v=s.versions.find(v=>v.version===b.version);if(!v)err(404,'Версия не найдена');s.draft=structuredClone(v.config);s.revision++;write(s);result=state(s)}
 else if(p==='/api/leads'&&method==='POST'){
  if(b.consent!==true)err(400,'Подтвердите тестовое согласие');if(typeof b.comment!=='string'||b.comment.length>2000)err(400,'Комментарий — до 2000 символов');
  if(b.selection&&b.version!==current(s).version)err(409,'Настройки обновились. Приложите новый расчёт.');
  const photos=b.photos||[];if(!Array.isArray(photos)||photos.length>6||photos.some(x=>typeof x.data!=='string'||x.data.length>2800000))err(400,'Проверьте тестовые фото');
  const id=s.nextId++;s.leads.push({id,created:new Date().toISOString(),phone:'79990000000 (тест)',comment:b.comment,status:'new',note:'',version:current(s).version,estimate:b.selection?calculate(current(s).config,b.selection):null,photos:photos.map(x=>({id:s.nextPhotoId++,data:x.data}))});write(s);status=201;result={ok:true,id};
 }
 else if(p==='/api/admin/leads'&&method==='GET'){const before=Number(url.searchParams.get('before')||0),leads=s.leads.filter(x=>!before||x.id<before).slice().reverse().slice(0,50).map(({photos,estimate,...x})=>x);result={leads,newCount:s.leads.filter(x=>x.status==='new').length,next:leads.length===50?leads.at(-1).id:null}}
 else if(/^\/api\/admin\/leads\/\d+$/.test(p)){const id=Number(p.split('/').at(-1)),x=s.leads.find(x=>x.id===id);if(!x)err(404,'Тестовая заявка не найдена');if(method==='GET')result={...x,photos:x.photos.map(({id})=>({id}))};else if(method==='PATCH'){if(!['new','progress','closed'].includes(b.status)||typeof b.note!=='string'||b.note.length>2000)err(400,'Проверьте статус и заметку');x.status=b.status;x.note=b.note;write(s);result={ok:true}}else if(method==='DELETE'){s.leads=s.leads.filter(x=>x.id!==id);write(s);result={ok:true}}else err(405,'Не поддерживается')}
 else err(404,'Такой функции нет в демоверсии');
 }catch(e){status=e.status||422;result={error:e.message||'Не удалось сохранить тестовые данные'}}
 return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});
};
