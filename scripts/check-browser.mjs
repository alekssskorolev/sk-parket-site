import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.argv[2]||'https://skparket.ru/',out=process.argv[3]||'seo-evidence/browser';
const baseline=process.argv[4]==='baseline',candidate=process.argv[4]==='candidate';
mkdirSync(out,{recursive:true});
async function routeCandidate(context){
 if(!candidate)return;
 await context.route('https://skparket.ru/**',route=>{
  const path=new URL(route.request().url()).pathname,relative=path==='/'?'index.html':path.slice(1);
  const file=new URL('../docs/'+relative,import.meta.url);
  if(!existsSync(file))return route.continue();
  const ext=relative.split('.').at(-1),types={html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webp:'image/webp',jpg:'image/jpeg',txt:'text/plain',xml:'application/xml'};
  return route.fulfill({status:200,contentType:types[ext]||'application/octet-stream',body:readFileSync(file)});
 });
}
const browser=await chromium.launch({headless:true});
let evidencePage;
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 await page.addInitScript(()=>{window.__galleryReplacementCount=0;addEventListener('DOMContentLoaded',()=>{const track=document.getElementById('works-track');if(track)new MutationObserver(ms=>{window.__galleryReplacementCount+=ms.filter(m=>m.type==='childList').length}).observe(track,{childList:true})},{once:true})});
 evidencePage=page;
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR: '+e.message)});
 await routeCandidate(context);
 // Exclude audit visits from analytics and prevent delivery of any real form submission.
 await context.route(/mc\.yandex\.(ru|com)/,r=>r.abort());
 await context.route('**/api/leads',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SEO test: no lead created"}'}));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#price')?.textContent.includes('₽'),{},{timeout:45000});
 await page.waitForFunction(()=>document.querySelectorAll('#works-track .gallery-has-photos').length>0,{},{timeout:45000});
 if(candidate){assert.equal(await page.evaluate(()=>window.__galleryReplacementCount),0,'Static gallery should not be rebuilt when revisions match');}
 assert.equal(await page.locator('h1').count(),1);
 if(!baseline){assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://skparket.ru/');assert.equal(await page.locator('meta[name=robots]').count(),0);}
 writeFileSync(out+'/metadata.json',JSON.stringify({baseline,candidate,url,title:await page.title(),meta:await page.locator('head meta,head link[rel=canonical]').evaluateAll(es=>es.map(e=>e.outerHTML))},null,2));
 const checks=[];
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  await page.locator('#area').fill('20');await page.locator('#area').dispatchEvent('change');
  const price20=await page.locator('#price').textContent();
  await page.locator('#area').fill('40');await page.locator('#area').dispatchEvent('change');
  const price40=await page.locator('#price').textContent();
  assert.notEqual(price20,price40);assert.match(price40,/₽/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'Overflow at '+width);
  checks.push({width,price20,price40,overflow:false});
 }
 await page.setViewportSize({width:390,height:900});
 await page.locator('#menu').click();assert.equal(await page.locator('#menu').getAttribute('aria-expanded'),'true');
 await page.locator('#menu').click();
 await page.locator('#works').scrollIntoViewIfNeeded();
 console.log(JSON.stringify({stage:'before-lightbox',checks,errors,galleryCards:await page.locator('#works-track .gallery-has-photos').count()}));
 await page.locator('#works-track .photo-cell img').first().click();
 await page.locator('#work-dialog').waitFor({state:'visible',timeout:10000});
 await page.keyboard.press('Escape');
 await page.locator('#real-works-grid .photo-cell img').first().click();
 await page.locator('#work-dialog').waitFor({state:'visible'});
 const drawingTitle=await page.locator('#work-photo-caption').textContent();
 await page.locator('#work-photo-next').click();
 assert.notEqual(await page.locator('#work-photo-caption').textContent(),drawingTitle);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('a[href="tel:+79117982306"]').count()>0,true);
 assert.equal(await page.locator('a[href="mailto:skparket@bk.ru"]').count()>0,true);
 assert.ok(await page.locator('#consent').isChecked());
 assert.equal(await page.locator('.check a').count(),2);
 await page.locator('.request-call').first().click();
 assert.ok(await page.locator('#callback-dialog').isVisible());
 await page.locator('#consent').uncheck();
 assert.equal(await page.locator('#consent').evaluate(e=>e.checkValidity()),false);
 await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);

 if(!baseline){
  assert.equal(await page.locator('#published-rates table tbody tr').count()>0,true);
  await page.locator('img').evaluateAll(es=>es.forEach(e=>e.loading='eager'));
  await page.waitForFunction(()=>[...document.images].every(e=>e.complete&&e.naturalWidth>0),{},{timeout:60000});
  const choices=[];
  for(const dpr of [1,2,3]){
   const mobile=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:dpr});
   await routeCandidate(mobile);await mobile.route(/mc\.yandex\.(ru|com)/,r=>r.abort());
   const p=await mobile.newPage();await p.goto(url,{waitUntil:'domcontentloaded'});
   await p.locator('#works').scrollIntoViewIfNeeded();
   const image=p.locator('#works-track .photo-cell img').first();
   await image.waitFor();await p.waitForFunction(()=>document.querySelector('#works-track img')?.naturalWidth>0);
   choices.push(await image.evaluate(e=>({dpr:devicePixelRatio,cssWidth:e.getBoundingClientRect().width,currentSrc:e.currentSrc,srcset:e.srcset})));
   await mobile.close();
  }
  assert.ok(choices.every(x=>x.srcset&&/-(400|800|1200)\.webp/.test(x.currentSrc)));
  const snapshot=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
  await routeCandidate(snapshot);await snapshot.route(/mc\.yandex\.(ru|com)/,r=>r.abort());
  const nojs=await snapshot.newPage();await nojs.goto(url,{waitUntil:'domcontentloaded'});
  assert.equal(await nojs.locator('#works .gallery-has-photos').count(),21);
  assert.equal(await nojs.locator('#works img').count(),34);
  assert.ok(await nojs.locator('#published-rates time').getAttribute('datetime'));
  assert.doesNotMatch(await nojs.locator('#works').textContent(),/Здесь будет фото/);
  writeFileSync(out+'/nojs.html',await nojs.content());
  await nojs.screenshot({path:out+'/nojs.png',fullPage:true});await snapshot.close();
  const failed=await browser.newContext({viewport:{width:390,height:900}});
  await routeCandidate(failed);await failed.route(/mc\.yandex\.(ru|com)/,r=>r.abort());
  await failed.route('**/api/config',r=>r.abort());await failed.route('**/api/gallery',r=>r.abort());
  const offline=await failed.newPage();await offline.goto(url,{waitUntil:'domcontentloaded'});
  await offline.waitForFunction(()=>document.querySelector('#price')?.textContent==='Расчёт недоступен');
  assert.equal(await offline.locator('#works .gallery-has-photos').count(),21);
  assert.equal(await offline.locator('#works img').count(),34);
  assert.ok(await offline.locator('#discuss').isDisabled());
  assert.ok((await offline.locator('#price-sub').textContent()).includes('+7 911 798-23-06'));
  writeFileSync(out+'/api-failure.html',await offline.content());await offline.screenshot({path:out+'/api-failure.png',fullPage:true});await failed.close();
  writeFileSync(out+'/image-choices.json',JSON.stringify(choices,null,2));
  console.log(JSON.stringify({noJavaScript:{cards:21,images:34,datedRates:true},apiFailure:{cards:21,images:34,estimateDisabled:true},responsiveChoices:choices}));
 }

 writeFileSync(out+'/dom.html',await page.content());
 writeFileSync(out+'/checks.json',JSON.stringify({url,checks,errors,galleryImages:await page.locator('#works img').count()},null,2));
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 console.log(JSON.stringify({url,checks,errors,menu:true,lightbox:true,contacts:true,consent:true,noLeadsSubmitted:true},null,2));
}finally{
 if(evidencePage){writeFileSync(out+'/final-dom.html',await evidencePage.content());await evidencePage.screenshot({path:out+'/final-screen.png',fullPage:true});console.log(JSON.stringify({stage:'finally',dialogs:await evidencePage.locator('dialog').evaluateAll(es=>es.map(e=>({id:e.id,open:e.open}))),metadata:await evidencePage.locator('head meta,head link[rel=canonical]').evaluateAll(es=>es.map(e=>e.outerHTML))}));}
 await browser.close()
}
