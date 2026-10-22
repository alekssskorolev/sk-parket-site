import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const dir=new URL('../docs/',import.meta.url),pub=new URL('../public/',import.meta.url);mkdirSync(dir,{recursive:true});
for(const f of ['index.html','admin.html','admin.css','site.js','admin.js','engine.js','privacy.html','consent.html']){
 let s=readFileSync(new URL(f,pub),'utf8');
 if(f.endsWith('.html')){
  s=s.replaceAll('href="/"','href="./index.html"').replaceAll('href="/privacy"','href="./privacy.html"').replaceAll('href="/consent"','href="./consent.html"').replaceAll('href="/admin.css"','href="./admin.css"').replaceAll('src="/site.js"','src="./site.js"').replaceAll('src="/admin.js"','src="./admin.js"');
  const banner='<div class="pages-demo-notice" role="note"><strong>Демонстрация · не рабочий сайт.</strong> Все изменения и тестовые заявки сохраняются только в этом браузере. Нет общей базы и настоящего входа. Не вводите реальные контакты. <a href="./index.html">Сайт</a> · <a href="./admin.html">Демо-админка</a></div>';
  const style='<style>.pages-demo-notice{position:relative;z-index:50;background:#fff0ca;color:#654b14;padding:12px 20px;text-align:center;font:13px/1.6 Arial,sans-serif}.pages-demo-notice a{color:#1b5890;white-space:nowrap}.demo-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}.demo-tools button{font-size:12px}.demo-tools input{max-width:260px}</style>';
  s=s.replace('</head>','<meta name="robots" content="noindex,nofollow">'+style+'</head>').replace(/<body([^>]*)>/,'<body$1>'+banner);
 }
 if(f.endsWith('.js')&&f!=='engine.js')s="import './demo-api.js';\n"+s.replaceAll("from '/engine.js'","from './engine.js'");
 if(f==='site.js'){
  s=s.replace("$('contact-form').querySelector('button[type=submit]').disabled=!data.leadsEnabled;","$('contact-form').querySelector('button[type=submit]').disabled=!data.leadsEnabled;$('contact-form').querySelector('button[type=submit]').textContent='Сохранить тестовую заявку';$('phone').value='79990000000';$('phone').readOnly=true;$('phone').setAttribute('aria-label','Фиктивный телефон для теста, не используется для звонков');");
  s=s.replace("$('lead-readiness').textContent=data.leadsEnabled?", "$('lead-readiness').textContent=true?'Демо: запись останется только в вашем браузере. Никуда не отправляется, звонка не будет.':");
  // replace complete ternary assignment left over after the preceding replacement
  s=s.replace(/\$\('lead-readiness'\)\.textContent=true\?'Демо:[^;]+;/, "$('lead-readiness').textContent='Демо: запись останется только в вашем браузере. Никуда не отправляется, звонка не будет.';");
  s=s.replace("$('form-status').textContent='Заявка №'+result.id+' принята. Мастер свяжется с вами.';", "$('form-status').textContent='Тестовая заявка №'+result.id+' сохранена только в этом браузере. Звонка не будет.';");
  s=s.replace("$('phone').value='';", "$('phone').value='79990000000';");
  s += "\naddEventListener('storage',e=>{if(e.key==='sk-parket-pages-demo-v1')refreshConfig()});addEventListener('sk-demo-update',refreshConfig);\n";
 }
 if(f==='admin.js'){
  s=s.replace("$('logout').onclick=guarded(async()=>{if(dirty&&!confirm('Несохранённые изменения будут потеряны. Выйти?'))return;await api('/api/logout','POST',{});location.reload()});", "$('logout').textContent='К сайту';$('logout').onclick=()=>{if(!dirty||confirm('Уйти без сохранения черновика?'))location.href='./index.html'};");
  s=s.replace("a.href='/api/admin/photos/'+ph.id;", "a.href=window.skDemoPhoto(ph.id);");
  s=s.replace('Контакты доступны только после входа.','Демо-заявки доступны только в текущем браузере; настоящей авторизации нет.');
  s=s.replace("$('title').textContent=labels[section];", "$('title').textContent=labels[section];if(section==='woods')window.skDemoTools?.();");
  s += `\nwindow.skDemoTools=()=>{if(document.querySelector('.demo-tools'))return;const d=el('div',undefined,'demo-tools'),exportButton=el('button','Скачать настройки JSON','quiet'),reset=el('button','Сбросить демо-данные','quiet danger');exportButton.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='sk-parket-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};const file=el('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','Импорт настроек JSON');file.onchange=guarded(async()=>{const f=file.files[0];if(!f)return;if(f.size>1000000)throw Error('Файл слишком большой');const next=JSON.parse(await f.text());validateConfig(next);c=next;mark();render();toast('Настройки загружены в черновик. Проверьте и сохраните.')});reset.onclick=()=>{if(confirm('Стереть локальные настройки и все тестовые заявки?')){localStorage.removeItem('sk-parket-pages-demo-v1');dirty=false;location.reload()}};d.append(exportButton,file,reset);document.querySelector('main').insertBefore(d,$('intro'));};window.skDemoTools();\n`;
 }
 if(f==='admin.html')s=s.replace('Управление сайтом</span>','Демо-конструктор</span>');
 if(f==='index.html')s=s.replace('Даю <a','Для теста подтверждаю <a');
 writeFileSync(new URL(f,dir),s);
}
copyFileSync(new URL('../config.seed.json',import.meta.url),new URL('config.seed.json',dir));copyFileSync(new URL('demo-api.js',import.meta.url),new URL('demo-api.js',dir));writeFileSync(new URL('.nojekyll',dir),'');
console.log('Static demo built in docs/');
