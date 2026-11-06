'use strict';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const defaults=()=>({desktop:{image:null,name:'Текущий фон компьютера',zoom:100,panX:50,panY:0,strength:100,position:50,width:100,darkness:0,brightness:76,text:'dark'},mobile:{image:null,name:'Текущий фон телефона',zoom:100,panX:50,panY:54,strength:0,position:50,width:100,darkness:12,brightness:60,text:'light'}});
const initial=()=>({revision:1,draft:defaults(),published:null,previous:null});
const fail=(n,message)=>{throw Object.assign(Error(message),{status:n,publicError:true})};
const bounds={zoom:[1,300],panX:[0,100],panY:[0,100],strength:[0,150],position:[0,100],width:[5,160],darkness:[0,80],brightness:[20,120]};
const imageIds=state=>Object.values(state||{}).map(x=>x?.image).filter(Boolean);
function heroRefs(h){return new Set([...(h?imageIds(h.draft):[]),...imageIds(h?.published?.config),...imageIds(h?.previous?.config)])}
function createHero({storage,gallery,now=()=>Date.now()}){
 async function state(){const s=await storage.state();return {...s.hero||initial(),ready:gallery.ready()}}
 async function validate(config,read){
  if(!config||typeof config!=='object')fail(422,'Нужны настройки обоих экранов');const result={};
  for(const device of ['desktop','mobile']){const v=config[device];if(!v||!['dark','light'].includes(v.text)||typeof v.name!=='string'||v.name.length>120||/[\x00-\x1f]/.test(v.name))fail(422,'Проверьте настройки фона');const clean={text:v.text,name:v.name,image:v.image};
   for(const [key,[min,max]]of Object.entries(bounds)){if(!Number.isFinite(v[key])||v[key]<min||v[key]>max)fail(422,'Недопустимое значение: '+key);clean[key]=v[key]}
   if(v.image!==null){if(!ID.test(v.image||''))fail(422,'Выберите загруженное изображение');const m=await read(v.image);if(!m||m.status!=='ready'||m.heroDevice!==device)fail(422,'Изображение недоступно. Загрузите его заново для этого экрана.')}
   result[device]=clean;
  }return result;
 }
 async function change(revision,fn){await storage.mutate(async(s,read)=>{const h=s.hero||initial();if(h.revision!==revision)fail(409,'Фон изменён в другой вкладке. Обновите настройки.');await fn(h,read);h.revision++;s.hero=h});return state()}
 async function save(revision,config){return change(revision,async(h,read)=>{h.draft=await validate(config,read)})}
 async function publish(revision){return change(revision,async(h,read)=>{const config=await validate(h.draft,read);h.previous=h.published||{revision:0,config:defaults()};h.published={revision:h.revision+1,updated:new Date(now()).toISOString(),config}})}
 async function rollback(revision){return change(revision,async(h,read)=>{if(!h.previous)fail(409,'Предыдущей публикации пока нет');const config=await validate(h.previous.config,read),old=h.published;h.published={revision:h.revision+1,updated:new Date(now()).toISOString(),config};h.previous=old;h.draft=structuredClone(config)})}
 async function manifest(){const h=await state(),config=h.published?.config||defaults(),out={revision:h.published?.revision||0};for(const device of ['desktop','mobile']){const x=config[device];out[device]={...x,image:x.image?'/api/gallery/images/'+x.image:null}}return out}
 return {state,save,publish,rollback,manifest};
}
module.exports={createHero,defaults,initial,heroRefs,bounds};
