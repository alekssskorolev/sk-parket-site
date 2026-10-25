'use strict';
const {TableDescription,Column,Types,TypedValues:V,TypedData,StatusCode}=require('ydb-sdk');
const {INSERT_ORDER,insertParams}=require('./ydb-storage');
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const rows=r=>r.resultSets?.[0]?TypedData.createNativeObjects(r.resultSets[0]):[];
function createAdminStorage(getDriver,seed){
 let ready;
 async function ensure(){
  if(!ready)ready=(async()=>{const d=await getDriver();await d.tableClient.withSession(async s=>{
   for(const [name,cols,ttl] of [
    ['sk_admin_state',[['id',Types.UTF8],['payload',Types.JSON_DOCUMENT]]],
    ['sk_admin_sessions',[['id',Types.UTF8],['payload',Types.JSON_DOCUMENT],['expires',Types.TIMESTAMP]],true],
    ['sk_public_requests',[['id',Types.UTF8],['payload',Types.JSON_DOCUMENT],['expires',Types.TIMESTAMP]],true],
    ['sk_telegram_outbox',[['id',Types.UTF8],['payload',Types.JSON_DOCUMENT],['expires',Types.TIMESTAMP]],true],
    ['sk_admin_limits',[['id',Types.UTF8],['payload',Types.JSON_DOCUMENT],['expires',Types.TIMESTAMP]],true],
   ]){
    try{await s.describeTable(name);continue}catch(e){if(e.constructor.status!==StatusCode.SCHEME_ERROR)throw e}
    const t=new TableDescription().withPrimaryKey('id');for(const [n,type]of cols)t.withColumn(new Column(n,type));if(ttl)t.withTtl('expires',0);
    try{await s.createTable(name,t)}catch(e){try{await s.describeTable(name)}catch{throw e}}
   }
  });await mutate('sk_admin_state','prices',p=>({value:p||{draft:seed,revision:1,published:{version:1,updated:new Date().toISOString(),config:seed},history:[{id:1,created:new Date().toISOString(),config:seed}]},result:true}),false);
  })().catch(e=>{ready=null;throw e});
  await ready;
 }
 async function query(q,p={}){const d=await getDriver();return d.tableClient.withSession(async s=>rows(await s.executeQuery(q,p)))}
 // A single serializable transaction protects revisions, rate limits, and multi-instance updates.
 async function mutate(table,id,fn,wait=true){
  if(wait)await ensure();const d=await getDriver();
  for(let attempt=0;;attempt++)try{return await d.tableClient.withSession(async s=>{
   const tx=await s.beginTransaction({serializableReadWrite:{}});
   try{
    const r=rows(await s.executeQuery(`DECLARE $id AS Utf8; SELECT payload FROM ${table} WHERE id=$id;`,{$id:V.utf8(id)},{txId:tx.id}));
    const change=fn(r[0]?parse(r[0].payload):null);
    if(change.value===undefined){await s.commitTransaction({txId:tx.id});return change.result}
    if(change.value===null)await s.executeQuery(`DECLARE $id AS Utf8; DELETE FROM ${table} WHERE id=$id;`,{$id:V.utf8(id)},{txId:tx.id});
    else {const exp=table==='sk_admin_state'?'':', expires';const val=table==='sk_admin_state'?'':', $expires';
     const p={$id:V.utf8(id),$payload:V.jsonDocument(JSON.stringify(change.value))};if(exp)p.$expires=V.timestamp(new Date(change.value.expires));
     await s.executeQuery(`DECLARE $id AS Utf8; DECLARE $payload AS JsonDocument; ${exp?'DECLARE $expires AS Timestamp;':''} UPSERT INTO ${table} (id,payload${exp}) VALUES ($id,$payload${val});`,p,{txId:tx.id});
    }
    await s.commitTransaction({txId:tx.id});return change.result;
   }catch(e){await s.rollbackTransaction({txId:tx.id}).catch(()=>{});throw e}
  })}catch(e){if(e.constructor.status!==StatusCode.ABORTED||attempt>=4)throw e}
 }
 const read=async(table,id)=>{await ensure();const r=await query(`DECLARE $id AS Utf8; SELECT payload FROM ${table} WHERE id=$id;`,{$id:V.utf8(id)});return r[0]?parse(r[0].payload):null};
 function lead(x){const e=x.estimate?parse(x.estimate):null;return {...x,created:new Date(x.created).toISOString(),updated:new Date(x.updated).toISOString(),estimate:e,version:e?.priceVersion||null,photos:[]}}
 return {
  ensure,
  lookupRequest:id=>read('sk_public_requests',id),
  async insertLeadOnce(order,requestId,fingerprint,expires,notify=false){
   await ensure();const d=await getDriver();
   for(let attempt=0;;attempt++)try{return await d.tableClient.withSession(async s=>{
    const tx=await s.beginTransaction({serializableReadWrite:{}});
    try{
     const r=rows(await s.executeQuery('DECLARE $id AS Utf8; SELECT payload FROM sk_public_requests WHERE id=$id;',{$id:V.utf8(requestId)},{txId:tx.id}));
     const old=r[0]?parse(r[0].payload):null;
     if(old&&old.expires>+order.created){
      if(old.fingerprint!==fingerprint)throw Object.assign(Error('Данные заявки изменились. Начните новую отправку.'),{status:409,publicError:true});
      await s.commitTransaction({txId:tx.id});return {id:old.id,created:false};
     }
     await s.executeQuery(INSERT_ORDER,insertParams(order),{txId:tx.id});
     await s.executeQuery('DECLARE $id AS Utf8; DECLARE $payload AS JsonDocument; DECLARE $expires AS Timestamp; UPSERT INTO sk_public_requests (id,payload,expires) VALUES($id,$payload,$expires);',{$id:V.utf8(requestId),$payload:V.jsonDocument(JSON.stringify({id:order.id,fingerprint,expires})),$expires:V.timestamp(new Date(expires))},{txId:tx.id});
     if(notify)await s.executeQuery('DECLARE $id AS Utf8; DECLARE $payload AS JsonDocument; DECLARE $expires AS Timestamp; UPSERT INTO sk_telegram_outbox(id,payload,expires) VALUES($id,$payload,$expires);',{$id:V.utf8(order.id),$payload:V.jsonDocument(JSON.stringify({expires,attempts:0,next:0,leaseUntil:0})),$expires:V.timestamp(new Date(expires))},{txId:tx.id});
     await s.commitTransaction({txId:tx.id});return {id:order.id,created:true};
    }catch(e){await s.rollbackTransaction({txId:tx.id}).catch(()=>{});throw e}
   })}catch(e){if(e.constructor.status!==StatusCode.ABORTED||attempt>=4)throw e}
  },
  telegramSettings:()=>read('sk_admin_state','telegram'),
  telegramChange:fn=>mutate('sk_admin_state','telegram',fn),
  async telegramPending(){await ensure();return (await query('DECLARE $now AS Timestamp; SELECT id,payload FROM sk_telegram_outbox WHERE expires>$now ORDER BY expires ASC LIMIT 50;',{$now:V.timestamp(new Date())})).map(x=>({id:x.id,...parse(x.payload)}))},
  telegramJob:(id,fn)=>mutate('sk_telegram_outbox',id,fn),
  async state(){const p=await read('sk_admin_state','prices');return {...p,history:p.history.map(({id,created})=>({id,created}))}},
  async current(){return (await read('sk_admin_state','prices')).published},
  async changeState(revision,fn){return mutate('sk_admin_state','prices',p=>{if(p.revision!==revision){const e=Error('Данные изменились в другой вкладке. Обновите страницу.');e.status=409;throw e}const v=fn(p);v.revision++;return {value:v,result:true}})},
  async limit(key,max,ms,now){return mutate('sk_admin_limits',key,p=>{if(!p||p.expires<=now)p={count:0,expires:now+ms};p.count++;return {value:p,result:p.count<=max}})},
  getSession:id=>read('sk_admin_sessions',id),
  async putSession(id,p){return mutate('sk_admin_sessions',id,()=>({value:p,result:true}))},
  async deleteSession(id){return mutate('sk_admin_sessions',id,()=>({value:null,result:true}))},
  async list(cursor){await ensure();let date=new Date('2100-01-01'),id='';if(cursor){const p=parse(Buffer.from(cursor,'base64url').toString());date=new Date(p.created);id=p.id;if(!Number.isFinite(+date)||typeof id!=='string')throw Object.assign(Error('Неверная страница'),{status:400})}
   const r=await query(`DECLARE $created AS Timestamp; DECLARE $id AS Utf8; SELECT id,created_at AS created,updated_at AS updated,name,phone,comment,status,admin_note AS note,estimate FROM orders WHERE created_at < $created OR (created_at=$created AND id<$id) ORDER BY created_at DESC,id DESC LIMIT 50;`,{$created:V.timestamp(date),$id:V.utf8(id)});
   const leads=r.map(lead);const counts=await query("SELECT COUNT(*) AS n FROM orders WHERE status='new';");
   return {leads:leads.map(({estimate,...x})=>({...x,estimateSummary:estimate?{total:estimate.total,partial:estimate.partial,area:estimate.area,pattern:estimate.pattern}:null})),newCount:Number(counts[0].n),next:r.length===50?Buffer.from(JSON.stringify({created:leads.at(-1).created,id:leads.at(-1).id})).toString('base64url'):null};
  },
  async getLead(id){await ensure();const r=await query('DECLARE $id AS Utf8; SELECT id,created_at AS created,updated_at AS updated,name,phone,comment,status,admin_note AS note,estimate FROM orders WHERE id=$id;',{$id:V.utf8(id)});return r[0]?lead(r[0]):null},
  async updateLead(id,status,note){return query('DECLARE $id AS Utf8; DECLARE $status AS Utf8; DECLARE $note AS Utf8; DECLARE $now AS Timestamp; UPDATE orders SET status=$status,admin_note=$note,updated_at=$now WHERE id=$id;',{$id:V.utf8(id),$status:V.utf8(status),$note:V.utf8(note),$now:V.timestamp(new Date())})},
  async deleteLead(id){return query('DECLARE $id AS Utf8; DELETE FROM orders WHERE id=$id; DELETE FROM sk_telegram_outbox WHERE id=$id;',{$id:V.utf8(id)})},
 };
}
module.exports={createAdminStorage};
