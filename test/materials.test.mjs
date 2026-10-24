import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {materialData,calculate,validateConfig,updateMaterialRate,calculationExclusions,defaultExclusions} from '../public/engine.js';
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

test('quick rate edits preserve package purchasing and consumption',()=>{
 const c=seed(),finish=c.finishes[0],glue=c.items.find(x=>x.id==='glue');
 c.margins={workLow:0,workHigh:0,materialLow:0,materialHigh:0};
 const coverage=finish.coverage,consumption=glue.consumption;
 updateMaterialRate(finish,'finishes',1500);assert.equal(finish.pricingMode,undefined);assert.equal(finish.coverage,coverage);assert.equal(finish.price,1500*coverage);assert.equal(materialData(finish,'finishes').rate,1500);
 updateMaterialRate(glue,'items',2000);assert.equal(glue.pricingMode,undefined);assert.equal(glue.consumption,consumption);assert.equal(glue.price,2000/consumption);assert.equal(materialData(glue,'items').rate,2000);validateConfig(c);
 let r=calculate(c,{...select(c),area:17});let row=r.groups.flatMap(g=>g.rows).find(x=>x.name.startsWith('Лак ·'));assert.equal(row.quantity,2);assert.equal(row.unit,'уп.');assert.deepEqual(row.cost,[48000,48000]);
 finish.pricingMode='pack';updateMaterialRate(finish,'finishes',1000);assert.equal(finish.pricingMode,'pack');assert.equal(finish.price,16000);
 finish.pricingMode='area';finish.areaPrice=100;const packPrice=finish.price;updateMaterialRate(finish,'finishes',123);assert.equal(finish.pricingMode,'area');assert.equal(finish.price,packPrice);assert.equal(finish.areaPrice,123);
 const before=JSON.stringify(glue);assert.throws(()=>updateMaterialRate(glue,'items',10000000));assert.equal(JSON.stringify(glue),before);assert.throws(()=>updateMaterialRate(glue,'items',NaN));
});
test('legacy exclusion copy is clarified without replacing custom text',()=>{
 const legacy={exclusions:'Расчёт предполагает пригодное основание. Доставка, подъём, ремонт основания, демонтаж, плинтусы и вывоз — отдельно.'};assert.equal(calculationExclusions(legacy),defaultExclusions);assert.equal(calculationExclusions({exclusions:'Мои условия'}),'Мои условия');
});
