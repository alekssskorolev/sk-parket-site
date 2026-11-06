// Shared by the live first screen and its admin preview. No editor code enters the public site.
export const defaultHero=()=>({desktop:{image:null,name:'Текущий фон компьютера',zoom:100,panX:50,panY:0,strength:100,position:50,width:100,darkness:0,brightness:76,text:'dark'},mobile:{image:null,name:'Текущий фон телефона',zoom:100,panX:50,panY:54,strength:0,position:50,width:100,darkness:12,brightness:60,text:'light'}});
export function gradient(c){
 const start=c.position-c.width/2,k=c.strength/100,d=c.darkness/100;
 return 'linear-gradient(90deg,'+[[0,1],[21,.98],[38,.9],[55,.56],[76,.14],[100,0]].map(([p,a])=>`rgba(250,249,246,${Math.min(1,a*k).toFixed(4)}) ${(start+p*c.width/100).toFixed(2)}%`).join(',')+`),linear-gradient(90deg,rgba(0,0,0,${(d*.35).toFixed(4)}),rgba(0,0,0,${d.toFixed(4)}))`;
}
const css=`#hero.hero.hero-managed{position:relative;isolation:isolate;overflow:hidden;background:#faf9f6}
#hero.hero.hero-managed::before{display:none!important;background-image:none!important}
#hero.hero.hero-managed::after{display:block!important;position:absolute;inset:0;z-index:1;pointer-events:none;background:var(--hero-overlay)!important}
#hero.hero-managed .hero-background{position:absolute;max-width:none;max-height:none;z-index:0;pointer-events:none}
#hero.hero-managed .hero-inner{position:relative;z-index:2}
#hero.hero-managed .hero-title,#hero.hero-managed .intro,#hero.hero-managed .visit,#hero.hero-managed .visit strong,#hero.hero-managed .facts,#hero.hero-managed .illustration{color:var(--hero-ink)!important}
#hero.hero-managed .facts li::before{color:var(--hero-check)!important}
#hero.hero-managed .actions .btn{background:var(--hero-button)!important;border-color:var(--hero-button)!important;color:var(--hero-button-ink)!important}
#hero.hero-managed .actions .btn.secondary{background:transparent!important;color:var(--hero-ink)!important;border-color:var(--hero-ink)!important}`;
export function createHeroDisplay(hero,{assetBase='.',device=null}={}){
 if(!document.getElementById('hero-display-style')){const style=document.createElement('style');style.id='hero-display-style';style.textContent=css;document.head.append(style)}
 hero.classList.add('hero-managed');
 const image=document.createElement('img');image.className='hero-background';image.alt='';image.setAttribute('aria-hidden','true');image.decoding='async';image.fetchPriority='high';hero.prepend(image);
 let current=null,source='',destroyed=false,activeDevice=device||'desktop';
 function layout(){if(!current||!image.naturalWidth)return;const scale=Math.max(hero.clientWidth/image.naturalWidth,hero.clientHeight/image.naturalHeight)*current.zoom/100;const w=image.naturalWidth*scale,h=image.naturalHeight*scale;Object.assign(image.style,{width:w+'px',height:h+'px',left:(hero.clientWidth-w)*current.panX/100+'px',top:(hero.clientHeight-h)*current.panY/100+'px'})}
 image.addEventListener('load',layout);const observer=new ResizeObserver(layout);observer.observe(hero);
 function apply(config,selectedDevice=device||'desktop'){
  if(destroyed)return;activeDevice=selectedDevice;current={...defaultHero()[selectedDevice],...config};
  const light=current.text==='light';hero.style.setProperty('--hero-ink',light?'#fff':'#302d29');hero.style.setProperty('--hero-check',light?'#e9c496':'#76523a');hero.style.setProperty('--hero-button',light?'#fff':'#76523a');hero.style.setProperty('--hero-button-ink',light?'#352719':'#fff');hero.style.setProperty('--hero-overlay',gradient(current));image.style.filter=`brightness(${current.brightness/100}) saturate(${selectedDevice==='mobile'?.78:.9}) contrast(${selectedDevice==='mobile'?1.04:1.08})`;
  const next=current.image||assetBase+'/assets/hero-'+selectedDevice+'.webp';if(next!==source){source=next;image.src=next}layout();
 }
 image.addEventListener('error',()=>{const fallback=assetBase+'/assets/hero-'+activeDevice+'.webp';if(source!==fallback){source=fallback;image.src=fallback}});
 return {apply,fit(){if(!image.naturalWidth)return 100;return Math.max(1,Math.floor(Math.min(hero.clientWidth/image.naturalWidth,hero.clientHeight/image.naturalHeight)/Math.max(hero.clientWidth/image.naturalWidth,hero.clientHeight/image.naturalHeight)*100))},destroy(){destroyed=true;observer.disconnect();image.remove()}};
}
