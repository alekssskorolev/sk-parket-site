import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web-cloud/site.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('// IDs and source labels'),source.indexOf('let floorPhotos=[];'));
const callbacks=source.slice(source.indexOf('function resetSubmission'),source.indexOf('function info('));
const handler=source.slice(source.indexOf("$('contact-form').addEventListener('submit',async"),source.indexOf('refreshConfig();setInterval'));
const goalCalls=type=>[[113925373,'reachGoal',type+'_lead_saved'],[113925373,'reachGoal','lead_saved']];
function setup({storage=new Map(),ym,locks}={}){
 const calls=[],nodes=new Map(),listeners=new Map(),buttons=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='phone'?'9000000000':'private-form-value',checked:true,classList:{add(){},remove(){}},setAttribute(){},focus(){},append(){},showModal(){},querySelector(){return {disabled:false}},addEventListener(type,fn){listeners.set(id+':'+type,fn)}});return nodes.get(id)};
 for(const id of ['header','hero','banner'])buttons.push(node(id));
 const context=vm.createContext({window:{ym:ym||((...args)=>calls.push(args))},navigator:locks?{locks}:{},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},$:node,document:{body:node('body'),querySelectorAll(selector){assert.equal(selector,'.request-call');return buttons}},crypto:{randomUUID:()=> 'request-id'},structuredClone,setSummary:summary=>{if(!summary)vm.runInContext('selectedEstimate=null',context)},refreshConfig:async()=>{},request:async()=>{throw Error('network failure')}});
 vm.runInContext(helper+"\nlet submitting=false,pendingRequestId=null,selectedEstimate=null,leadSource='callback';const floorPhotos=[];const publicState={leadsEnabled:true,consentVersion:'v1',version:1};const estimate={selection:{area:20}};\n"+callbacks+handler,context);
 const fire=()=>listeners.get('contact-form:submit')({preventDefault(){}});
 const open=place=>place==='calculator'?listeners.get('discuss:click')():place==='lower'?undefined:listeners.get(place+':click')();
 return {context,calls,storage,node,open,close:()=>listeners.get('callback-dialog:close')(),fire,submit:async(response,result)=>{context.request=async()=>({...response,json:async()=>result});await fire()},track:async(response,result,type='callback')=>{context.response=response;context.result=result;context.sourceType=type;await vm.runInContext('trackSavedLead(response,result,sourceType)',context)}};
}
for(const place of ['calculator','header','hero','lower','banner'])test(place+': opening is silent; a saved application sends its category and common goal',async()=>{
 const h=setup();h.open(place);assert.equal(h.calls.length,0);
 await h.submit({ok:true,status:201},{ok:true,id:'lead-'+place,phone:'private',name:'private'});
 assert.deepEqual(h.calls,goalCalls(place==='calculator'?'calculator':'callback'));
});
test('closing calculator and using a callback entry point does not retain calculator attribution',async()=>{
 for(const place of ['header','lower','banner']){const h=setup();h.open('calculator');h.close();h.open(place);await h.submit({ok:true},{ok:true,id:'a'});assert.deepEqual(h.calls,goalCalls('callback'))}
});
test('source is captured before the server response, even if the dialog closes',async()=>{
 const h=setup();h.open('calculator');let resolve;h.context.request=()=>new Promise(r=>{resolve=r});const pending=h.fire();h.close();resolve({ok:true,json:async()=>({ok:true,id:'a'})});await pending;assert.deepEqual(h.calls,goalCalls('calculator'));
});
for(const place of ['calculator','header','lower','banner'])test(place+': validation and server errors send no goals',async()=>{
 for(const invalid of ['phone','consent']){const h=setup();h.open(place);if(invalid==='phone')h.node('phone').value='1';else h.node('consent').checked=false;await h.submit({ok:true},{ok:true,id:'a'});assert.equal(h.calls.length,0)}
 for(const [response,result] of [[{ok:false,status:422},{ok:true,id:'a'}],[{ok:false,status:500},{error:'failed'}],[{ok:true},{ok:false,id:'a'}],[{ok:true},{ok:true}],[{ok:true},{ok:true,id:''}]]){const h=setup();h.open(place);await h.submit(response,result);assert.equal(h.calls.length,0)}
});
test('network failure and unreadable JSON send no goals',async()=>{
 for(const request of [async()=>{throw TypeError('offline')},async()=>({ok:true,json:async()=>{throw SyntaxError('bad JSON')}})]){const h=setup();h.context.request=request;await h.fire();assert.equal(h.calls.length,0)}
});
test('repeated confirmations and reloads keep the original source and send each goal once',async()=>{
 const h=setup();await h.track({ok:true},{ok:true,id:'a',duplicate:true},'calculator');await h.track({ok:true},{ok:true,id:'a'},'callback');assert.deepEqual(h.calls,goalCalls('calculator'));
 const reloaded=setup({storage:h.storage});await reloaded.track({ok:true},{ok:true,id:'a'},'callback');assert.equal(reloaded.calls.length,0);
 await reloaded.track({ok:true},{ok:true,id:'b'});assert.deepEqual(reloaded.calls,goalCalls('callback'));
});
test('the previously recorded common goal is not sent again after upgrade',async()=>{
 const h=setup({storage:new Map([['skparket:metrika:lead_saved:a','1']])});await h.track({ok:true},{ok:true,id:'a'},'calculator');assert.deepEqual(h.calls,[[113925373,'reachGoal','calculator_lead_saved']]);
});
test('blocked storage still deduplicates in memory',async()=>{
 const h=setup();h.context.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 await h.track({ok:true},{ok:true,id:'a'},'calculator');await h.track({ok:true},{ok:true,id:'a'},'callback');assert.deepEqual(h.calls,goalCalls('calculator'));
});
test('missing or throwing analytics does not break successful submission or the other goal',async()=>{
 const h=setup();delete h.context.window.ym;await h.submit({ok:true},{ok:true,id:'a'});assert.equal(h.calls.length,0);assert.equal(h.storage.size,0);
 const calls=[];const throwing=setup({ym(...args){calls.push(args);if(args[2]==='callback_lead_saved')throw Error('analytics failed')}});await throwing.submit({ok:true},{ok:true,id:'a'});assert.deepEqual(calls,goalCalls('callback'));
});
test('Web Locks deduplicate concurrent confirmations from tabs sharing storage',async()=>{
 let queue=Promise.resolve();const locks={request(name,fn){assert.equal(name,'skparket:metrika:lead_saved');const next=queue.then(fn);queue=next.catch(()=>{});return next}};
 const storage=new Map(),a=setup({storage,locks}),b=setup({storage,locks});await Promise.all([a.track({ok:true},{ok:true,id:'a'},'calculator'),b.track({ok:true},{ok:true,id:'a'},'callback')]);assert.deepEqual([...a.calls,...b.calls],goalCalls('calculator'));
});
test('published script matches the source',()=>assert.equal(readFileSync(new URL('../docs/site.js',import.meta.url),'utf8'),source));
