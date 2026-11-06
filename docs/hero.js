import {createHeroDisplay,defaultHero} from './hero-display.js';
const API='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net',hero=document.getElementById('hero');
const query=matchMedia('(min-width:700px)');let config=defaultHero(),display;
function apply(){if(!display)display=createHeroDisplay(hero);const device=query.matches?'desktop':'mobile',settings={...config[device]};if(settings.image?.startsWith('/api/gallery/images/'))settings.image=API+settings.image;display.apply(settings,device)}
// Cached independently of prices. A slow cloud response must not leave the first screen without its original photo.
const fallback=setTimeout(apply,1800);
try{const response=await fetch(API+'/api/gallery?view=hero',{credentials:'omit',cache:'default',signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();if(data?.desktop&&data?.mobile)config=data}}catch{/* Keep the original backgrounds when cloud settings are unavailable. */}
clearTimeout(fallback);apply();query.addEventListener('change',apply);
