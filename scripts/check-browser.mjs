import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.argv[2]||'https://skparket.ru/',out=process.argv[3]||'seo-evidence/browser';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Exclude audit visits from analytics and prevent delivery of any real form submission.
 await context.route(/mc\.yandex\.(ru|com)/,r=>r.abort());
 await context.route('**/api/leads',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SEO test: no lead created"}'}));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#price')?.textContent.includes('₽'),{},{timeout:45000});
 await page.waitForFunction(()=>document.querySelectorAll('#works-track .gallery-has-photos').length>0,{},{timeout:45000});
 assert.equal(await page.locator('h1').count(),1);
 assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://skparket.ru/');
 assert.equal(await page.locator('meta[name=robots]').count(),0);
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
 await page.locator('#works-track .work-photo-trigger').first().click();
 assert.ok(await page.locator('#work-dialog').isVisible());
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
 writeFileSync(out+'/dom.html',await page.content());
 writeFileSync(out+'/checks.json',JSON.stringify({url,checks,errors,galleryImages:await page.locator('#works img').count()},null,2));
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 console.log(JSON.stringify({url,checks,errors,menu:true,lightbox:true,contacts:true,consent:true,noLeadsSubmitted:true},null,2));
}finally{await browser.close()}
