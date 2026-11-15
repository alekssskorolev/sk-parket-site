import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gradient,heroDisplayCss} from '../public/hero-display.js';
import {escapeHtml} from './render-public.mjs';
import {HERO_DEVICES,validateHeroSnapshot} from './hero-content.mjs';
const root=new URL('../',import.meta.url);
function settingsCss(c,image){
 const light=c.text==='light',ratio=image.width/image.height,zoom=c.zoom/100;
 return `--hero-ink:${light?'#fff':'#302d29'};--hero-check:${light?'#e9c496':'#76523a'};--hero-button:${light?'#fff':'#76523a'};--hero-button-ink:${light?'#352719':'#fff'};--hero-overlay:${gradient(c)};--hero-image-width:calc(max(100cqw,calc(100cqh * ${ratio})) * ${zoom});--hero-image-height:calc(max(100cqh,calc(100cqw / ${ratio})) * ${zoom});--hero-pan-x:${c.panX/100};--hero-pan-y:${c.panY/100};--hero-brightness:${c.brightness/100};`;
}
export function renderHero(html,input=JSON.parse(readFileSync(new URL('public/content/hero.json',root),'utf8'))){
 const snapshot=validateHeroSnapshot(input),esc=escapeHtml;
 for(const device of HERO_DEVICES){const image=snapshot.images[device],digest=createHash('sha256').update(readFileSync(new URL('public/'+image.src.slice(2),root))).digest('hex');if(!image.src.endsWith('/'+digest+'.webp'))throw Error('Static hero asset digest mismatch')}
 const loader=/<script type="module" src="\.\/hero\.js[^\"]*"><\/script>\s*<noscript><style>[\s\S]*?<\/style><\/noscript>/;
 if(!loader.test(html))throw Error('Hero loader template changed');
 const preloads=HERO_DEVICES.map(device=>`<link rel="preload" as="image" type="image/webp" media="${device==='desktop'?'(min-width:700px)':'(width < 700px)'}" href="${esc(snapshot.images[device].src)}" fetchpriority="high">`).join('\n');
 const styles=`${heroDisplayCss}\n#hero.hero-static .hero-background-frame{position:absolute;inset:0;z-index:0;container-type:size;pointer-events:none}\n#hero.hero-static .hero-background{position:absolute;width:var(--hero-image-width);height:var(--hero-image-height);left:calc((100cqw - var(--hero-image-width)) * var(--hero-pan-x));top:calc((100cqh - var(--hero-image-height)) * var(--hero-pan-y));filter:brightness(var(--hero-brightness)) saturate(.9) contrast(1.08)}\n@media(min-width:700px){#hero.hero-static{${settingsCss(snapshot.published.desktop,snapshot.images.desktop)}}}\n@media(width < 700px){#hero.hero-static{${settingsCss(snapshot.published.mobile,snapshot.images.mobile)}}#hero.hero-static .hero-background{filter:brightness(var(--hero-brightness)) saturate(.78) contrast(1.04)}}`;
 html=html.replace(loader,preloads+'\n<style id="hero-static-style">'+styles+'</style>');
 const sources=HERO_DEVICES.map(device=>{const image=snapshot.images[device];return `<source media="${device==='desktop'?'(min-width:700px)':'(width < 700px)'}" type="image/webp" srcset="${esc(image.src)}" width="${image.width}" height="${image.height}">`}).join('');
 const image=snapshot.images.desktop,picture=`<div class="hero-background-frame" aria-hidden="true"><picture>${sources}<img class="hero-background" src="${esc(image.src)}" width="${image.width}" height="${image.height}" alt="" loading="eager" decoding="async" fetchpriority="high"></picture></div>`;
 const hero=/<section\b(?=[^>]*\bid="hero")(?=[^>]*\bclass="hero")([^>]*)>/;
 if(!hero.test(html))throw Error('Hero section template changed');
 html=html.replace(hero,tag=>tag.replace('class="hero"','class="hero hero-managed hero-static"').replace(/>$/,` data-hero-revision="${snapshot.published.revision}">`)+picture);
 return html;
}
