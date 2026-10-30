import {checkImageAssets} from './check-image-assets.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonical,title,description,businessSchema} from './seo.mjs';
const out=process.argv[2]||'seo-evidence/public';mkdirSync(out,{recursive:true});
const expected=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
async function get(name,url){
 const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(45000)}),body=await r.text();
 const headers=Object.fromEntries(r.headers);
 writeFileSync(out+'/'+name+'.headers.json',JSON.stringify(headers,null,2));
 writeFileSync(out+'/'+name+'.body',body);
 console.log(JSON.stringify({name,url,status:r.status,bytes:Buffer.byteLength(body),location:headers.location,contentType:headers['content-type'],sha256:hash(body)}));
 return {r,body,headers};
}
// Pages publication and edge caches are asynchronous. Accept only the exact built HTML.
let home;
for(let attempt=0;attempt<20;attempt++){
 home=await get('home',canonical+'?seo_release='+hash(expected).slice(0,12));
 if(home.r.status===200&&hash(home.body)===hash(expected))break;
 if(attempt===19)throw Error('Production did not serve the expected release');
 await new Promise(resolve=>setTimeout(resolve,15000));
}
for(const [name,url] of [['canonical',canonical],['index',canonical+'index.html'],['utm',canonical+'?utm_source=seo_audit'],['query',canonical+'?seo_audit=1']]){
 const x=await get(name,url);assert.equal(x.r.status,200);
 assert.doesNotMatch(x.headers['x-robots-tag']||'',/noindex|nofollow/i);
 assert.doesNotMatch(x.body.match(/<head>[\s\S]*?<\/head>/i)?.[0]||'',/noindex|nofollow/i);
 assert.equal((x.body.match(/rel="canonical"/g)||[]).length,1);
 assert.ok(x.body.includes('href="'+canonical+'"'));
 assert.ok(x.body.includes('<title>'+title+'</title>'));
 assert.ok(x.body.includes('content="'+description+'"'));
}
for(const [name,url] of [['http','http://skparket.ru/'],['www','https://www.skparket.ru/'],['http-www','http://www.skparket.ru/']]){
 const x=await get(name,url);assert.equal(x.r.status,301);assert.equal(x.headers.location,canonical);
}
for(const [name,path,type] of [['robots','robots.txt',/text\/plain/],['sitemap','sitemap.xml',/(application|text)\/xml/]]){
 const x=await get(name,canonical+path);assert.equal(x.r.status,200);assert.match(x.headers['content-type'],type);
 assert.equal(x.body,readFileSync(new URL('../docs/'+path,import.meta.url),'utf8'));
}
assert.equal((await get('404',canonical+'seo-audit-nonexistent-20261030/')).r.status,404);
assert.equal((await get('sitemap-index',canonical+'sitemap_index.xml')).r.status,404);
for(const path of ['privacy.html','consent.html']){
 const x=await get(path,canonical+path);assert.equal(x.r.status,200);
 assert.equal(x.body,readFileSync(new URL('../docs/'+path,import.meta.url),'utf8'));
}
const api='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net';
for(const path of ['config','gallery'])assert.equal((await get(path,api+'/api/'+path)).r.status,200);

assert.doesNotMatch(home.body,/data:image\//);
assert.doesNotMatch(home.body,/Здесь будет фото/);
assert.equal((home.body.match(/data-gallery-id=/g)||[]).length,21);
assert.match(home.body,/id="published-rates"/);
await checkImageAssets(out);
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(home.body),staticCards:21}));
const schemaScripts=[...home.body.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(schemaScripts.length,1);assert.deepEqual(JSON.parse(schemaScripts[0][1]),businessSchema);
console.log(JSON.stringify({schema:'Organization + Service',publicJsonValid:true,visibleContactsMatch:home.body.includes('tel:'+businessSchema['@graph'][0].telephone)&&home.body.includes('mailto:'+businessSchema['@graph'][0].email)}));
console.log('PASS: production HTML, indexing headers, canonical variants, crawl files, redirects, true 404, legal documents and public API. No leads submitted.');
