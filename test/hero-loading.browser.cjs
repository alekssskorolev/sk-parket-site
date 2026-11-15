// Offline browser fixtures: never sends requests or writes to production.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ORIGIN='https://hero-fixture.example';
const ids={desktop:'11111111-1111-4111-8111-111111111111',mobile:'22222222-2222-4222-8222-222222222222'};
(async()=>{
 const {defaultHero}=await import('../public/hero-display.js');
 const publication=()=>({revision:7,...defaultHero(),desktop:{...defaultHero().desktop,image:'/api/gallery/images/'+ids.desktop},mobile:{...defaultHero().mobile,image:'/api/gallery/images/'+ids.mobile}});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  async function fixture({width=1200,blocked=false}={}){
   const context=await browser.newContext({viewport:{width,height:900}});
   if(blocked)await context.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')}});
   let release,started,decision;const requests=[],errors=[],page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const hold=()=>{decision=new Promise(r=>{release=r});return new Promise(r=>{started=r})};
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());requests.push(u.pathname);
    if(u.pathname==='/api/gallery'&&u.searchParams.get('view')==='hero'){started();const value=await decision;if(value===null)return route.abort('failed');return route.fulfill({contentType:'application/json',body:JSON.stringify(value),headers:{'access-control-allow-origin':'*'}})}
    if(u.pathname.startsWith('/api/gallery/images/')||u.pathname.startsWith('/assets/hero-'))return route.fulfill({contentType:'image/webp',body:fs.readFileSync(root+'/public/assets/hero-desktop.webp')});
    if(u.pathname==='/hero.js'||u.pathname==='/hero-display.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/docs'+u.pathname)});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>#hero{height:500px}.hero-inner{height:100%}</style><section id="hero" class="hero"><div class="hero-inner">Hero fixture</div></section><script type="module" src="/hero.js"></script>'});
    return route.abort();
   });
   return {context,page,requests,errors,hold,release:value=>release(value)};
  }
  for(const width of [390,1200]){
   const f=await fixture({width}),device=width<700?'mobile':'desktop';let pending=f.hold();
   await f.page.goto(ORIGIN+'/',{waitUntil:'commit'});await pending;await f.page.waitForTimeout(2100);
   assert.equal(await f.page.locator('.hero-background').count(),0);assert.ok(!f.requests.some(p=>p.startsWith('/assets/hero-')),'no premature default');
   f.release(publication());await f.page.waitForFunction(()=>document.querySelector('.hero-background')?.naturalWidth>0);
   assert.ok((await f.page.locator('.hero-background').getAttribute('src')).endsWith(ids[device]));
   pending=f.hold();await f.page.reload({waitUntil:'commit'});await pending;
   await f.page.waitForFunction(()=>document.querySelector('.hero-background')?.naturalWidth>0);
   assert.ok((await f.page.locator('.hero-background').getAttribute('src')).endsWith(ids[device]));
   const other=device==='mobile'?'desktop':'mobile';await f.page.setViewportSize({width:device==='mobile'?1200:390,height:900});
   await f.page.waitForFunction(id=>document.querySelector('.hero-background')?.src.endsWith(id),ids[other]);
   const next=publication();next.revision=8;next[other].panX=20;f.release(next);
   await f.page.waitForFunction(()=>JSON.parse(localStorage.getItem('skparket:hero:published:v1'))?.config.revision===8);
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS cold slow manifest / warm cache / viewport switch '+width);
  }
  for(const blocked of [false,true]){
   const f=await fixture({blocked}),pending=f.hold();await f.page.goto(ORIGIN+'/',{waitUntil:'commit'});await pending;
   assert.equal(await f.page.locator('.hero-background').count(),0);f.release(blocked?publication():null);
   await f.page.waitForFunction(()=>document.querySelector('.hero-background')?.naturalWidth>0);
   assert.ok((await f.page.locator('.hero-background').getAttribute('src')).endsWith(blocked?ids.desktop:'hero-desktop.webp'));
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS '+(blocked?'blocked storage':'cold terminal fallback'));
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
