import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),dir=new URL('docs/',root),pub=new URL('public/',root),src=new URL('web-cloud/',root);mkdirSync(dir,{recursive:true});
let html=readFileSync(new URL('index.html',pub),'utf8');
html=html.replaceAll('href="/"','href="./index.html"').replaceAll('href="/privacy"','href="./privacy.html"').replaceAll('href="/consent"','href="./consent.html"').replaceAll('src="/site.js"','src="./site.js?v=cloud-1"');
html=html.replace(/<input\b(?=[^>]*\bid="consent")[^>]*>/,tag=>tag.replace(/\schecked(?:="[^"]*")?/g,''));
writeFileSync(new URL('index.html',dir),html);
for(const f of ['site.js','api.js'])copyFileSync(new URL(f,src),new URL(f,dir));
for(const f of ['engine.js','privacy.html','consent.html']){let s=readFileSync(new URL(f,pub),'utf8').replaceAll('href="/"','href="./index.html"');writeFileSync(new URL(f,dir),s)}
const admin='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net/admin';
writeFileSync(new URL('admin.html',dir),`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${admin}"><title>Защищённая админка SK Паркет</title><p>Админка работает по отдельному защищённому адресу.</p><p><a href="${admin}">Перейти в админку</a></p></html>`);
writeFileSync(new URL('.nojekyll',dir),'');console.log('Cloud-connected Pages site built; intake policy is controlled by server configuration.');
