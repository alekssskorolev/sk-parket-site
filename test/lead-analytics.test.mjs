import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web-cloud/site.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('// IDs are used only'),source.indexOf('let floorPhotos=[];'));
const handler=source.slice(source.indexOf("$('contact-form').addEventListener('submit',async"),source.indexOf('refreshConfig();setInterval'));
function setup({storage=new Map(),ym,locks}={}){
 const calls=[],nodes=new Map();let submit;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='phone'?'9000000000':'private-form-value',checked:true,classList:{add(){}},setAttribute(){},focus(){},querySelector(){return {disabled:false}},addEventListener(type,fn){if(type==='submit')submit=fn}});return nodes.get(id)};
 const context=vm.createContext({window:{ym:ym||((...args)=>calls.push(args))},navigator:locks?{locks}:{},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},$:node,crypto:{randomUUID:()=> 'request-id'},setSummary(){},refreshConfig:async()=>{},request:async()=>{throw Error('network failure')}});
 vm.runInContext(helper+"\nlet submitting=false,pendingRequestId=null,selectedEstimate=null;const publicState={leadsEnabled:true,consentVersion:'v1'};\n"+handler,context);
 return {context,calls,storage,fire:()=>submit({preventDefault(){}}),submit:async(response,result)=>{context.request=async()=>({...response,json:async()=>result});await submit({preventDefault(){}})},track:async(response,result)=>{context.response=response;context.result=result;await vm.runInContext('trackSavedLead(response,result)',context)}};
}
test('all entry points use the shared handler; only a confirmed save sends the three-argument goal',async()=>{
 const h=setup();await h.submit({ok:true,status:201},{ok:true,id:'lead-a',phone:'private',name:'private'});
 assert.deepEqual(h.calls,[[113925373,'reachGoal','lead_saved']]);
 assert.match(source,/callback-form-slot.*append\(\$\('contact-form'\)\)/);
 assert.match(source,/\$\('discuss'\)\.addEventListener\('click'/);
});
test('HTTP errors, application errors and incomplete confirmations never send a goal',async()=>{
 for(const [response,result] of [[{ok:false,status:422},{ok:true,id:'a'}],[{ok:false,status:500},{error:'failed'}],[{ok:true,status:200},{ok:false,id:'a'}],[{ok:true,status:200},{ok:true}],[{ok:true,status:200},{ok:true,id:''}]]){
  const h=setup();await h.submit(response,result);assert.equal(h.calls.length,0);
 }
});
test('a network failure or unreadable JSON never sends a goal',async()=>{
 for(const request of [async()=>{throw TypeError('offline')},async()=>({ok:true,json:async()=>{throw SyntaxError('bad JSON')}})]){
  const h=setup();h.context.request=request;
  await h.fire();assert.equal(h.calls.length,0);
 }
});
test('repeated confirmations, including server duplicate responses, send one goal per saved ID',async()=>{
 const h=setup();await h.track({ok:true},{ok:true,id:'a',duplicate:true});await h.track({ok:true},{ok:true,id:'a',duplicate:true});await h.track({ok:true},{ok:true,id:'b'});
 assert.equal(h.calls.length,2);
 const reloaded=setup({storage:h.storage});await reloaded.track({ok:true},{ok:true,id:'a'});assert.equal(reloaded.calls.length,0);
});
test('blocked storage still deduplicates repeated confirmations in memory',async()=>{
 const h=setup();h.context.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 await h.track({ok:true},{ok:true,id:'a'});await h.track({ok:true},{ok:true,id:'a'});assert.equal(h.calls.length,1);
});
test('missing or throwing analytics never breaks a successful submission',async()=>{
 const h=setup();delete h.context.window.ym;await h.submit({ok:true,status:201},{ok:true,id:'a'});assert.equal(h.calls.length,0);assert.equal(h.storage.size,0);
 const throwing=setup({ym(){throw Error('analytics failed')}});await throwing.submit({ok:true,status:201},{ok:true,id:'a'});
});
test('Web Locks serialize confirmations across tabs sharing local storage',async()=>{
 let queue=Promise.resolve();const locks={request(name,fn){assert.equal(name,'skparket:metrika:lead_saved');const next=queue.then(fn);queue=next.catch(()=>{});return next}};
 const storage=new Map(),a=setup({storage,locks}),b=setup({storage,locks});await Promise.all([a.track({ok:true},{ok:true,id:'a'}),b.track({ok:true},{ok:true,id:'a'})]);assert.equal(a.calls.length+b.calls.length,1);
});
test('published script matches the source',()=>assert.equal(readFileSync(new URL('../docs/site.js',import.meta.url),'utf8'),source));
