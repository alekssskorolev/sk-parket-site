import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {materialData,calculate,validateConfig} from '../public/engine.js';
const seed=()=>JSON.parse(fs.readFileSync(new URL('../config.seed.json',import.meta.url)));
const select=c=>({area:20,...Object.fromEntries(Object.entries(c.defaults).map(([k,v])=>[{woods:'wood',finishes:'finish',patterns:'pattern',bases:'base',foundations:'foundation'}[k],v]))});
test('chemical prices: legacy, m2, pack, exclusions, validation',()=>{
 const c=seed();validateConfig(c);const glue=c.items.find(x=>x.id==='glue');assert.equal(materialData(glue,'items').usage,1.2);assert.ok(Math.abs(materialData(glue,'items').rate-10000*1.2/7)<.001);
 const finish=c.finishes.find(x=>x.id===c.defaults.finishes),m=materialData(finish,'finishes');assert.equal(m.usage,finish.packSize/finish.coverage);assert.equal(m.rate,finish.price/finish.coverage);
 c.margins={workLow:0,workHigh:0,materialLow:0,materialHigh:0};finish.pricingMode='area';finish.areaPrice=123;glue.pricingMode='area';glue.areaPrice=100;validateConfig(c);
 let r=calculate(c,select(c));let lacquer=r.groups.flatMap(x=>x.rows).find(x=>x.name.startsWith('Лак ·'));assert.deepEqual(lacquer.cost,[2460,2460]);assert.equal(lacquer.unit,'м²');let g=r.groups.flatMap(x=>x.rows).find(x=>x.name===glue.name);assert.deepEqual(g.cost,[2000,2000]);
 r=calculate(c,{...select(c),ownSupplies:true});assert.equal(r.groups.flatMap(x=>x.rows).find(x=>x.name===glue.name).cost,null);
 finish.pricingMode='pack';finish.price=1000;finish.packSize=5;finish.coverage=50;assert.equal(materialData(finish,'finishes').rate,20);r=calculate(c,select(c));assert.deepEqual(r.groups.flatMap(x=>x.rows).find(x=>x.name.startsWith('Лак ·')).cost,[1000,1000]);
 glue.areaPrice=0;assert.throws(()=>validateConfig(c));glue.areaPrice=100;glue.consumption=0;assert.throws(()=>validateConfig(c));
});
