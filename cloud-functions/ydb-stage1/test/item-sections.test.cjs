const {test}=require('node:test'),assert=require('node:assert/strict');
const seed=require('../function/config.seed.json');
test('admin item views partition legacy rows, including both glue recipes, without changing calculation',async()=>{
 const {itemSection,newItem}=await import('../function/admin-public/item-sections.js');
 const {validateConfig,calculate}=await import('../function/engine.mjs');
 const {targetSignature}=require('../function/price-sync');
 const by=id=>itemSection(seed.items.find(x=>x.id===id));
 assert.equal(by('glue'),'glues');assert.equal(by('ply-glue'),'glues');assert.equal(by('putty'),'putties');assert.equal(by('primer'),'primers');assert.equal(by('putty-work'),'work');assert.equal(by('hardware'),'items');assert.equal(by('ply-sheet'),'items');
 assert.equal(itemSection({kind:'work',adminCategory:'glues',name:'Клей'}),'work');
 assert.equal(itemSection({kind:'material',name:'Другой клей'}),'glues');
 assert.equal(itemSection({kind:'material',name:'Новый состав'}),'items');
 const config=structuredClone(seed),glue=config.items.find(x=>x.id==='glue'),before=targetSignature(config);
 glue.adminCategory='glues';validateConfig(config);assert.equal(targetSignature(config),before);
 const selection={area:20,wood:'natur',finish:'eco',pattern:'herringbone',base:'screed',foundation:'plywood'};
 assert.deepEqual(calculate(config,selection),calculate(seed,selection));
 glue.name='Переименованный материал';assert.equal(itemSection(glue),'glues');
 const copy=structuredClone(glue);copy.id='another-glue';assert.equal(itemSection(copy),'glues');
 for(const section of ['glues','putties','primers','items']){
  const item=newItem(section,[]);item.id='new-'+section;const c=structuredClone(seed);c.items.push(item);validateConfig(c);assert.equal(itemSection(item),section);
 }
});
test('item section module is served on the existing admin asset route',async()=>{
 const {createAdminHandler}=require('../function/admin-app');
 const handler=createAdminHandler({env:{ADMIN_ORIGIN:'https://admin.example',ADMIN_PASSWORD:'fixture-password-long'}});
 const result=await handler({path:'/gallery-admin.js',httpMethod:'GET',queryStringParameters:{module:'item-sections'},headers:{host:'admin.example'}});
 assert.equal(result.statusCode,200);assert.match(result.body,/export function itemSection/);
});
