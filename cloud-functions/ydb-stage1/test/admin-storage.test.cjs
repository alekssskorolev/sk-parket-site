const {test}=require('node:test');const assert=require('node:assert/strict');
const {createAdminStorage}=require('../function/admin-storage');const {SchemeError,Aborted}=require('../function/node_modules/ydb-sdk/build/cjs/src/errors');
const seed=require('../function/config.seed.json');
test('initial migration handles SDK static statuses, creates only missing tables and seeds in transaction',async()=>{
 const tables=new Set(),calls=[];
 const s={describeTable:async n=>{if(!tables.has(n))throw new SchemeError('missing')},createTable:async(n,t)=>{assert.ok(t.columns.length>=2);tables.add(n)},beginTransaction:async()=>({id:'tx-1'}),executeQuery:async(q,p,tx)=>{calls.push(q);assert.equal(tx.txId,'tx-1');return {resultSets:[]}},commitTransaction:async x=>assert.equal(x.txId,'tx-1'),rollbackTransaction:async()=>{}};
 const d={tableClient:{withSession:async fn=>fn(s)}};const storage=createAdminStorage(async()=>d,seed);await storage.ensure();await storage.ensure();assert.equal(tables.size,5);assert.equal(calls.filter(x=>x.includes('UPSERT')).length,1);
});
test('migration does not hide permission failures as missing table',async()=>{const d={tableClient:{withSession:fn=>fn({describeTable:async()=>{throw Error('forbidden')}})}};await assert.rejects(createAdminStorage(async()=>d,seed).ensure(),/forbidden/)});
test('public request and order commit in the same transaction; no partial acknowledgement',async()=>{
 const queries=[],commits=[],rolled=[];let migrate=true;
 const s={describeTable:async()=>{},beginTransaction:async()=>({id:'atomic-tx'}),executeQuery:async(q,p,tx)=>{assert.equal(tx.txId,'atomic-tx');queries.push(q);return {resultSets:[]}},commitTransaction:async x=>commits.push(x.txId),rollbackTransaction:async x=>rolled.push(x.txId)};
 const d={tableClient:{withSession:async fn=>fn(s)}};const storage=createAdminStorage(async()=>d,seed);await storage.ensure();queries.length=0;commits.length=0;
 const saved=await storage.insertLeadOnce({id:'fake-id',created:new Date(),name:'Тестовая заявка',phone:'70000000000',comment:'test',estimate:null,consentVersion:'fixture'},'request-id','fingerprint',Date.now()+100000);
 assert.equal(saved.created,true);assert.equal(queries.filter(q=>q.includes('INSERT INTO orders')).length,1);assert.equal(queries.filter(q=>q.includes('UPSERT INTO sk_public_requests')).length,1);assert.equal(commits.length,1);assert.equal(rolled.length,0);
});
test('failure storing deduplication key rolls back the order transaction',async()=>{
 const s={describeTable:async()=>{},beginTransaction:async()=>({id:'rollback-tx'}),executeQuery:async()=>({resultSets:[]}),commitTransaction:async()=>{},rollbackTransaction:async()=>{}};
 const d={tableClient:{withSession:async fn=>fn(s)}};const storage=createAdminStorage(async()=>d,seed);await storage.ensure();let rolled=0,committed=0;
 s.executeQuery=async q=>{if(q.includes('UPSERT INTO sk_public_requests'))throw Error('write failure');return {resultSets:[]}};s.rollbackTransaction=async()=>rolled++;s.commitTransaction=async()=>committed++;
 await assert.rejects(storage.insertLeadOnce({id:'fake',created:new Date(),name:'Тестовая заявка',phone:'70000000000',comment:'',estimate:null,consentVersion:'fixture'},'key','hash',Date.now()+10000),/write failure/);assert.equal(rolled,1);assert.equal(committed,0);
});
test('Telegram outbox is inserted in the order transaction and rolls back on failure',async()=>{
 const calls=[];let rolled=0,committed=0,broken=false;
 const s={describeTable:async()=>{},beginTransaction:async()=>({id:'atomic'}),executeQuery:async(q,p,tx)=>{assert.equal(tx.txId,'atomic');calls.push(q);if(broken&&q.includes('UPSERT INTO sk_telegram_outbox'))throw Error('outbox failure');return {resultSets:[]}},commitTransaction:async()=>committed++,rollbackTransaction:async()=>rolled++};
 const storage=createAdminStorage(async()=>({tableClient:{withSession:fn=>fn(s)}}),seed);await storage.ensure();calls.length=0;committed=0;
 const order={id:'fake',created:new Date(),name:'Test',phone:'70000000000',comment:'',estimate:null,consentVersion:'fixture'};
 await storage.insertLeadOnce(order,'k','h',Date.now()+86400000,true);assert.equal(calls.filter(x=>x.includes('UPSERT INTO sk_telegram_outbox')).length,1);assert.equal(committed,1);
 broken=true;await assert.rejects(storage.insertLeadOnce(order,'k2','h',Date.now()+86400000,true),/outbox failure/);assert.equal(rolled,1);assert.equal(committed,1);
});
