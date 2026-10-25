'use strict';
const {TableDescription,Column,Types,TypedValues:V,TypedData,StatusCode}=require('ydb-sdk');
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const rows=r=>r.resultSets?.[0]?TypedData.createNativeObjects(r.resultSets[0]):[];
const initial=()=>({revision:1,draft:[],published:null,gcCursor:''});
const refs=s=>new Set([...s.draft,...(s.published?.items||[])].flatMap(x=>[x.before,x.after]).filter(Boolean));
function createGalleryStorage(getDriver){
 let ready;
 async function ensure(){if(!ready)ready=(async()=>{const d=await getDriver();await d.tableClient.withSession(async s=>{
  for(const name of ['sk_gallery_state','sk_gallery_media']){try{await s.describeTable(name);continue}catch(e){if(e.constructor.status!==StatusCode.SCHEME_ERROR)throw e}
   const table=new TableDescription().withPrimaryKey('id').withColumn(new Column('id',Types.UTF8)).withColumn(new Column('payload',Types.JSON_DOCUMENT));if(name==='sk_gallery_media')table.withColumn(new Column('created',Types.TIMESTAMP));
   try{await s.createTable(name,table)}catch(e){try{await s.describeTable(name)}catch{throw e}}
  }
 });})().catch(e=>{ready=null;throw e});await ready}
 async function run(fn){await ensure();const d=await getDriver();return d.tableClient.withSession(fn)}
 async function tx(fn){await ensure();const d=await getDriver();for(let attempt=0;;attempt++)try{return await d.tableClient.withSession(async s=>{const t=await s.beginTransaction({serializableReadWrite:{}});const q=async(sql,p={})=>rows(await s.executeQuery(sql,p,{txId:t.id}));try{const result=await fn(q);await s.commitTransaction({txId:t.id});return result}catch(e){await s.rollbackTransaction({txId:t.id}).catch(()=>{});throw e}})}catch(e){if(e.constructor.status!==StatusCode.ABORTED||attempt>=4)throw e}}
 const readState=async q=>{const r=await q("SELECT payload FROM sk_gallery_state WHERE id='gallery';");return r[0]?parse(r[0].payload):initial()};
 const readMedia=async(q,id)=>{const r=await q('DECLARE $id AS Utf8; SELECT payload FROM sk_gallery_media WHERE id=$id;',{$id:V.utf8(id)});return r[0]?parse(r[0].payload):null};
 const writeState=(q,s)=>q("DECLARE $p AS JsonDocument; UPSERT INTO sk_gallery_state(id,payload) VALUES('gallery',$p);",{$p:V.jsonDocument(JSON.stringify(s))});
 return {
  ensure,
  state:()=>run(s=>readState((q,p)=>s.executeQuery(q,p).then(rows))),
  media:id=>run(s=>readMedia((q,p)=>s.executeQuery(q,p).then(rows),id)),
  async mediaMany(ids){if(!ids.length)return [];return run(async s=>rows(await s.executeQuery('DECLARE $ids AS List<Utf8>; SELECT payload FROM sk_gallery_media WHERE id IN $ids;',{$ids:V.list(Types.UTF8,ids)})).map(x=>parse(x.payload)))},
  async mutate(fn){return tx(async q=>{const state=await readState(q),result=await fn(state,id=>readMedia(q,id));await writeState(q,state);return result})},
  async createMedia(m){return tx(q=>q('DECLARE $id AS Utf8; DECLARE $p AS JsonDocument; DECLARE $created AS Timestamp; INSERT INTO sk_gallery_media(id,payload,created) VALUES($id,$p,$created);',{$id:V.utf8(m.id),$p:V.jsonDocument(JSON.stringify(m)),$created:V.timestamp(new Date(m.created))}))},
  async readyMedia(id){return tx(async q=>{const m=await readMedia(q,id);if(!m||m.status!=='uploading')throw Error('Media state conflict');m.status='ready';await q('DECLARE $id AS Utf8; DECLARE $p AS JsonDocument; UPDATE sk_gallery_media SET payload=$p WHERE id=$id;',{$id:V.utf8(id),$p:V.jsonDocument(JSON.stringify(m))});return m})},
  async claimDelete(id){return tx(async q=>{const state=await readState(q);if(refs(state).has(id))return false;const m=await readMedia(q,id);if(!m)return false;m.status='deleting';await q('DECLARE $id AS Utf8; DECLARE $p AS JsonDocument; UPDATE sk_gallery_media SET payload=$p WHERE id=$id;',{$id:V.utf8(id),$p:V.jsonDocument(JSON.stringify(m))});return m})},
  deleteMedia:id=>run(s=>s.executeQuery('DECLARE $id AS Utf8; DELETE FROM sk_gallery_media WHERE id=$id;',{$id:V.utf8(id)})),
  async oldMedia(before,cursor){return run(async s=>rows(await s.executeQuery('DECLARE $before AS Timestamp; DECLARE $cursor AS Utf8; SELECT id,payload FROM sk_gallery_media WHERE created<$before AND id>$cursor ORDER BY id ASC LIMIT 1;',{$before:V.timestamp(new Date(before)),$cursor:V.utf8(cursor||'')})).map(x=>parse(x.payload)))},
 };
}
module.exports={createGalleryStorage,refs};
