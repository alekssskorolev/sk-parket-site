// Notification display only: no page caching, no background push subscription.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'./admin.html',self.registration.scope);
 if(target.origin!==self.location.origin)return;
 event.waitUntil((async()=>{
  const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const page=pages.find(p=>new URL(p.url).pathname===target.pathname);
  if(page){await page.focus();page.postMessage({type:'sk-open-leads'});return}
  await self.clients.openWindow(target.href);
 })());
});
