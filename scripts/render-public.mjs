import {readFileSync} from 'node:fs';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=new URL('../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL('public/content/'+path,root),'utf8'));
const money=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
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
 const gallery=read('gallery.json'),images=read('gallery-images.json'),prices=read('prices.json'),cards=[],tiles=[];
 for(const x of gallery.items)(x.placement==='grid'||x.mode==='single'?tiles:cards).push(card(x,images));
 const track=/<div aria-label="Наши работы \(до \/ после\)" class="gallery gallery-track" id="works-track" role="region" tabindex="0">[\s\S]*?<\/div><div class="gallery-controls">/;
 if(!track.test(html))throw Error('Gallery template changed');
 html=html.replace(track,'<div aria-label="Наши работы (до / после)" class="gallery gallery-track" id="works-track" role="region" tabindex="0">'+cards.join('')+'</div><div class="gallery-controls">');
 html=html.replace('<div class="real-works" id="real-works" hidden>','<div class="real-works" id="real-works">')
 .replace('<div class="real-works-grid" id="real-works-grid"></div>','<div class="real-works-grid" id="real-works-grid">'+tiles.join('')+'</div>');
 const esc=escapeHtml,c=prices.config;
 // These are individual stage rates from the published calculator, never a turnkey minimum.
 const rows=[
  ...c.patterns.filter(x=>x.active&&!x.individual).map(x=>['Укладка: '+x.name,x.price,'₽/м²']),
  ...c.items.filter(x=>x.active&&x.kind==='work').map(x=>[x.name,x.price,x.unit==='m2'?'₽/м²':'₽/'+x.unit])
 ];
 const date=new Date(prices.fetchedAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
 const rates='<section class="section static-prices" id="published-rates"><div class="wrap"><h2>Как складывается стоимость</h2><p>Ставки отдельных этапов из опубликованного калькулятора, снимок на <time datetime="'+esc(prices.fetchedAt)+'">'+date+'</time>, версия '+prices.version+'. Это не стоимость комплекса «под ключ» за м².</p><div class="rates-table-wrap"><table class="rates-table"><caption>Работы в составе выбранного заказа; материалы считаются отдельно</caption><thead><tr><th scope="col">Этап</th><th scope="col">Базовая ставка</th></tr></thead><tbody>'+rows.map(([name,price,unit])=>'<tr><th scope="row">'+esc(name)+'</th><td>'+money(price)+' '+esc(unit)+'</td></tr>').join('')+'</tbody></table></div><p>'+esc(c.note)+'</p><p>'+esc(c.exclusions)+'</p><p>Интерактивный калькулятор применяет текущую версию прайса, состав выбранного основания, запас и округление упаковок. Указанные ставки отдельных работ не включают материалы и не заменяют смету после осмотра.</p><p><a href="#cost">Рассчитать выбранный комплект</a> · <a href="tel:+79117982306">Уточнить стоимость по телефону</a></p></div></section>';
 html=html.replace('<section class="section" id="works">',rates+'<section class="section" id="works">');
 html=html.replace('<div class="price" id="price">—</div>','<div class="price" id="price">Для расчёта включите JavaScript</div>');
 html=html.replace('<p class="price-sub" id="price-sub"></p>','<p class="price-sub" id="price-sub">Состав и ставки отдельных этапов приведены ниже. Стоимость можно уточнить по телефону.</p>');
 // Without JS all before/after cards remain reachable in ordinary document flow.
 html=html.replace('</head>','<noscript><style>#works-track{display:grid;height:auto!important;overflow:visible}.gallery-stage .gallery-controls{display:none}.photo-cell picture,.portrait-photo picture,.pattern-card picture{display:contents}</style></noscript></head>');
 if(/Здесь будет фото|Материал, рисунок и выполненные работы добавим/.test(html))throw Error('Production placeholder remains');
 return html;
}
