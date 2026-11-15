import {createHeroDisplay,defaultHero} from './hero-display.js';
const API='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net',hero=document.getElementById('hero');
const CACHE_KEY='skparket:hero:published:v1',CACHE_VERSION=1,CACHE_MAX_AGE=24*60*60*1000;
const bounds={zoom:[1,300],panX:[0,100],panY:[0,100],strength:[0,150],position:[0,100],width:[5,160],darkness:[0,80],brightness:[20,120]};
function publishedConfig(value){
 if(!value||!Number.isSafeInteger(value.revision)||value.revision<0)return null;
 const clean={revision:value.revision};
 for(const device of ['desktop','mobile']){
  const x=value[device];
  if(!x||!['dark','light'].includes(x.text)||typeof x.name!=='string'||x.name.length>120||/[\x00-\x1f]/.test(x.name))return null;
  if(x.image!==null&&(typeof x.image!=='string'||!/^\/api\/gallery\/images\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x.image)))return null;
  const c={image:x.image,name:x.name,text:x.text};
  for(const [key,[min,max]]of Object.entries(bounds)){if(!Number.isFinite(x[key])||x[key]<min||x[key]>max)return null;c[key]=x[key]}
  clean[device]=c;
 }
 return clean;
}
function readCache(){try{const cached=JSON.parse(localStorage.getItem(CACHE_KEY));const age=Date.now()-cached?.savedAt;if(cached?.version!==CACHE_VERSION||!Number.isFinite(cached.savedAt)||age<0||age>CACHE_MAX_AGE)return null;return publishedConfig(cached.config)}catch{return null}}
function writeCache(value){try{localStorage.setItem(CACHE_KEY,JSON.stringify({version:CACHE_VERSION,savedAt:Date.now(),config:value}))}catch{/* Storage may be blocked. */}}
const query=matchMedia('(min-width:700px)');let config=readCache(),display;
function apply(){if(!config)return;if(!display)display=createHeroDisplay(hero);const device=query.matches?'desktop':'mobile',settings={...config[device]};if(settings.image?.startsWith('/api/gallery/images/'))settings.image=API+settings.image;display.apply(settings,device)}
// A remembered published background can render while cloud settings revalidate.
apply();query.addEventListener('change',apply);
try{
 const response=await fetch(API+'/api/gallery?view=hero',{credentials:'omit',cache:'default',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Hero settings unavailable');
 const next=publishedConfig(await response.json());if(!next)throw Error('Invalid hero settings');
 writeCache(next);
 if(JSON.stringify(next)!==JSON.stringify(config)){config=next;apply()}
}catch{
 // Only a terminal failure on a cold visit may choose the original fallback.
 if(!config){config=defaultHero();apply()}
}
