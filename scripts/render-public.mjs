import {readFileSync} from 'node:fs';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=new URL('../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL('public/content/'+path,root),'utf8'));
export const gallerySizes=tile=>tile?'(max-width:699px) calc((100vw - 48px)/2), (max-width:1119px) calc((100vw - 88px)/2), 516px':'(max-width:699px) calc(100vw - 40px), (max-width:1119px) calc((100vw - 68px)/2), 526px';
function card(x,images){
 const esc=escapeHtml,single=x.mode==='single',tile=x.placement==='grid'||single;
 const photos=(single?[['after','']]:[['before','До'],['after','После']]).map(([key,label])=>{
  const image=x[key],v=images[image.path];if(!v)throw Error('Missing generated image: '+image.path);
  return '<div class="photo-cell"><picture><source type="image/webp" srcset="'+esc(v.webp)+'" sizes="'+esc(gallerySizes(tile))+'"><img src="'+esc(v.src)+'" srcset="'+esc(v.jpeg)+'" sizes="'+esc(gallerySizes(tile))+'" data-full-src="'+esc(v.full)+'" alt="'+esc((label?label+' — ':'')+x.title)+'" width="'+image.width+'" height="'+image.height+'" loading="lazy" decoding="async"></picture></div>';
 }).join('');
 const note=x.kind==='visualization'?'Визуализация варианта укладки':'';
 return '<article class="gallery-card gallery-has-photos" data-gallery-id="'+esc(x.id)+'"><button type="button" class="work-photo-trigger" aria-label="Увеличить: '+esc(x.title)+'"><div class="pair photo-pair'+(single?' photo-single':'')+'">'+photos+'</div></button><div class="caption"><h3>'+esc(x.title)+'</h3>'+(x.description?'<p>'+esc(x.description)+'</p>':'')+(note?'<small>'+note+'</small>':'')+'</div></article>';
}
export function renderPublic(html){
 const gallery=read('gallery.json'),images=read('gallery-images.json'),cards=[],tiles=[];
 for(const x of gallery.items)(x.placement==='grid'||x.mode==='single'?tiles:cards).push(card(x,images));
 const track=/<div aria-label="Наши работы \(до \/ после\)" class="gallery gallery-track" id="works-track" role="region" tabindex="0">[\s\S]*?<\/div><div class="gallery-controls">/;
 if(!track.test(html))throw Error('Gallery template changed');
 html=html.replace(track,'<div aria-label="Наши работы (до / после)" class="gallery gallery-track" id="works-track" role="region" tabindex="0">'+cards.join('')+'</div><div class="gallery-controls">');
 html=html.replace('<div class="real-works" id="real-works" hidden>','<div class="real-works" id="real-works">')
 .replace('<div class="real-works-grid" id="real-works-grid"></div>','<div class="real-works-grid" id="real-works-grid">'+tiles.join('')+'</div>');
 html=html.replace('<section class="section" id="works">','<section class="section" id="works" data-gallery-updated="'+escapeHtml(gallery.updated)+'">');
 html=html.replace('<div class="price" id="price">—</div>','<div class="price" id="price">Для расчёта включите JavaScript</div>');
 html=html.replace('<p class="price-sub" id="price-sub"></p>','<p class="price-sub" id="price-sub">Стоимость можно уточнить по телефону.</p>');
 // Without JS all before/after cards remain reachable in ordinary document flow.
 html=html.replace('</head>','<noscript><style>#works-track{display:grid;height:auto!important;overflow:visible}.gallery-stage .gallery-controls{display:none}.photo-cell picture,.portrait-photo picture,.pattern-card picture{display:contents}</style></noscript></head>');
 if(/Здесь будет фото|Материал, рисунок и выполненные работы добавим/.test(html))throw Error('Production placeholder remains');
 return html;
}
