const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHandler} = require('../function/app');
const {insertParams, INSERT_ORDER} = require('../function/ydb-storage');
const seed = require('../function/config.seed.json');
const ORIGIN = 'https://alekssskorolev.github.io';
const validBody = () => ({name:'Тестовая заявка',phone:'70000000000',comment:'Проверка без реальных данных',consent:true,photos:[]});
const event = (body=validBody(), extra={}) => ({httpMethod:'POST',queryStringParameters:{route:'/api/test-leads'},headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body),...extra});
async function fixture(options={}) {
  const engine = await import('../function/engine.mjs');
  const rows=[];
  const handler = createHandler({storage:{check:async()=>{},insert:async row=>{rows.push(row)}},env:{TEST_WRITES_ENABLED:'true'},...engine,makeId:()=> 'test-known',now:()=>new Date('2026-01-01T00:00:00Z'),...options});
  return {handler,rows};
}
const json = response => JSON.parse(response.body);
test('health checks storage; no customer intake enabled',async()=>{const {handler}=await fixture();const r=await handler({});assert.equal(r.statusCode,200);assert.equal(json(r).leadsEnabled,false)});
test('public config matches source and cannot enable the form',async()=>{const {handler}=await fixture();const r=await handler({httpMethod:'GET',queryStringParameters:{route:'/api/config'}});assert.equal(r.statusCode,200);assert.deepEqual(json(r).config,seed);assert.equal(json(r).leadsEnabled,false)});
test('synthetic lead is saved before returning 201',async()=>{const {handler,rows}=await fixture();const r=await handler(event());assert.equal(r.statusCode,201);assert.equal(rows.length,1);assert.equal(json(r).id,'test-known');assert.equal(rows[0].consentVersion,'test-only-not-a-real-consent')});
test('test writes default off',async()=>{const {handler,rows}=await fixture({env:{}});assert.equal((await handler(event())).statusCode,503);assert.equal(rows.length,0)});
test('live intake stays disabled even when legacy env flags are set',async()=>{const {handler,rows}=await fixture({env:{LEADS_ENABLED:'true',PRIVACY_OPERATOR_CONFIRMED:'yes'}});const r=await handler(event(validBody(),{queryStringParameters:{route:'/api/leads'}}));assert.equal(r.statusCode,503);assert.equal(rows.length,0)});
test('wrong origin rejected before writing; no permissive CORS',async()=>{const {handler,rows}=await fixture();const r=await handler(event(validBody(),{headers:{Origin:'https://evil.example','Content-Type':'application/json'}}));assert.equal(r.statusCode,403);assert.equal(r.headers['Access-Control-Allow-Origin'],undefined);assert.equal(rows.length,0)});
test('approved CORS preflight',async()=>{const {handler}=await fixture();const r=await handler({httpMethod:'OPTIONS',headers:{Origin:ORIGIN}});assert.equal(r.statusCode,204);assert.equal(r.headers['Access-Control-Allow-Origin'],ORIGIN)});
test('unknown-origin preflight rejected',async()=>{const {handler}=await fixture();assert.equal((await handler({httpMethod:'OPTIONS'})).statusCode,403)});
for(const [label,patch] of [
 ['real phone',{phone:'79991234567'}],['arbitrary name',{name:'Реальный клиент'}],
 ['consent missing',{consent:false}],['too long comment',{comment:'x'.repeat(2001)}],
 ['photos',{photos:[{data:'abcdef'}]}],['invalid photos type',{photos:{}}],
 ['honeypot',{website:'https://spam.example'}],['comment type',{comment:[]}],
 ['invalid control character',{comment:'test\u0000'}]
]) test('rejects '+label,async()=>{const {handler,rows}=await fixture();const r=await handler(event({...validBody(),...patch}));assert.ok(r.statusCode>=400&&r.statusCode<500);assert.equal(rows.length,0)});
test('rejects invalid JSON',async()=>{const {handler}=await fixture();assert.equal((await handler(event(null,{body:'{'}))).statusCode,400)});
test('rejects non-JSON content type',async()=>{const {handler}=await fixture();assert.equal((await handler(event(validBody(),{headers:{'Content-Type':'text/plain'}}))).statusCode,415)});
test('rejects oversized payload before write',async()=>{const {handler,rows}=await fixture();assert.equal((await handler(event({...validBody(),comment:'x'.repeat(40000)}))).statusCode,413);assert.equal(rows.length,0)});
test('supports Cloud Functions base64 events',async()=>{const {handler}=await fixture();const r=await handler(event(validBody(),{body:Buffer.from(JSON.stringify(validBody())).toString('base64'),isBase64Encoded:true}));assert.equal(r.statusCode,201)});
const selection=()=>({area:35,wood:seed.defaults.woods,finish:seed.defaults.finishes,pattern:seed.defaults.patterns,base:seed.defaults.bases,foundation:seed.defaults.foundations,ownParquet:false,ownSupplies:false});
test('server calculates estimate; ignores forged browser total',async()=>{const {handler,rows}=await fixture();const r=await handler(event({...validBody(),version:1,selection:selection(),estimate:{total:[1,1]}}));assert.equal(r.statusCode,201);assert.ok(rows[0].estimate.total[0]>1);assert.equal(rows[0].estimate.priceVersion,1);assert.equal(rows[0].estimate.area,35)});
test('rejects stale price version',async()=>{const {handler,rows}=await fixture();assert.equal((await handler(event({...validBody(),version:0,selection:selection()}))).statusCode,409);assert.equal(rows.length,0)});
test('rejects unknown material',async()=>{const {handler,rows}=await fixture();assert.equal((await handler(event({...validBody(),version:1,selection:{...selection(),wood:'missing'}}))).statusCode,422);assert.equal(rows.length,0)});
test('rejects coerced booleans',async()=>{const {handler}=await fixture();assert.equal((await handler(event({...validBody(),version:1,selection:{...selection(),ownParquet:'false'}}))).statusCode,422)});
test('no admin/customer listing exposed',async()=>{const {handler}=await fixture();const r=await handler({httpMethod:'GET',queryStringParameters:{route:'/api/admin/leads'}});assert.equal(r.statusCode,404)});
test('storage failure never reported as success or leaked',async()=>{const {handler}=await fixture({storage:{check:async()=>{},insert:async()=>{throw Error('secret-token-123')}}});const r=await handler(event());assert.equal(r.statusCode,503);assert.ok(!r.body.includes('secret-token-123'))});
test('parameterized YDB query preserves literal malicious-looking input',async()=>{const params=insertParams({id:'test-x',created:new Date(),name:'Тестовая заявка',phone:'70000000000',comment:"'; DROP TABLE orders; --",estimate:null,consentVersion:'test-only'});assert.ok(params.$comment);assert.ok(params.$created);assert.ok(params.$estimate);assert.ok(!INSERT_ORDER.includes('DROP TABLE'));assert.match(INSERT_ORDER,/INSERT INTO orders/)});
test('real entrypoint loads SDK and responds to config without live DB',async()=>{const {handler}=require('../function/index');const r=await handler({httpMethod:'GET',queryStringParameters:{route:'/api/config'}});assert.equal(r.statusCode,200);assert.equal(json(r).testOnly,true)});
