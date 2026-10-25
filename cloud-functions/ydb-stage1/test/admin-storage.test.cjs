const {test}=require('node:test');const assert=require('node:assert/strict');
const {createAdminStorage}=require('../function/admin-storage');const {SchemeError,Aborted}=require('../function/node_modules/ydb-sdk/build/cjs/src/errors');
const seed=require('../function/config.seed.json');
test('initial migration handles SDK static statuses, creates only missing tables and seeds in transaction',async()=>{
 const tables=new Set(),calls=[];
 const s={describeTable:async n=>{if(!tables.has(n))throw new SchemeError('missing')},createTable:async(n,t)=>{assert.ok(t.columns.length>=2);tables.add(n)},beginTransaction:async()=>({id:'tx-1'}),executeQuery:async(q,p,tx)=>{calls.push(q);assert.equal(tx.txId,'tx-1');return {resultSets:[]}},commitTransaction:async x=>assert.equal(x.txId,'tx-1'),rollbackTransaction:async()=>{}};
 const d={tableClient:{withSession:async fn=>fn(s)}};const storage=createAdminStorage(async()=>d,seed);await storage.ensure();await storage.ensure();assert.equal(tables.size,3);assert.equal(calls.filter(x=>x.includes('UPSERT')).length,1);
});
test('migration does not hide permission failures as missing table',async()=>{const d={tableClient:{withSession:fn=>fn({describeTable:async()=>{throw Error('forbidden')}})}};await assert.rejects(createAdminStorage(async()=>d,seed).ensure(),/forbidden/)});
