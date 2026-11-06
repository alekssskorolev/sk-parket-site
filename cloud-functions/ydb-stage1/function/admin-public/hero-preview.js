import {createHeroDisplay} from '/engine.js?module=hero';
const hero=document.getElementById('hero'),display=createHeroDisplay(hero,{assetBase:'https://skparket.ru'});
let scheduled=false;
function report(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;parent.postMessage({type:'hero-preview-height',height:Math.ceil(hero.getBoundingClientRect().bottom)},location.origin)})}
new ResizeObserver(report).observe(hero);
addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='hero-preview-config')return;
 const {config,device}=event.data;if(!config||!['desktop','mobile'].includes(device))return;
 display.apply(config,device);report();
 if(event.data.fit)parent.postMessage({type:'hero-preview-fit',zoom:display.fit()},location.origin);
});
document.addEventListener('click',e=>{if(e.target.closest('a,button'))e.preventDefault()});
parent.postMessage({type:'hero-preview-ready'},location.origin);
