const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function incomeStorage(){
 const records=new Map([['fixture',{status:'new',note:'',updated:'2026-10-01T00:00:00.000Z',metadata:{rawPhone:'+7 (911)987-67-55',revision:0}}]]);let staged,fail=false,abort=false,rollbacks=0,commits=0;class ConcurrentAbort extends Error{static status="aborted"}const calls=[];
 const sdk={Types:{},TypedValues:{utf8:x=>x,jsonDocument:x=>x,timestamp:x=>x},TypedData:{createNativeObjects:x=>x},StatusCode:{ABORTED:'aborted'}};
 const session={describeTable:async()=>{},beginTransaction:async()=>{staged=structuredClone(records);return {id:'income-tx'}},executeQuery:async(q,p,tx)=>{calls.push(q);assert.equal(tx.txId,'income-tx');const record=staged.get(p.$id);let result=[];
 if(q.includes('SELECT status,updated_at'))result=record?[{status:record.status,updated:record.updated}]:[];
 else if(q.includes('SELECT payload'))result=p.$id==='prices'?[{payload:JSON.stringify({})}]:record?.metadata?[{payload:JSON.stringify(record.metadata)}]:[];
 else if(q.includes('UPDATE orders'))Object.assign(record,{status:p.$status,note:p.$note,updated:p.$now.toISOString()});
 else if(q.includes('UPSERT INTO sk_admin_state')&&p.$id!=='prices'){if(fail)throw Error('metadata failed');if(abort){abort=false;const current=records.get(p.$id);current.status='progress';current.metadata.revision++;throw new ConcurrentAbort('concurrent writer')}record.metadata=JSON.parse(p.$payload)}
 else if(q.includes('DELETE FROM orders'))staged.delete(p.$id);
 return {resultSets:[result]};},commitTransaction:async()=>{records.clear();for(const [k,v]of staged)records.set(k,v);commits++},rollbackTransaction:async()=>{rollbacks++}};
 const context={require:name=>name==='ydb-sdk'?sdk:name==='./ydb-storage'?{}:{applyPriceEdit:()=>{}},module:{exports:{}},Buffer,Date};vm.runInNewContext(fs.readFileSync(require.resolve('../function/admin-storage'),'utf8'),context);
 const storage=context.module.exports.createAdminStorage(async()=>({tableClient:{withSession:fn=>fn(session)}}),{});
 return {storage,records,calls,breakWrite:()=>fail=true,abortConcurrent:()=>abort=true,stats:()=>({commits,rollbacks})};
}
test('completion and revenue edit are atomic, revisions protect status and legacy clients; reopen preserves amount',async()=>{
 const f=incomeStorage();await f.storage.ensure();const first=f.records.get('fixture');const change={revenueKopecks:12345,expectedRevision:0,expectedUpdated:first.updated};await f.storage.updateLead('fixture','completed','memo',change);
 let saved=f.records.get('fixture');assert.equal(saved.status,'completed');assert.equal(saved.metadata.revenueKopecks,12345);assert.equal(saved.metadata.rawPhone,'+7 (911)987-67-55');assert.equal(saved.metadata.revision,1);
 await assert.rejects(f.storage.updateLead('fixture','closed','stale',change),e=>e.status===409);await assert.rejects(f.storage.updateLead('fixture','closed','legacy'),e=>e.status===409);
 await f.storage.updateLead('fixture','progress','reopen',{expectedRevision:1,expectedUpdated:saved.updated});saved=f.records.get('fixture');assert.equal(saved.metadata.revenueKopecks,12345);assert.equal(saved.status,'progress');
 await f.storage.updateLead('fixture','completed','zero',{revenueKopecks:0,expectedRevision:2,expectedUpdated:saved.updated});assert.equal(f.records.get('fixture').metadata.revenueKopecks,0);
});
test('metadata write failure rolls back status, note and amount; delete transaction includes metadata and all outboxes',async()=>{
 const f=incomeStorage();await f.storage.ensure();const before=structuredClone(f.records.get('fixture'));f.breakWrite();await assert.rejects(f.storage.updateLead('fixture','completed','must rollback',{revenueKopecks:999,expectedRevision:0,expectedUpdated:before.updated}),/metadata failed/);assert.deepEqual(f.records.get('fixture'),before);assert.equal(f.stats().rollbacks,1);
 await f.storage.deleteLead('fixture');assert.equal(f.records.has('fixture'),false);const deletion=f.calls.find(q=>q.includes('DELETE FROM orders'));for(const table of ['sk_admin_state','sk_telegram_outbox','sk_max_outbox','sk_email_outbox'])assert.ok(deletion.includes('DELETE FROM '+table));
});
test('storage rejects missing completion amount, negative/unsafe amount and stale nonfinancial edit',async()=>{
 const f=incomeStorage();await f.storage.ensure();const expectedUpdated=f.records.get('fixture').updated;
 await assert.rejects(f.storage.updateLead('fixture','completed',''),e=>e.status===422);
 for(const revenueKopecks of [-1,NaN,1.1,Number.MAX_SAFE_INTEGER+1])await assert.rejects(f.storage.updateLead('fixture','completed','',{revenueKopecks,expectedUpdated,expectedRevision:0}),e=>e.status===422);
 await f.storage.updateLead('fixture','progress','legacy works');await assert.rejects(f.storage.updateLead('fixture','closed','',{expectedUpdated,expectedRevision:0}),e=>e.status===409);
});

test('serializable ABORTED retry rereads revision and rejects stale financial completion',async()=>{const f=incomeStorage();await f.storage.ensure();const expectedUpdated=f.records.get('fixture').updated;f.abortConcurrent();await assert.rejects(f.storage.updateLead('fixture','completed','stale',{revenueKopecks:100,expectedUpdated,expectedRevision:0}),e=>e.status===409);assert.equal(f.records.get('fixture').status,'progress');assert.equal(f.records.get('fixture').metadata.revenueKopecks,undefined);assert.equal(f.stats().rollbacks,2)});
