import {renderPublic} from './render-public.mjs';
import {productionSeo} from './seo.mjs';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync} from 'node:fs';
const root=new URL('../',import.meta.url),dir=new URL('docs/',root),pub=new URL('public/',root),src=new URL('web-cloud/',root);mkdirSync(dir,{recursive:true});
if(readFileSync(new URL('CNAME',dir),'utf8').trim()!=='skparket.ru')throw new Error('Production SEO build requires the skparket.ru custom domain');
let html=readFileSync(new URL('index.html',pub),'utf8');
html=html.replaceAll('href="/privacy"','href="./privacy.html"').replaceAll('href="/consent"','href="./consent.html"').replaceAll('src="/site.js"','src="./site.js?v=seo-static-4"');
writeFileSync(new URL('index.html',dir),productionSeo(renderPublic(html)));
for(const f of ['favicon.svg','favicon.ico'])copyFileSync(new URL(f,pub),new URL(f,dir));
for(const f of ['robots.txt','sitemap.xml'])copyFileSync(new URL(f,src),new URL(f,dir));
copyFileSync(new URL('limestone.css',pub),new URL('limestone.css',dir));mkdirSync(new URL('assets/',dir),{recursive:true});copyFileSync(new URL('assets/hero-parquet.svg',pub),new URL('assets/hero-parquet.svg',dir));
cpSync(new URL('assets/seo/',pub),new URL('assets/seo/',dir),{recursive:true});
for(const f of ['site.js','api.js','image-manifest.js'])copyFileSync(new URL(f,src),new URL(f,dir));
for(const f of ['engine.js','privacy.html','consent.html']){let s=readFileSync(new URL(f,pub),'utf8').replaceAll('href="/privacy"','href="./privacy.html"').replaceAll('href="/consent"','href="./consent.html"');writeFileSync(new URL(f,dir),s)}
const admin='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net/admin';
writeFileSync(new URL('admin.html',dir),`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${admin}"><title>Защищённая админка SK Паркет</title><p>Админка работает по отдельному защищённому адресу.</p><p><a href="${admin}">Перейти в админку</a></p></html>`);
writeFileSync(new URL('.nojekyll',dir),'');console.log('Cloud-connected Pages site built; intake policy is controlled by server configuration.');
