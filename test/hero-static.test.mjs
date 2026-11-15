import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHero} from '../scripts/render-hero.mjs';
import {gradient} from '../public/hero-display.js';
import {validateHeroManifest,validateHeroSnapshot,HERO_ORIGIN} from '../scripts/hero-content.mjs';
import {readManifest,boundedBytes,needsRefresh} from '../scripts/refresh-hero-content.mjs';
import {pagesBuildAction,requestPagesBuild,waitForPagesBuild,verifyStaticHero} from '../scripts/request-hero-pages-build.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const snapshot=JSON.parse(read('public/content/hero.json'));
test('published HTML exposes only local eager hero sources and media preloads, no manifest loader',()=>{
 const html=read('docs/index.html');assert.ok(html.includes('hero-static'));assert.ok(!/<script[^>]+src="[^\"]*hero\.js/.test(html));
 assert.equal((html.match(/rel="preload" as="image"/g)||[]).length,2);
 for(const device of ['desktop','mobile'])assert.ok(html.includes(snapshot.images[device].src));
 assert.ok(/class="hero-background"[^>]*loading="eager"[^>]*fetchpriority="high"/.test(html));
 assert.ok(!html.includes(HERO_ORIGIN+'/api/gallery?view=hero'));assert.ok(html.includes('container-type:size'));
});
test('static renderer uses the shared overlay and keeps both independently published settings',()=>{
 const html=renderHero(read('public/index.html'),snapshot);
 for(const device of ['desktop','mobile']){const c=snapshot.published[device];assert.ok(html.includes('--hero-overlay:'+gradient(c)));assert.ok(html.includes('--hero-pan-x:'+c.panX/100));assert.ok(html.includes('--hero-pan-y:'+c.panY/100))}
 assert.ok(html.includes('data-hero-revision="'+snapshot.published.revision+'"'));
 assert.equal(renderHero(read('public/index.html'),snapshot),html);
});
test('manifest and snapshot validation reject redirects, draft URLs, paths and invalid settings',()=>{
 for(const image of ['https://untrusted.example/x','/api/admin/gallery/media/11111111-1111-4111-8111-111111111111','../secret']){const x=structuredClone(snapshot.published);x.desktop.image=image;assert.throws(()=>validateHeroManifest(x))}
 for(const [key,value]of [['zoom',0],['brightness',Infinity],['text','<script>'],['name','bad\nname']]){const x=structuredClone(snapshot.published);x.mobile[key]=value;assert.throws(()=>validateHeroManifest(x))}
 const bad=structuredClone(snapshot);bad.images.desktop.src='./assets/hero/../x.webp';assert.throws(()=>validateHeroSnapshot(bad));
});
test('public response reads are bounded, manifest requests stay on fixed origin with redirects disabled',async()=>{
 assert.equal((await boundedBytes(new Response('abc'),3)).toString(),'abc');await assert.rejects(boundedBytes(new Response('abcd'),3));
 await assert.rejects(boundedBytes(new Response('x',{headers:{'content-length':'100'}}),3));
 const value=await readManifest(async(url,options)=>{assert.equal(url,HERO_ORIGIN+'/api/gallery?view=hero');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return Response.json(snapshot.published)});assert.deepEqual(value,validateHeroManifest(snapshot.published));
 assert.equal(needsRefresh(value),false);
});
test('Pages recovery handles unchanged snapshots, failed requests and existing queued builds',async()=>{
 const head='a'.repeat(40);assert.equal(pagesBuildAction({status:'built',commit:head},head),'current');assert.equal(pagesBuildAction({status:'errored',commit:head},head),'request');assert.equal(pagesBuildAction({status:'built',commit:'b'.repeat(40)},head),'request');assert.equal(pagesBuildAction({status:'building'},head),'pending');
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return options.method==='POST'?Response.json({status:'queued'}):Response.json({status:'built',commit:head})};
 assert.equal(await requestPagesBuild({repository:'alekssskorolev/sk-parket-site',token:'fixture',head,fetcher}),'current');assert.equal(calls.length,1);
 assert.equal(await requestPagesBuild({repository:'alekssskorolev/sk-parket-site',token:'fixture',head,force:true,fetcher}),'request');assert.equal(calls.length,3);assert.equal(calls[2].options.method,'POST');
 await assert.rejects(requestPagesBuild({repository:'other/repo',token:'fixture',head,fetcher}));
});
test('Pages confirmation waits for target commit and recovers from an older queued build',async()=>{
 const head='a'.repeat(40),older='b'.repeat(40),states=[{status:'building',commit:older},{status:'built',commit:older},{status:'queued',commit:head},{status:'built',commit:head}];let requests=0;
 const context={repository:'alekssskorolev/sk-parket-site',token:'fixture',head,sleep:async()=>{},maxAttempts:5};
 await waitForPagesBuild({...context,fetcher:async(url,options)=>{if(options.method==='POST'){requests++;return Response.json({status:'queued'})}return Response.json(states.shift())}});assert.equal(requests,1);
 await assert.rejects(waitForPagesBuild({...context,fetcher:async()=>Response.json({status:'errored',commit:head})}));
 await assert.rejects(waitForPagesBuild({...context,maxAttempts:2,fetcher:async()=>Response.json({status:'building',commit:older})}));
});
test('a forced same-commit build must observe the new build before reporting success',async()=>{
 const head='a'.repeat(40),old={status:'built',commit:head,created_at:'2026-01-01'},states=[old,{status:'queued',commit:head,created_at:'2026-01-02'},{status:'built',commit:head,created_at:'2026-01-02'}];let reads=0;
 await waitForPagesBuild({repository:'alekssskorolev/sk-parket-site',token:'fixture',head,requested:true,requireFresh:true,previousBuild:old,sleep:async()=>{},fetcher:async()=>{reads++;return Response.json(states.shift())}});assert.equal(reads,3);
});
test('publication verification checks HTML revision and both local immutable asset bytes',async()=>{
 const visited=[];
 await verifyStaticHero({snapshot,sleep:async()=>{},fetcher:async url=>{visited.push(url);return url.includes('?')?new Response(read('docs/index.html'),{headers:{'content-type':'text/html'}}):new Response(readFileSync(new URL('../public/'+url.split('https://skparket.ru/')[1],import.meta.url)),{headers:{'content-type':'image/webp'}})}});
 assert.equal(visited.length,1+new Set(Object.values(snapshot.images).map(x=>x.src)).size);
 await assert.rejects(verifyStaticHero({snapshot,maxAttempts:1,fetcher:async()=>new Response('old',{headers:{'content-type':'text/html'}})}));
});
