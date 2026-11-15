import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultHero} from '../public/hero-display.js';
const source=readFileSync(new URL('../public/hero.js',import.meta.url),'utf8');
const KEY='skparket:hero:published:v1';
const manifest=(revision=7)=>({...defaultHero(),revision,desktop:{...defaultHero().desktop,image:'/api/gallery/images/11111111-1111-4111-8111-111111111111'},mobile:{...defaultHero().mobile,image:'/api/gallery/images/22222222-2222-4222-8222-222222222222'}});
function harness({cached=null,mobile=false,blocked=false}={}){
 const paints=[],writes=[];let resolve,reject,change;
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no});
 const query={matches:!mobile,addEventListener(type,fn){assert.equal(type,'change');change=fn}};
 const run=new Function('createHeroDisplay','defaultHero','document','matchMedia','fetch','localStorage','AbortSignal','setTimeout','return (async()=>{'+source.replace(/^import[^\n]*\n/,'')+'})();');
 const done=run(()=>({apply(settings,device){paints.push({settings,device})}}),defaultHero,{getElementById(){return {}}},()=>query,()=>pending,{getItem(){if(blocked)throw Error('blocked');return cached},setItem(key,value){if(blocked)throw Error('blocked');writes.push({key,value})}},{timeout(){return {}}},()=>{throw Error('No delayed fallback may be scheduled')});
 return {paints,writes,done,reply(data,ok=true){resolve({ok,json:async()=>data})},fail(){reject(Error('offline'))},resize(mobile){query.matches=!mobile;change()}};
}
const cache=(config=manifest(),savedAt=Date.now(),version=1)=>JSON.stringify({version,savedAt,config});
test('cold load never paints a default before published settings arrive',async()=>{
 const h=harness();assert.equal(h.paints.length,0);h.reply(manifest());await h.done;
 assert.equal(h.paints.length,1);assert.ok(h.paints[0].settings.image.endsWith('11111111-1111-4111-8111-111111111111'));
 assert.equal(h.writes[0].key,KEY);
});
test('valid cache paints synchronously, unchanged response does not repaint',async()=>{
 const h=harness({cached:cache()});assert.equal(h.paints.length,1);h.reply(manifest());await h.done;assert.equal(h.paints.length,1);
});
test('new publication replaces cached settings and refreshes the cache',async()=>{
 const h=harness({cached:cache()});const next=manifest(8);next.desktop.panX=20;h.reply(next);await h.done;
 assert.equal(h.paints.length,2);assert.equal(h.paints[1].settings.panX,20);assert.equal(JSON.parse(h.writes[0].value).config.revision,8);
});
test('mobile cache and resizing work while the server is pending',async()=>{
 const h=harness({cached:cache(),mobile:true});assert.equal(h.paints[0].device,'mobile');h.resize(false);assert.equal(h.paints[1].device,'desktop');h.fail();await h.done;assert.equal(h.paints.length,2);
});
test('terminal network/HTTP/invalid-manifest failures preserve cached publication',async()=>{
 for(const failure of ['network','http','invalid']){const h=harness({cached:cache()});if(failure==='network')h.fail();else h.reply(failure==='invalid'?{}:manifest(),failure!=='http');await h.done;assert.equal(h.paints.length,1);assert.equal(h.writes.length,0)}
});
test('cold terminal failure paints defaults once and never caches fallback',async()=>{
 const h=harness();assert.equal(h.paints.length,0);h.fail();await h.done;assert.equal(h.paints.length,1);assert.equal(h.paints[0].settings.image,null);assert.equal(h.writes.length,0);
});
test('corrupt, stale, future, unsupported and unsafe caches are ignored',async()=>{
 const unsafe=manifest();unsafe.desktop.image='https://untrusted.example/pixel';
 const badBounds=manifest();badBounds.mobile.zoom=999;
 for(const cached of ['{',cache(manifest(),Date.now()-25*3600000),cache(manifest(),Date.now()+3600000),cache(manifest(),Date.now(),2),cache(unsafe),cache(badBounds)]){
  const h=harness({cached});assert.equal(h.paints.length,0);h.reply(manifest());await h.done;assert.equal(h.paints.length,1);
 }
});
test('blocked storage does not prevent published background rendering',async()=>{
 const h=harness({blocked:true});h.reply(manifest());await h.done;assert.equal(h.paints.length,1);
});
