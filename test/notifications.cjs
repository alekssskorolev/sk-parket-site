const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const ctx=await b.newContext();
  await ctx.addInitScript(()=>{
   window._notifications=[];window._requests=0;window._windowCalls=0;window._registered=[];
   // Simulate a mobile browser: Notification constructor unsupported, SW display supported.
   class Fake{static permission='default';static async requestPermission(){window._requests++;this.permission='granted';return 'granted'}constructor(){window._windowCalls++;throw new TypeError('Use ServiceWorkerRegistration.showNotification')}}
   window.Notification=Fake;
   const sw={addEventListener(){},async register(url){
    window._registered.push(String(url));
    return {active:{},async showNotification(title,options){window._notifications.push({title,...options,api:'service-worker'})}};
   }};
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:sw});
   if(!localStorage.getItem('sk-test-cursor-seeded')){localStorage.setItem('sk-test-cursor-seeded','yes');localStorage.setItem('sk-parket-last-alert-id:/docs/','999999')}
   const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>{if(ms===30000){window._poll=fn;return 123}return interval(fn,ms,...args)};
  });
  const p=await ctx.newPage();await p.goto('http://127.0.0.1:4390/docs/admin.html');await p.locator('#enable-notifications').waitFor();
  if(await p.evaluate(()=>_requests)!==0)throw Error('Permission requested before click');
  if(!await p.locator('#test-notifications').isDisabled())throw Error('Test button enabled without permission');
  await p.waitForFunction(()=>localStorage.getItem('sk-parket-last-alert-id:/docs/')==='0');
  await p.locator('#enable-notifications').click();
  if(await p.evaluate(()=>_requests)!==1)throw Error('Permission button failed');
  await p.locator('#test-notifications').click();await p.waitForFunction(()=>_notifications.length===1);
  if(await p.evaluate(()=>_notifications[0].tag)!=='sk-parket-notification-test')throw Error('Test was not distinguished from a lead alert');
  await p.getByRole('searchbox').fill('Тест');
  const site=await ctx.newPage();await site.goto('http://127.0.0.1:4390/docs/');await site.waitForFunction(()=>document.querySelector('#price').textContent.includes('₽'));
  await site.evaluate(()=>fetch('/api/leads',{method:'POST',body:JSON.stringify({name:'Алексей',phone:'79000000001',comment:'Тест уведомления',consent:true})}));
  await p.locator('.lead-tile').first().waitFor();await p.waitForFunction(()=>_notifications.filter(x=>x.tag==='sk-parket-new-leads').length===1);
  if(await p.getByRole('searchbox').inputValue()!=='Тест')throw Error('Search value lost');
  if(await p.getByRole('button',{name:'Актуальные · 1',exact:true}).count()!==1)throw Error('Counters stale');
  await p.evaluate(()=>window._poll());if(await p.evaluate(()=>_notifications.length)!==2)throw Error('Duplicate notification');
  if(await p.evaluate(()=>JSON.stringify(_notifications).includes('79000000001')))throw Error('Contact leaked to notification');
  if(await p.evaluate(()=>_windowCalls)!==0)throw Error('Mobile constructor was used instead of service worker');
  if(!await p.evaluate(()=>_registered.every(x=>x.endsWith('/docs/notifications-sw.js'))))throw Error('Wrong SW path on GitHub Pages');
  await p.bringToFront();await p.reload();await p.locator('#enable-notifications').waitFor();if(await p.evaluate(()=>_notifications.length)!==0)throw Error('Historical lead alert');
  await p.evaluate(()=>fetch('/api/leads',{method:'POST',body:JSON.stringify({phone:'79000000002',comment:'Тест из текущей вкладки',consent:true})}));await p.waitForFunction(()=>document.querySelectorAll('.lead-tile').length===2);
  console.log('PASS mobile SW alerts, manual test, stale cursor reset, opt-in, cross-tab/same-tab refresh, no duplicates/PII/history');
  // Desktop fallback if worker installation is unavailable.
  const desktop=await b.newContext();await desktop.addInitScript(()=>{
   window._notifications=[];class Fake{static permission='granted';constructor(title,options){window._notifications.push({title,...options})}close(){}}window.Notification=Fake;
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{addEventListener(){},register:async()=>{throw Error('Worker unavailable')}}});
  });
  const d=await desktop.newPage();await d.goto('http://127.0.0.1:4390/docs/admin.html');await d.locator('#test-notifications').click();await d.waitForFunction(()=>_notifications.length===1);console.log('PASS desktop constructor fallback');
  const native=await b.newContext({permissions:['notifications']});const n=await native.newPage();await n.goto('http://127.0.0.1:4390/docs/admin.html');await n.locator('#test-notifications').click();
  await n.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration();return reg&&Boolean((await reg.getNotifications()).find(x=>x.tag==='sk-parket-notification-test'))});
  await n.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();for(const notice of await reg.getNotifications())notice.close()});console.log('PASS real Chromium SW registration and notification delivery API');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exit(1)});
