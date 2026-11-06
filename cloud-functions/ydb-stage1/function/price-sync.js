'use strict';
const {randomBytes}=require('node:crypto');
const {SOURCE,ARTICLE,fetchProduct}=require('./parket-sale');
const DAY=86400000,initialSync=()=>({enabled:false,generation:0,nextAt:0,lastAttemptAt:0,lastCheckedAt:0,lastAppliedAt:0,lastPrice:null,lastError:'',lease:null,leaseUntil:0});
const target=c=>c?.items?.find(x=>x.id==='glue');
const targetSignature=c=>{const x=target(c);return JSON.stringify(x?Object.fromEntries(['name','spec','active','kind','unit','price','pricingMode','areaPrice','consumption','packSize','packUnit'].map(k=>[k,x[k]])):null)};
function applyPriceEdit(p,fn){const before=targetSignature(p.draft),enabled=(p.priceSync||initialSync()).enabled,v=fn(p);if(enabled&&before!==targetSignature(v.draft))pauseForManual(v);return v}
function pauseForManual(p){p.priceSync={...initialSync(),...p.priceSync,enabled:false,generation:(p.priceSync?.generation||0)+1,lease:null,leaseUntil:0,lastError:'Синхронизация отключена: материал изменён вручную.'}}
function nextSchedule(t){const d=new Date(t);const slot=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),3,0);return slot>t?slot:slot+DAY}
const fail=(status,message)=>{throw Object.assign(Error(message),{status,publicError:true})};
function validateTarget(c){const x=target(c);if(!x||!x.active||x.kind!=='material'||x.unit!=='pack'||x.packSize!==7||x.packUnit!=='кг'||(!/Berger.*\bM1X\b/iu.test(x.name)||!/7\s*кг/iu.test(x.spec||''))||!Number.isFinite(x.consumption)||x.consumption<=0)fail(409,'Материал Berger M1X должен быть активен и иметь упаковку 7 кг.');return x}
function effectivePack(x){return x.pricingMode==='area'?x.areaPrice/x.consumption:x.price}
function createPriceSync({storage,fetchImpl=fetchProduct,validateConfig,now=()=>Date.now()}){
 let skipUntil=0;
 function summary(p){const s={...initialSync(),...p.priceSync},x=target(p.published.config);return {enabled:s.enabled,revision:p.revision,source:SOURCE,article:ARTICLE,schedule:'Ежедневно в 06:00 по Москве',nextAt:s.enabled?(s.nextAt||nextSchedule(now())):null,lastCheckedAt:s.lastCheckedAt||null,lastAppliedAt:s.lastAppliedAt||null,lastPrice:s.lastPrice,lastError:s.lastError||'',checking:s.leaseUntil>now(),packPrice:x?effectivePack(x):null,rate:x?(x.pricingMode==='area'?x.areaPrice:x.price*x.consumption):null}}
 const status=async()=>summary(await storage.syncRead());
 async function configure(revision,enabled){
  if(typeof enabled!=='boolean')fail(422,'Укажите режим обновления цены');
  await storage.syncMutate(p=>{if(p.revision!==revision)fail(409,'Цены изменились. Обновите настройки.');if(enabled){validateTarget(p.draft);validateTarget(p.published.config);if(targetSignature(p.draft)!==targetSignature(p.published.config))fail(409,'У материала есть неопубликованные изменения. Сначала опубликуйте или отмените их.');}
   const old={...initialSync(),...p.priceSync};p.priceSync={...old,enabled,generation:old.generation+1,nextAt:enabled?nextSchedule(now()):0,lease:null,leaseUntil:0,lastError:''};p.revision++;return {value:p,result:true}});skipUntil=0;return status();
 }
 async function check(manual=true){
  const started=now(),lease=randomBytes(16).toString('hex');
  const claim=await storage.syncMutate(p=>{
   const s={...initialSync(),...p.priceSync};if(s.leaseUntil>started){if(manual)fail(409,'Проверка уже выполняется');return {result:null}}
   if(!manual&&(!s.enabled||s.nextAt>started))return {result:null};
   if(manual&&s.lastAttemptAt&&started-s.lastAttemptAt<60000)fail(429,'Повторите проверку через минуту');
   if(s.enabled){validateTarget(p.draft);validateTarget(p.published.config);}
   p.priceSync={...s,lastAttemptAt:started,lease,leaseUntil:started+60000,nextAt:s.enabled?nextSchedule(started):0};
   return {value:p,result:{revision:p.revision,generation:s.generation,enabled:s.enabled}};
  });
  if(!claim)return status();
  let product,error='';try{product=await fetchImpl();if(product.article!==ARTICLE||product.packSize!==7||product.packUnit!=='кг'||product.inStock!==true||!Number.isFinite(product.price)||product.price<1000||product.price>100000)throw Error('Магазин вернул неподходящий товар или цену.')}catch(e){error=e.message||'Не удалось получить цену.'}
  await storage.syncMutate(p=>{
   const s=p.priceSync;if(!s||s.lease!==lease||s.generation!==claim.generation)return {result:false};
   const finish=(message,applied=false)=>{p.priceSync={...s,lease:null,leaseUntil:0,lastError:message,lastCheckedAt:now(),...(product?{lastPrice:product.price}:{}),...(applied?{lastAppliedAt:now()}: {})};return {value:p,result:true}};
   if(error)return finish(error);
   if(!s.enabled||!claim.enabled)return finish('');
   if(p.revision!==claim.revision)return finish('Цены изменились во время проверки. Автообновление пропущено.');
   try{
    const old=validateTarget(p.published.config);validateTarget(p.draft);
    if(targetSignature(p.draft)!==targetSignature(p.published.config))return finish('У материала есть ручной черновик. Автообновление пропущено.');
    const ratio=product.price/effectivePack(old);if(!Number.isFinite(ratio)||ratio<.7||ratio>1.3)return finish('Цена изменилась более чем на 30%. Проверьте магазин и при необходимости задайте цену вручную.');
    const draft=structuredClone(p.draft),published=structuredClone(p.published.config);
    for(const config of [draft,published]){const item=target(config);item.price=product.price;if(item.pricingMode==='area')item.areaPrice=product.price*item.consumption;validateConfig(config)}
    const changed=targetSignature(published)!==targetSignature(p.published.config);
    if(changed){const version=p.published.version+1,created=new Date(now()).toISOString();p.draft=draft;p.published={version,updated:created,config:published};p.history=[{id:version,created,config:published},...p.history].slice(0,20);p.revision++;}
    return finish('',changed);
   }catch(e){return finish(e.publicError?e.message:'Материал изменён или имеет некорректные настройки. Цена не обновлена.')}
  });
  return status();
 }
 async function scheduled(){const t=now(),d=new Date(t);if(t<skipUntil||d.getUTCHours()!==3||d.getUTCMinutes()>10)return;await check(false);skipUntil=nextSchedule(t)}
 return {status,configure,check:()=>check(true),scheduled};
}
module.exports={createPriceSync,initialSync,targetSignature,pauseForManual,applyPriceEdit,nextSchedule};
