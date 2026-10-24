import {calculate} from '/engine.js';

const $=id=>document.getElementById(id);
// Logo always goes to the page's actual top, including the prototype notice.
function scrollPageToTop(){$('nav').classList.remove('open');$('menu').setAttribute('aria-expanded','false');const target=$('page-top');target.tabIndex=-1;target.focus({preventScroll:true});requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})))}
document.querySelectorAll('a[href="#page-top"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();scrollPageToTop()}));

let floorPhotos=[];
function renderFloorPhotos(){const list=$('photo-previews');list.replaceChildren();floorPhotos.forEach((item,index)=>{const li=document.createElement('li');li.className='photo-preview';const img=document.createElement('img');img.src=item.url;img.alt='Фотография пола '+(index+1);img.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.className='preview-unavailable';fallback.textContent='Фото добавлено';img.replaceWith(fallback)});const button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label','Удалить фотографию '+(index+1));button.addEventListener('click',()=>{URL.revokeObjectURL(item.url);floorPhotos.splice(index,1);renderFloorPhotos();$('photo-status').textContent=floorPhotos.length?'Добавлено фотографий: '+floorPhotos.length+'.':'';});const name=document.createElement('small');name.textContent=item.file.name;name.title=item.file.name;li.append(img,button,name);list.append(li)});}
$('floor-photo-input').addEventListener('change',e=>{let warnings=[];for(const file of e.target.files){if(!file.type.startsWith('image/')&&!/\.(heic|heif)$/i.test(file.name)){warnings.push('Можно добавить только изображения.');continue}if(file.size>10*1024*1024){warnings.push('Фото «'+file.name+'» больше 10 МБ.');continue}if(floorPhotos.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;if(floorPhotos.length>=6){warnings.push('Можно добавить не более 6 фотографий.');break}floorPhotos.push({file,url:URL.createObjectURL(file)})}e.target.value='';renderFloorPhotos();$('photo-status').textContent=(floorPhotos.length?'Добавлено фотографий: '+floorPhotos.length+'. ':'')+[...new Set(warnings)].join(' ');});

function updateMobileHeader(){const header=document.querySelector('.header');const scrolled=scrollY>24;header.classList.toggle('is-scrolled',scrolled);}addEventListener('scroll',updateMobileHeader,{passive:true});addEventListener('resize',updateMobileHeader);updateMobileHeader();
function setEstimateTop(){document.documentElement.style.setProperty('--estimate-top',(document.querySelector('.header').getBoundingClientRect().height+20)+'px')}new ResizeObserver(setEstimateTop).observe(document.querySelector('.header'));setEstimateTop();
const money=n=>new Intl.NumberFormat('ru-RU').format(Math.round(n))+' ₽';
$('menu').addEventListener('click',()=>{const open=$('nav').classList.toggle('open');$('menu').setAttribute('aria-expanded',open)});document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>{$('nav').classList.remove('open');$('menu').setAttribute('aria-expanded','false')}));
let publicState=null;
function updateBaseHelp(){if(!publicState)return;const b=publicState.config.bases.find(x=>x.id===$('base').value);$('base-help').replaceChildren();const title=document.createElement('strong'),text=document.createElement('span');title.textContent=b.name;text.textContent=b.note;$('base-help').append(title,text)}
$('base').addEventListener('change',updateBaseHelp);
const patternTemplates=Object.fromEntries([...document.querySelectorAll('.pattern-card')].map(card=>[card.querySelector('input').value,card.cloneNode(true)]));
function fillOptions(id,items,selected){const select=$(id);select.replaceChildren();for(const x of items.filter(x=>x.active)){const o=document.createElement('option');o.value=x.id;o.textContent=x.name;select.append(o)}select.value=selected;if(!select.value)select.selectedIndex=0;}
function applyConfig(data){const initial=!publicState,previous=publicState;publicState=data;const c=data.config;
 for(const [key,id] of [['woods','wood'],['finishes','finish'],['bases','base'],['foundations','foundation']])fillOptions(id,c[key],initial?c.defaults[key]:$(id).value);
 const selected=initial?c.defaults.patterns:$('pattern').value;fillOptions('pattern',c.patterns,selected);
 const grid=document.querySelector('.pattern-card').parentElement;grid.replaceChildren();
 for(const x of c.patterns.filter(x=>x.active)){const undecided=x.visual==='unknown'||/не (?:выбр|определ)|пока не/i.test(x.name);const card=(patternTemplates[undecided?'unknown':x.visual]||patternTemplates.unknown).cloneNode(true),radio=card.querySelector('input');card.classList.toggle('pattern-undecided',undecided);radio.value=x.id;radio.checked=x.id===$('pattern').value;const strong=card.querySelector('strong');if(strong)strong.textContent=x.name;const detail=card.querySelector('.pattern-caption > span');if(detail)detail.textContent=x.note;card.querySelectorAll('img').forEach(img=>img.alt='Иллюстрация рисунка: '+x.name);radio.addEventListener('change',()=>{$('pattern').value=x.id;update()});grid.append(card)}
 updateBaseHelp();syncFoundation();updateChoiceHelp();
 $('contact-form').querySelector('button[type=submit]').disabled=!data.leadsEnabled;$('launch-notice').hidden=true;
 $('lead-readiness').hidden=data.leadsEnabled;$('lead-readiness').textContent=data.leadsEnabled?'Нажимая кнопку, вы отправляете заявку мастеру. Итоговую стоимость согласуем после осмотра.':'Приём заявок пока выключен. Перед запуском будут оформлены документы по персональным данным. Не вводите реальные контакты.';
 update();
 if(previous&&previous.version!==data.version&&!$('contact-form').classList.contains('submitted')){setSummary();$('form-status').textContent='Цены обновились. При необходимости заново приложите расчёт через кнопку «Обсудить смету». Окончательная смета — после осмотра.';}
}
async function refreshConfig(){try{const r=await fetch('/api/config',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(!publicState||publicState.version!==data.version||publicState.leadsEnabled!==data.leadsEnabled)applyConfig(data);}catch{if(!publicState){$('price').textContent='Расчёт недоступен';$('price-sub').textContent='Не удалось загрузить цены. Обновите страницу позже.';$('discuss').disabled=true;}}}
const range=$('area-range');
function syncAreaRange(){const n=Number($('area').value);if(!Number.isFinite(n)||n<1||n>10000)return;const max=Math.max(200,Math.ceil(n/100)*100);range.max=max;range.value=n;range.setAttribute('aria-valuetext',n.toLocaleString('ru-RU')+' м²');$('range-max').textContent=max.toLocaleString('ru-RU')+' м²';range.style.setProperty('--range-fill',((n-1)/(max-1)*100)+'%')}
range.addEventListener('input',()=>{$('area').value=range.value;syncAreaRange()});$('area').addEventListener('input',syncAreaRange);syncAreaRange();
function fitPrice(){const el=$('price');if(!el||el.clientWidth<=0)return;let low=14,high=34;el.style.fontSize=high+'px';if(el.scrollWidth<=el.clientWidth)return;for(let i=0;i<10;i++){const mid=(low+high)/2;el.style.fontSize=mid+'px';if(el.scrollWidth>el.clientWidth)high=mid;else low=mid}el.style.fontSize=(Math.floor(low*10)/10)+'px'}
const helpCopy={
 wood:['Выбор паркета','Порода, сортировка и размер плашек влияют на внешний вид и стоимость. Сравните выбранные варианты в смете. Количество считается с запасом на подрезку; окончательный запас уточним по раскладке.'],
 foundation:['Фанера или стяжка','Фанера — промежуточное основание. Возможность укладки непосредственно на стяжку зависит от её состояния и выбранных клея и грунта. Отключение фанеры меняет весь состав подготовки; окончательное решение — после осмотра.'],
 finish:['Покрытие лаком','Оба варианта рассчитаны на три слоя. Двухкомпонентный состав может подойти для повышенной нагрузки, но свойства зависят от конкретного продукта. Расход и совместимость уточняются по выбранной системе; точный расход уточним перед закупкой.']
};
function syncFoundation(){if(!publicState)return;const b=publicState.config.bases.find(x=>x.id===$('base').value);$('foundation').disabled=b.mode==='existing';const x=publicState.config.foundations.find(x=>x.id===$('foundation').value),box=$('foundation-hint');box.replaceChildren();const title=document.createElement('strong'),text=document.createElement('span');title.textContent=b.mode==='existing'?'Готовое основание':x?.name||'';text.textContent=b.mode==='existing'?'Используется состав существующего основания. Новое основание не начисляется.':x?.note||helpCopy.foundation[1];box.append(title,text);}
$('base').addEventListener('change',syncFoundation);$('foundation').addEventListener('change',syncFoundation);
function updateChoiceHelp(){if(!publicState)return;for(const [key,id] of [['woods','wood'],['finishes','finish']]){const x=publicState.config[key].find(x=>x.id===$(id).value),box=$(id+'-help');box.replaceChildren();if(!x)continue;const title=document.createElement('strong'),text=document.createElement('span');title.textContent=x.name;text.textContent=x.note||helpCopy[id][1];box.append(title,text)}}
$('wood').addEventListener('change',updateChoiceHelp);$('finish').addEventListener('change',updateChoiceHelp);
let estimate=null;
const qty=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
const scaled=(range,n)=>range.map(x=>x*n);
function sumRanges(ranges){return ranges.reduce((sum,r)=>[sum[0]+r[0],sum[1]+r[1]],[0,0]);}
function rangeText(r){return money(r[0])+'–'+money(r[1]);}
function amountFragments(el,r){const a=document.createElement('span'),b=document.createElement('span');a.textContent=money(r[0])+'–';b.textContent=money(r[1]);el.append(a,b);}
let announcementTimer;
function selection(){return {area:Number($('area').value),pattern:$('pattern').value,base:$('base').value,wood:$('wood').value,finish:$('finish').value,foundation:$('foundation').value,ownParquet:$('own-parquet').checked,ownSupplies:$('own-supplies').checked}}
function update(){
 if(!publicState){$('discuss').disabled=true;return;}
 const valid=Number.isFinite(Number($('area').value))&&Number($('area').value)>=1&&Number($('area').value)<=10000;
 $('area-error').hidden=valid;$('area').setAttribute('aria-invalid',!valid);$('discuss').disabled=!valid;
 if(!valid){$('price').textContent='Укажите площадь';$('price-sub').textContent='От 1 до 10 000 м²';$('breakdown').replaceChildren();estimate=null;fitPrice();return;}
 let r;try{r=calculate(publicState.config,selection())}catch{$('price').textContent='Нужна консультация';$('discuss').disabled=true;estimate=null;return;}
 const groups=r.groups,total=r.total;
 $('estimate-title').textContent=r.partial?'Известная часть сметы':'Стоимость выбранного комплекта';$('price').textContent=rangeText(total);fitPrice();
 $('price-sub').textContent=r.area+' м² · '+r.pattern+' · '+r.base+(r.partial?' · паркет и укладка не включены':'');
 $('breakdown').replaceChildren();
 groups.forEach(g=>{
  const section=document.createElement('section');section.className='estimate-group';
  const head=document.createElement('div');head.className='estimate-group-head';const heading=document.createElement('h4');heading.textContent=g.title;head.append(heading);
  const priced=g.rows.filter(r=>r.cost);if(priced.length){const sum=document.createElement('div');sum.className='estimate-group-total';amountFragments(sum,sumRanges(priced.map(r=>r.cost)));head.append(sum)}
  section.append(head);
  g.rows.forEach(r=>{const el=document.createElement('div');el.className='estimate-row'+(r.excluded?' excluded':'')+(r.pending?' pending':'');
   const name=document.createElement('div');name.className='estimate-row-name';const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=r.name;detail.textContent=r.detail;name.append(title,detail);
   const amount=document.createElement('div');amount.className='estimate-row-price';
   if(r.cost)amountFragments(amount,r.cost);else{amount.textContent=r.excluded?'Материал заказчика · не включён':'Отдельно';el.classList.add('excluded')}
   el.append(name,amount);section.append(el)});
  $('breakdown').append(section);
 });

 $('own-note').hidden=!$('own-parquet').checked&&!$('own-supplies').checked;$('own-note').textContent='Материалы заказчика отмечены и не включены в закупку. Совместимость проверим до начала работ.';
 $('pack-rounding-note').hidden=!r.groups.some(g=>g.rows.some(row=>row.cost&&row.unit==='уп.'));$('base-note').textContent=r.scope;estimate={...r,range:rangeText(total),own:[$('own-parquet').checked?'паркет':'',$('own-supplies').checked?'расходные материалы':''].filter(Boolean).join(', ')};
 clearTimeout(announcementTimer);announcementTimer=setTimeout(()=>{$('estimate-announcement').textContent='Смета обновлена: '+rangeText(total)},400);
}
$('calculator').addEventListener('input',update);$('calculator').addEventListener('change',update);$('calculator').addEventListener('submit',e=>e.preventDefault());update();

let lastResultWidth=0;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==lastResultWidth){lastResultWidth=width;fitPrice()}}).observe(document.querySelector('.result'));document.fonts.ready.then(fitPrice);addEventListener('resize',fitPrice);
let selectedEstimate=null;
function setSummary(summary=''){if(!summary)selectedEstimate=null;$('selected-summary').textContent=summary;$('summary-box').hidden=!summary;}
$('remove-summary').addEventListener('click',()=>setSummary());
function resetSubmission(){$('contact-form').classList.remove('submitted');$('callback-dialog').classList.remove('callback-success');$('form-status').textContent=''}
function openCallback(summary=''){resetSubmission();setSummary(summary);$('callback-form-slot').append($('contact-form'));$('callback-dialog').showModal();document.body.classList.add('modal-open');}
$('callback-dialog').addEventListener('close',()=>{resetSubmission();setSummary();$('form-home').append($('contact-form'));document.body.classList.remove('modal-open')});
document.querySelectorAll('.request-call').forEach(b=>b.addEventListener('click',()=>openCallback()));
$('discuss').addEventListener('click',()=>{if(!estimate)return;selectedEstimate={version:publicState.version,selection:structuredClone(estimate.selection)};openCallback('Ориентировочная смета: '+estimate.area+' м²; '+estimate.pattern+'; '+estimate.base+'. '+estimate.range+'. '+estimate.spec+'. '+estimate.scope+(estimate.own?' Материалы заказчика: '+estimate.own+'.':'')+(floorPhotos.length?' Добавлено фотографий пола: '+floorPhotos.length+'.':''))});
function info(title,text){$('info-title').textContent=title;$('info-text').textContent=text;$('info-dialog').showModal()}document.querySelectorAll('.call-demo').forEach(b=>b.addEventListener('click',()=>info('Телефон пока не подключён','Номер исполнителя пока не указан. Для обращения используйте форму обратной связи.')));$('info-contact').addEventListener('click',e=>{if($('callback-dialog').open)e.preventDefault();$('info-dialog').close()});const worksTrack=$('works-track'),worksCards=[...worksTrack.querySelectorAll('.gallery-card')];
let workIndex=0;
function syncWorks(){workIndex=Math.max(0,Math.min(worksCards.length-1,Math.round(worksTrack.scrollLeft/(worksCards[0].getBoundingClientRect().width+24))));$('works-count').textContent=(workIndex+1)+' / '+worksCards.length;$('works-prev').disabled=workIndex===0;$('works-next').disabled=workIndex===worksCards.length-1}
function moveWork(direction){const next=Math.max(0,Math.min(worksCards.length-1,workIndex+direction));worksTrack.scrollTo({left:next*(worksCards[0].getBoundingClientRect().width+24),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}
$('works-prev').onclick=()=>moveWork(-1);$('works-next').onclick=()=>moveWork(1);worksTrack.addEventListener('scroll',syncWorks,{passive:true});addEventListener('resize',syncWorks);worksTrack.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveWork(e.key==='ArrowRight'?1:-1)}});syncWorks();
worksCards.forEach(card=>card.querySelector('.work-photo-trigger').addEventListener('click',()=>{$('work-title').textContent=card.querySelector('h3').textContent;const pair=card.querySelector('.pair').cloneNode(true);pair.classList.add('dialog-pair');$('work-detail-photos').replaceChildren(pair);$('work-detail-copy').textContent='Пока здесь заглушки. Фотографии и описание реального объекта добавим позже.';$('work-dialog').showModal()}));document.querySelectorAll('dialog').forEach(d=>{d.querySelector('.close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}})});

async function compressedPhotos(){const photos=[];for(const item of floorPhotos){let bitmap;try{bitmap=await createImageBitmap(item.file)}catch{throw Error('Не удалось прочитать фото «'+item.file.name+'». Удалите его или добавьте JPEG/PNG.')}const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const jpeg=canvas.toDataURL('image/jpeg',.8).split(',')[1];if(jpeg.length>2800000)throw Error('Фото слишком большое. Добавьте уменьшенную копию.');photos.push({data:jpeg});}return photos;}
$('contact-form').addEventListener('submit',async e=>{e.preventDefault();const n=$('phone').value.replace(/\D/g,''),valid=n.length===10||(n.length===11&&/^[78]/.test(n));$('phone-error').hidden=valid;$('phone').setAttribute('aria-invalid',!valid);if(!valid){$('phone').focus();return;}if(!$('consent').checked){$('form-status').textContent='Подтвердите согласие на обработку данных.';return;}const b=e.submitter||$('contact-form').querySelector('button[type=submit]');b.disabled=true;$('form-status').textContent='Отправляем…';try{const photos=selectedEstimate?await compressedPhotos():[];const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('client-name').value.trim(),phone:n,comment:$('comment').value,consent:true,website:$('website').value,...(selectedEstimate||{}),photos})});const result=await response.json();if(!response.ok){if(response.status===409)await refreshConfig();throw Error(result.error||'Не удалось отправить заявку')} $('form-status').textContent='Ваша заявка отправлена. Мастер свяжется с вами в ближайшее время';$('contact-form').classList.add('submitted');$('callback-dialog').classList.add('callback-success');$('form-status').tabIndex=-1;$('form-status').focus();$('client-name').value='';$('phone').value='';$('comment').value='';$('consent').checked=true;setSummary();floorPhotos.forEach(x=>URL.revokeObjectURL(x.url));floorPhotos=[];renderFloorPhotos();}catch(e){$('form-status').textContent=e.message||'Ошибка соединения. Повторите позже.'}finally{b.disabled=!publicState?.leadsEnabled;}});
refreshConfig();setInterval(()=>{if(document.visibilityState==='visible')refreshConfig()},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshConfig()});
