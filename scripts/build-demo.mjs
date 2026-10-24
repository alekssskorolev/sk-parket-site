import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const dir=new URL('../docs/',import.meta.url),pub=new URL('../public/',import.meta.url);mkdirSync(dir,{recursive:true});
for(const f of ['index.html','admin.html','admin.css','site.js','admin.js','engine.js','lead-export.js','privacy.html','consent.html']){
 let s=readFileSync(new URL(f,pub),'utf8');
 if(f.endsWith('.html')){
  s=s.replaceAll('href="/"','href="./index.html"').replaceAll('href="/privacy"','href="./privacy.html"').replaceAll('href="/consent"','href="./consent.html"').replaceAll('href="/admin.css"','href="./admin.css"').replaceAll('src="/site.js"','src="./site.js"').replaceAll('src="/admin.js"','src="./admin.js"');
  s=s.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
 }
 if(f.endsWith('.js')&&!['engine.js','lead-export.js'].includes(f))s="import './demo-api.js';\n"+s.replaceAll("from '/engine.js'","from './engine.js'").replaceAll("from '/lead-export.js'","from './lead-export.js'");
 if(f==='site.js'){
  s=s.replace("Ваша заявка отправлена. Мастер свяжется с вами в ближайшее время", "Ваша заявка сохранена в этом браузере. Отправка мастеру пока не подключена.");
  s += "\naddEventListener('storage',e=>{if(e.key==='sk-parket-pages-demo-v1')refreshConfig()});addEventListener('sk-demo-update',refreshConfig);\n";
 }
 if(f==='admin.js'){
  s=s.replace("$('logout').onclick=guarded(async()=>{if(dirty&&!confirm('Несохранённые изменения будут потеряны. Выйти?'))return;await api('/api/logout','POST',{});location.reload()});", "$('logout').textContent='К сайту';$('logout').onclick=()=>{if(!dirty||confirm('Уйти без сохранения черновика?'))location.href='./index.html'};");
  s=s.replace("a.href='/api/admin/photos/'+ph.id;", "a.href=window.skDemoPhoto(ph.id);");

 }
 if(f==='admin.html')s=s.replace('<p class="aside-note">','<p class="aside-note">Данные хранятся только в текущем браузере. Общая база и защита входа пока не подключены.<br><br>');
 writeFileSync(new URL(f,dir),s);
}
copyFileSync(new URL('../config.seed.json',import.meta.url),new URL('config.seed.json',dir));copyFileSync(new URL('demo-api.js',import.meta.url),new URL('demo-api.js',dir));writeFileSync(new URL('.nojekyll',dir),'');
console.log('Static demo built in docs/');
