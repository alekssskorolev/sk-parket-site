// Public published settings only. These validators never accept draft/admin URLs.
export const HERO_ORIGIN='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net';
export const HERO_DEVICES=['desktop','mobile'];
const bounds={zoom:[1,300],panX:[0,100],panY:[0,100],strength:[0,150],position:[0,100],width:[5,160],darkness:[0,80],brightness:[20,120]};
const imagePath=/^\/api\/gallery\/images\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function validateHeroManifest(value){
 if(!value||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Invalid published hero revision');
 const clean={revision:value.revision};
 for(const device of HERO_DEVICES){
  const x=value[device];
  if(!x||!['dark','light'].includes(x.text)||typeof x.name!=='string'||x.name.length>120||/[\x00-\x1f]/.test(x.name))throw Error('Invalid hero settings: '+device);
  if(x.image!==null&&(typeof x.image!=='string'||!imagePath.test(x.image)))throw Error('Invalid public hero image');
  const c={image:x.image,name:x.name,text:x.text};
  for(const [key,[min,max]]of Object.entries(bounds)){if(!Number.isFinite(x[key])||x[key]<min||x[key]>max)throw Error('Invalid hero '+key);c[key]=x[key]}
  clean[device]=c;
 }
 return clean;
}
export function validateHeroSnapshot(value){
 if(value?.schema!==1)throw Error('Unsupported hero snapshot');
 const published=validateHeroManifest(value.published),images={};
 for(const device of HERO_DEVICES){
  const x=value.images?.[device];
  if(!x||!/^\.\/assets\/hero\/[a-f0-9]{64}\.webp$/.test(x.src)||!Number.isSafeInteger(x.width)||!Number.isSafeInteger(x.height)||x.width<1||x.height<1||x.width*x.height>60000000)throw Error('Invalid static hero image');
  images[device]={src:x.src,width:x.width,height:x.height};
 }
 return {schema:1,published,images};
}
