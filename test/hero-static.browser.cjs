// All resources are local fixtures. The cloud APIs are deliberately unavailable.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ORIGIN='https://static-hero.example';
(async()=>{
 const {renderHero}=await import('../scripts/render-hero.mjs'),snapshot=JSON.parse(fs.readFileSync(root+'/public/content/hero.json','utf8')),template=fs.readFileSync(root+'/public/index.html','utf8');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const width of [390,1200])for(const javascript of [false,true]){
   const context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled:javascript}),requests=[],errors=[];
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());requests.push(u.pathname+u.search);
    if(u.hostname!==new URL(ORIGIN).hostname||u.pathname.startsWith('/api/'))return route.abort();
    const file=path.join(root,'docs',u.pathname==='/'?'index.html':u.pathname);
    if(!fs.existsSync(file))return route.abort();
    const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream';return route.fulfill({contentType:type,body:fs.readFileSync(file)});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(ORIGIN+'/',{waitUntil:'load'});
   await page.waitForFunction(()=>document.querySelector('#hero .hero-background')?.naturalWidth>0);
   const device=width<700?'mobile':'desktop',other=width<700?'desktop':'mobile',chosen=snapshot.images[device];
   const src=await page.locator('#hero .hero-background').evaluate(img=>img.currentSrc);assert.ok(src.endsWith(chosen.src.slice(1)));
   assert.ok(requests.includes(chosen.src.slice(1)));if(chosen.src!==snapshot.images[other].src)assert.ok(!requests.includes(snapshot.images[other].src.slice(1)),'other device image must not download');
   assert.ok(!requests.some(x=>x.includes('view=hero')));assert.ok(!requests.some(x=>/^\/hero\.js/.test(x)));
   assert.equal(await page.locator('#hero').getAttribute('data-hero-revision'),String(snapshot.published.revision));assert.deepEqual(errors,[]);
   console.log('PASS actual static page, empty cache, cloud blocked, '+width+' px, JS '+javascript);await context.close();
  }
  {
   const context=await browser.newContext({viewport:{width:900,height:900},javaScriptEnabled:false});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><iframe src="/fractional.html" style="width:699.5px;height:850px;border:0"></iframe>'});const file=path.join(root,'docs',u.pathname==='/fractional.html'?'index.html':u.pathname);if(!fs.existsSync(file))return route.abort();return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream',body:fs.readFileSync(file)})});
   const page=await context.newPage();await page.goto(ORIGIN+'/',{waitUntil:'load'});
   const selected=await page.frameLocator('iframe').locator('#hero .hero-background').evaluate(img=>({src:img.currentSrc,width:img.getBoundingClientRect().width,desktop:matchMedia('(min-width:700px)').matches,mobile:matchMedia('(width < 700px)').matches,viewport:innerWidth}));
   assert.notEqual(selected.desktop,selected.mobile);assert.ok(selected.src.endsWith(snapshot.images[selected.desktop?'desktop':'mobile'].src.slice(1)));assert.ok(selected.width>0);await context.close();console.log('PASS fractional 699.5 px frame matches device media and has a sized image: '+JSON.stringify(selected));
  }
  // Compare CSS-only image geometry to the shared editor renderer, including
  // zoom below 100% where object-fit + transform would crop the image early.
  for(const width of [390,1200])for(const zoom of [70,100,150])for(const pan of [0,100]){
   const s=structuredClone(snapshot),device=width<700?'mobile':'desktop';Object.assign(s.published[device],{zoom,panX:pan,panY:100-pan});
   const html=renderHero(template,s),context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled:false});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});const file=path.join(root,'docs',u.pathname);if(!fs.existsSync(file))return route.abort();return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream',body:fs.readFileSync(file)})});
   const page=await context.newPage();await page.goto(ORIGIN+'/',{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#hero .hero-background')?.naturalWidth>0);
   const actual=await page.locator('#hero').evaluate(hero=>{const image=hero.querySelector('.hero-background'),style=getComputedStyle(image);return {width:hero.clientWidth,height:hero.clientHeight,imageWidth:parseFloat(style.width),imageHeight:parseFloat(style.height),left:parseFloat(style.left),top:parseFloat(style.top),color:getComputedStyle(hero.querySelector('.hero-title')).color,overlay:getComputedStyle(hero).getPropertyValue('--hero-overlay').trim()}});
   const image=s.images[device],c=s.published[device],scale=Math.max(actual.width/image.width,actual.height/image.height)*zoom/100;
   for(const [key,expected]of Object.entries({imageWidth:image.width*scale,imageHeight:image.height*scale,left:(actual.width-image.width*scale)*pan/100,top:(actual.height-image.height*scale)*(100-pan)/100}))assert.ok(Math.abs(actual[key]-expected)<1,key+' differs: '+JSON.stringify(actual));
   assert.equal(actual.color,c.text==='light'?'rgb(255, 255, 255)':'rgb(48, 45, 41)');
   const {gradient}=await import('../public/hero-display.js');assert.equal(actual.overlay,gradient(c));await context.close();
  }
  console.log('PASS CSS crop/zoom/pan and shared text/overlay parity at 390/1200 px');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
