import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productionSeo,canonical,title,description} from '../scripts/seo.mjs';
import {renderPublic} from '../scripts/render-public.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('production SEO is restricted to the production build and preserves interactive forms',()=>{
 const source=read('public/index.html'),output=read('docs/index.html');
 assert.match(source, /noindex,nofollow/);
 assert.match(read('scripts/build-demo.mjs'), /noindex,nofollow/);
 assert.match(read('docs/admin.html'), /noindex,nofollow/);
 assert.doesNotMatch(output, /noindex|nofollow/i);
 assert.equal((output.match(/rel="canonical"/g)||[]).length,1);
 assert.ok(output.includes('<link rel="canonical" href="'+canonical+'">'));
 assert.ok(output.includes('<title>'+title+'</title>'));
 assert.ok(output.includes('content="'+description+'"'));
 assert.equal((output.match(/<h1\b/g)||[]).length,1);
 const expected=source.replaceAll('href="/privacy"','href="./privacy.html"').replaceAll('href="/consent"','href="./consent.html"').replaceAll('src="/site.js"','src="./site.js?v=seo-static-3"');
 assert.equal(output,productionSeo(renderPublic(expected)));
 const forms=s=>[...s.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m=>m[0]);assert.deepEqual(forms(output),forms(expected));
 assert.equal(productionSeo(output),output);
});
test('crawl files are reproducible and contain only the published commercial canonical',()=>{
 for(const file of ['robots.txt','sitemap.xml'])assert.equal(read('docs/'+file),read('web-cloud/'+file));
 const robots=read('docs/robots.txt'),xml=read('docs/sitemap.xml');
 assert.match(robots,/Sitemap: https:\/\/skparket.ru\/sitemap.xml/);
 assert.doesNotMatch(robots,/Disallow:|noindex/i);
 assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),[canonical]);
 assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
 assert.equal(read('docs/CNAME').trim(),'skparket.ru');
});

test('published portfolio is generated from public snapshots',()=>{
 const html=read('docs/index.html'),g=JSON.parse(read('public/content/gallery.json')),p=JSON.parse(read('public/content/prices.json'));
 assert.equal((html.match(/data-gallery-id=/g)||[]).length,g.items.length);
 assert.equal(g.items.length,21);
 for(const x of g.items){assert.ok(html.includes(x.id));assert.ok(html.includes(x.title));}
 assert.doesNotMatch(html,/Здесь будет фото|data:image\//);
 assert.doesNotMatch(html,/published-rates|Как складывается стоимость/);
 const configKeys=Object.keys(p).sort();
 assert.deepEqual(configKeys,['config','fetchedAt','source','updated','version']);
 assert.equal(g.items.filter(x=>!x.description).length,8);
});

test('minimal business schema matches visible contacts and introduces no unsupported business claims',()=>{
 const html=read('docs/index.html'),scripts=[...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const data=JSON.parse(scripts[0][1]),[org,service]=data['@graph'];
 assert.equal(data['@context'],'https://schema.org');
 assert.deepEqual(data['@graph'].map(x=>x['@type']),['Organization','Service']);
 assert.equal(org.name,'SK паркет');assert.equal(org.url,canonical);
 assert.ok(html.includes('href="tel:'+org.telephone+'"'));assert.ok(html.includes('href="mailto:'+org.email+'"'));
 assert.equal(service.provider['@id'],org['@id']);assert.equal(service.areaServed.name,'Санкт-Петербург');
 assert.equal(service.url,canonical);
 assert.doesNotMatch(JSON.stringify(data),/AggregateRating|Review|PostalAddress|LocalBusiness|price|offers/);
});

