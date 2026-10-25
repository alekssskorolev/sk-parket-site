'use strict';
const sharp=require('sharp');const {randomUUID}=require('node:crypto');
sharp.cache({memory:16,files:0,items:32});sharp.concurrency(1);
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=(status,message)=>{throw Object.assign(Error(message),{status,publicError:true})};
// Authenticate only with the Yandex Cloud service-account token supplied to this
// function in context.token. Official format: https://yandex.cloud/en/docs/functions/lang/nodejs/context
// Never fetch credentials from another provider, return them to clients, or persist them.
function createObjectStore({env=process.env,fetchImpl=fetch}={}){
 let accessToken;
 const ready=()=>/^skparket-gallery-[a-z0-9-]{3,45}$/.test(env.GALLERY_BUCKET||'');
 function credentials(runtimeContext){accessToken=runtimeContext?.token?.access_token}
 async function call(id,method,body){if(!ready())fail(503,'Хранилище фотографий пока не настроено');if(!ID.test(id))fail(404,'Фотография не найдена');
  if(typeof accessToken!=='string'||!accessToken)fail(503,'Нет доступа функции к хранилищу фотографий');
  let r;try{r=await fetchImpl('https://storage.yandexcloud.net/'+env.GALLERY_BUCKET+'/gallery/'+id+'.webp',{method,body,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'image/webp'}:{})},signal:AbortSignal.timeout(12000),redirect:'error'})}catch{fail(503,'Хранилище фотографий временно недоступно')}
  if(method==='DELETE'&&r.status===404)return;
  if(!r.ok)fail(r.status===404?404:503,r.status===404?'Фотография не найдена':'Не удалось выполнить операцию с фотографией');
  if(method==='GET'){const data=Buffer.from(await r.arrayBuffer());if(data.length>1800000)fail(503,'Не удалось получить фотографию');return data}
 }
 return {ready,credentials,put:(id,data)=>call(id,'PUT',data),get:id=>call(id,'GET'),delete:id=>call(id,'DELETE')};
}
async function convertImage(data){
 if(typeof data!=='string'||data.length<16||data.length>1900000||data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))fail(422,'Не удалось прочитать фотографию. Добавьте JPEG, PNG или WebP.');
 const input=Buffer.from(data,'base64');if(input.length>1400000)fail(413,'Фотография слишком большая. Попробуйте уменьшенную копию.');
 try{const image=sharp(input,{limitInputPixels:16000000,failOn:'warning'}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1||meta.width<320||meta.height<240)fail(422,'Нужно статичное фото JPEG, PNG или WebP размером от 320 × 240 пикселей.');
  const {data:bytes,info}=await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).webp({quality:86,effort:4}).toBuffer({resolveWithObject:true});
  if(bytes.length>1800000)fail(413,'Фото слишком сложное для загрузки. Попробуйте уменьшенную копию.');return {bytes,width:info.width,height:info.height};
 }catch(e){if(e.publicError)throw e;fail(422,'Файл повреждён или имеет неподдерживаемый формат. Нужен JPEG, PNG или WebP.');}
}
function createGallery({storage,objects=createObjectStore(),limits,now=()=>Date.now(),makeId=randomUUID}){
 const ready=()=>objects.ready();
 async function state(){return {...await storage.state(),ready:ready()}}
 async function validate(items,readMedia,complete=false){
  if(!Array.isArray(items)||items.length>50)fail(422,'В галерее может быть до 50 пар фотографий');const ids=new Set(),clean=[];
  for(const x of items){if(!x||!ID.test(x.id)||ids.has(x.id))fail(422,'Неверный идентификатор карточки');ids.add(x.id);
   for(const [key,max]of [['title',100],['description',600]])if(typeof x[key]!=='string'||x[key].length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(x[key]))fail(422,'Проверьте название и описание');
   if((complete&&x.visible&&!x.title.trim())||!['project','visualization'].includes(x.kind)||typeof x.visible!=='boolean')fail(422,'Укажите название и тип карточки');
   for(const side of ['before','after']){if(!x[side]&&(!complete||!x.visible))continue;if(!ID.test(x[side]||''))fail(422,'Добавьте обе фотографии: «До» и «После»');const m=await readMedia(x[side]);if(!m||m.status!=='ready')fail(422,'Фотография больше недоступна. Загрузите её заново.')}
   clean.push({id:x.id,title:x.title.trim(),description:x.description.trim(),kind:x.kind,visible:x.visible,before:x.before||null,after:x.after||null});
  }return clean;
 }
 async function save(revision,items){await storage.mutate(async(s,read)=>{if(s.revision!==revision)fail(409,'Галерея изменена в другой вкладке. Обновите её перед сохранением.');s.draft=await validate(items,read);s.revision++});return state()}
 async function publish(revision){if(!ready())fail(503,'Хранилище фотографий пока не настроено');await storage.mutate(async(s,read)=>{if(s.revision!==revision)fail(409,'Галерея изменена. Сначала обновите её.');const items=await validate(s.draft,read,true);s.revision++;s.published={revision:s.revision,updated:new Date(now()).toISOString(),items}});return state()}
 async function upload(data){if(!ready())fail(503,'Хранилище фотографий пока не настроено');if(limits&&!await limits.limit('gallery-upload',120,3600000,now()))fail(429,'Слишком много загрузок. Повторите позже.');
  const image=await convertImage(data),id=makeId(),m={id,width:image.width,height:image.height,bytes:image.bytes.length,created:now(),status:'uploading'};
  await storage.createMedia(m);try{await objects.put(id,image.bytes);return await storage.readyMedia(id)}catch(e){await remove(id).catch(()=>{});throw e}
 }
 async function remove(id){if(!ID.test(id||''))fail(404,'Фотография не найдена');const m=await storage.claimDelete(id);if(!m)fail(409,'Фотография используется в галерее');await objects.delete(id);await storage.deleteMedia(id);return {ok:true}}
 async function manifest(){const s=await storage.state();if(!s.published)return {configured:false,items:[]};const items=[],visible=s.published.items.filter(x=>x.visible),ids=[...new Set(visible.flatMap(x=>[x.before,x.after]))],all=storage.mediaMany?new Map((await storage.mediaMany(ids)).map(x=>[x.id,x])):null;
  for(const x of visible){const [b,a]=all?[all.get(x.before),all.get(x.after)]:await Promise.all([storage.media(x.before),storage.media(x.after)]);if(!b||!a||b.status!=='ready'||a.status!=='ready')continue;
   const image=m=>({id:m.id,width:m.width,height:m.height,path:'/api/gallery/images/'+m.id});items.push({id:x.id,title:x.title,description:x.description,kind:x.kind,before:image(b),after:image(a)});
  }return {configured:true,updated:s.published.updated,items};
 }
 async function image(id,privatePreview=false){if(!ID.test(id||''))fail(404,'Фотография не найдена');if(!privatePreview){const s=await storage.state();if(!s.published?.items.some(x=>x.visible&&(x.before===id||x.after===id)))fail(404,'Фотография не найдена')}
  const m=await storage.media(id);if(!m||m.status!=='ready')fail(404,'Фотография не найдена');return {data:await objects.get(id),width:m.width,height:m.height};
 }
 async function cleanup(){if(!ready())return;const s=await storage.state(),old=await storage.oldMedia(now()-86400000,s.gcCursor);for(const m of old)await remove(m.id).catch(()=>{});await storage.mutate(p=>{p.gcCursor=old.length===1?old.at(-1).id:''})}
 return {ready,state,save,publish,upload,remove,manifest,image,cleanup};
}
module.exports={createGallery,createObjectStore,convertImage,ID};
