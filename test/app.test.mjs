import {DatabaseSync} from 'node:sqlite';import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomBytes,scryptSync} from 'node:crypto';import {calculate,validateConfig} from '../public/engine.js';
const root=new URL('../',import.meta.url),seed=JSON.parse(readFileSync(new URL('../config.seed.json',import.meta.url))),selection={area:20,wood:'natur',finish:'eco',pattern:'herringbone',base:'screed',foundation:'plywood'};
test('shared engine: scenarios, rounding, own materials, no duplicate billing',()=>{
 validateConfig(seed);let a=calculate(seed,selection);assert(a.total[1]>a.total[0]);assert.equal(a.groups.flatMap(g=>g.rows).reduce((s,x)=>s+(x.cost?.[0]||0),0),a.total[0]);
 assert(calculate(seed,{...selection,ownParquet:true}).total[0]<a.total[0]);assert(calculate(seed,{...selection,ownSupplies:true}).total[0]<a.total[0]);
 assert(!calculate(seed,{...selection,base:'ready'}).groups.flatMap(g=>g.rows).some(x=>x.name==='Монтаж фанеры'));
 assert(!calculate(seed,{...selection,foundation:'direct'}).groups.flatMap(g=>g.rows).some(x=>x.name==='Монтаж фанеры'));
 assert(calculate(seed,{...selection,pattern:'custom'}).partial);assert.throws(()=>calculate(seed,{...selection,area:0}));
 const copy=structuredClone(seed);copy.common.push('hardware');assert.equal(calculate(copy,selection).groups.flatMap(g=>g.rows).filter(x=>x.name==='Крепёж').length,1);
 copy.items[0].active=false;assert.throws(()=>validateConfig(copy));
 const another=structuredClone(seed);another.woods[0].price=NaN;assert.throws(()=>validateConfig(another));
});
test('server: auth, CSRF, drafts, publication, concurrency, leads, restore, persistence',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'parket-test-')),port=3200+Math.floor(Math.random()*1000),origin='http://127.0.0.1:'+port,password=randomBytes(22).toString('hex'),salt=randomBytes(16).toString('hex'),hash='scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex');let proc;
 const legacy=new DatabaseSync(path.join(dir,'parket.sqlite'));legacy.exec("CREATE TABLE leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL, phone TEXT NOT NULL, comment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', version INTEGER, estimate TEXT, consent_version TEXT NOT NULL)");legacy.close();
 const launch=async()=>{proc=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PUBLIC_ORIGIN:origin,DATA_DIR:dir,ADMIN_PASSWORD_HASH:hash,LEADS_ENABLED:'true',PRIVACY_OPERATOR_CONFIRMED:'yes'},stdio:'pipe'});for(let i=0;i<100;i++){try{if((await fetch(origin+'/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,30))}throw Error('Server did not start')};
 const stop=()=>new Promise(r=>{proc.once('exit',r);proc.kill('SIGTERM')});
 let cookie='',csrf='';const request=async(url,method='GET',data,headers={})=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});const json=(r.headers.get('content-type')||'').includes('application/json')?await r.json():await r.text();return {r,json}};
 try{await launch();const sw=await request('/notifications-sw.js');assert.equal(sw.r.status,200);assert(sw.r.headers.get('content-type').includes('javascript'));assert(sw.json.includes('notificationclick'));let x=await request('/api/admin/config');assert.equal(x.r.status,401);x=await request('/api/login','POST',{password},{Origin:'https://evil.example'});assert.equal(x.r.status,403);x=await request('/api/login','POST',{password:'incorrect'});assert.equal(x.r.status,401);x=await request('/api/login','POST',{password});assert.equal(x.r.status,200);cookie=x.r.headers.get('set-cookie').split(';')[0];assert(x.r.headers.get('set-cookie').includes('HttpOnly'));csrf=x.json.csrf;
 let st=(await request('/api/admin/config')).json;const initial=st.published.version,originalPrice=st.draft.woods[0].price;st.draft.woods[0].price=originalPrice+1000;
 assert.equal((await request('/api/admin/config','PUT',{config:st.draft,revision:st.revision},{'X-CSRF-Token':'wrong'})).r.status,403);
 const conflictRev=st.revision;st=(await request('/api/admin/config','PUT',{config:st.draft,revision:st.revision})).json;assert.equal((await request('/api/config')).json.config.woods[0].price,originalPrice);
 assert.equal((await request('/api/admin/config','PUT',{config:st.draft,revision:conflictRev})).r.status,409);
 st=(await request('/api/admin/publish','POST',{revision:st.revision})).json;assert.equal(st.published.config.woods[0].price,originalPrice+1000);
 assert.equal((await request('/api/leads','POST',{phone:'79991234567',comment:'Тест',consent:false})).r.status,400);
 assert.equal((await request('/api/leads','POST',{phone:'79991234567',comment:'Тест',consent:true,selection,version:initial})).r.status,409);
 x=await request('/api/leads','POST',{name:' Алексей ',phone:'79991234567',comment:'<script>alert(1)</script>',consent:true,selection,version:st.published.version,photos:[{data:Buffer.from([255,216,255,224,0,16,255,217]).toString('base64')}]});assert.equal(x.r.status,201);const id=x.json.id;
 const lead=(await request('/api/admin/leads/'+id)).json;assert.equal(lead.name,'Алексей');assert(lead.estimate.total[0]>0);assert.equal(lead.photos.length,1);const ph=lead.photos[0].id;
 let r=await fetch(origin+'/api/admin/leads');assert.equal(r.status,401);r=await fetch(origin+'/api/admin/photos/'+ph);assert.equal(r.status,401);
 assert.equal((await request('/api/admin/leads/'+id,'PATCH',{status:'progress',note:'Позвонить'})).r.status,200);
 st=(await request('/api/admin/restore','POST',{version:initial,revision:st.revision})).json;assert.equal(st.draft.woods[0].price,originalPrice);assert.equal(st.published.config.woods[0].price,originalPrice+1000);
 const before=lead.estimate.total;await stop();await launch();const after=(await request('/api/admin/leads/'+id)).json;assert.deepEqual(after.estimate.total,before);assert.equal(after.note,'Позвонить');assert.equal(after.name,'Алексей');
 assert.equal((await request('/api/admin/leads/'+id,'DELETE',{})).r.status,200);assert.equal((await request('/api/admin/photos/'+ph)).r.status,404);
 r=await fetch(origin+'/server.mjs');assert.equal(r.status,404);r=await fetch(origin+'/.env');assert.equal(r.status,404);r=await fetch(origin+'/');assert(r.headers.get('content-security-policy').includes("script-src 'self'"));assert.equal((await request('/api/logout','POST',{})).r.status,200);assert.equal((await request('/api/admin/config')).r.status,401);
 }finally{if(proc?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true})}
});
