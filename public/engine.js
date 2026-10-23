class InputError extends Error {constructor(message){super(message);this.status=422;}}
/* Shared calculation engine: used by site, admin preview and server. No executable formulas in data. */
export function isChemical(x,key){return key==='finishes'||key==='items'&&x.kind==='material'&&x.unit==='pack'}
export function materialData(x,key){const finish=key==='finishes',match=String(x.spec||'').match(/(\d+(?:[.,]\d+)?)\s*(кг|л)(?=\s|[·;,.]|$)/u),size=x.packSize||(match?Number(match[1].replace(',','.')):1),packUnit=finish?'л':x.packUnit||(match?match[2]:'уп.');const usage=finish?size/x.coverage:x.consumption*size;return {size,packUnit,usage,rate:x.pricingMode==='area'?x.areaPrice:finish?x.price/x.coverage:x.price*x.consumption,mode:x.pricingMode||'pack'}}
export function validateConfig(c) {
 const fail=s=>{throw new InputError(s)};
 if(!c||c.schema!==1)fail('Неверная версия данных');
 const text=(v,n=250)=>typeof v==='string'&&v.length<=n&&!/[\u0000-\u0008\u000b-\u001f]/.test(v);
 const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(!text(c.note,2000)||!text(c.exclusions,2000)||typeof c.demo!=='boolean')fail('Проверьте пояснения');
 for(const k of ['workLow','workHigh','materialLow','materialHigh'])if(!num(c.margins?.[k],0,60))fail('Разброс должен быть от 0 до 60%');
 const all=new Set();
 for(const key of ['woods','finishes','patterns','bases','foundations','items']){
  if(!Array.isArray(c[key])||!c[key].length||c[key].length>100)fail('Проверьте раздел '+key);
  for(const x of c[key]){
   if(!text(x.id,50)||!/^[-a-z0-9]+$/.test(x.id)||all.has(x.id))fail('Некорректный или повторный код');all.add(x.id);
   if(!text(x.name,150)||!x.name.trim()||!text(x.note||'',1000)||typeof x.active!=='boolean')fail('Проверьте название и описание');
   if(['woods','finishes','patterns','items'].includes(key)&&!num(x.price,0.01,10000000))fail('Цена должна быть больше нуля');
   if(['woods','finishes'].includes(key)&&!text(x.spec,150))fail('Укажите характеристику материала');
   if(key==='finishes'&&(!num(x.packSize,.01,1000)||!num(x.coverage,.01,100000)))fail('Укажите объём и площадь банки на весь цикл');
   if(isChemical(x,key)){if(x.pricingMode!==undefined&&!['area','pack'].includes(x.pricingMode))fail('Выберите способ расчёта материала');if(x.pricingMode==='area'&&!num(x.areaPrice,.01,10000000))fail('Цена за м² должна быть больше нуля');if(x.packSize!==undefined&&!num(x.packSize,.01,1000))fail('Проверьте объём упаковки');if(x.packUnit!==undefined&&!['л','кг','уп.'].includes(x.packUnit))fail('Проверьте единицу расхода');}
   if(key==='patterns'&&(!num(x.waste,0,100)||!['straight','herringbone','checker','custom','unknown'].includes(x.visual)||typeof x.individual!=='boolean'))fail('Проверьте рисунок и запас');
   if(key==='bases'&&!['choose','existing'].includes(x.mode))fail('Проверьте сценарий основания');
   if(key==='items'&&(!['work','material'].includes(x.kind)||!['m2','pack','sheet'].includes(x.unit)||!['none','chem'].includes(x.owner)||!num(x.consumption,.00001,100)||!num(x.waste,0,100)||!text(x.spec,150)||!['base','chem','work'].includes(x.group)))fail('Проверьте единицы, расход и тип позиции');
  }
 }
 const ids=new Map(c.items.map(x=>[x.id,x]));
 const recipes=[...c.bases,...c.foundations,{name:'Общий состав',active:true,recipe:c.common}];
 for(const x of recipes){
  if(!Array.isArray(x.recipe)||x.recipe.length>100||new Set(x.recipe).size!==x.recipe.length||x.recipe.some(id=>!ids.has(id)))fail('Состав содержит неизвестную или повторную позицию: '+x.name);
  if(x.active&&x.recipe.some(id=>!ids.get(id).active))fail('В активном составе отключена позиция: '+x.name);
 }
 for(const key of ['woods','finishes','patterns','bases','foundations'])if(!c[key].some(x=>x.active&&x.id===c.defaults?.[key]))fail('Выберите активный базовый вариант: '+key);
 // Repeated positions across recipes counted once; they cannot be charged twice.
 return c;
}
export function calculate(c,s) {
 const find=(key,id)=>{const x=c[key].find(x=>x.id===id&&x.active);if(!x)throw new InputError('Вариант больше недоступен: '+key);return x};
 const area=Number(s.area);if(!Number.isFinite(area)||area<1||area>10000)throw new InputError('Площадь от 1 до 10 000 м²');
 const wood=find('woods',s.wood),finish=find('finishes',s.finish),pattern=find('patterns',s.pattern),base=find('bases',s.base),foundation=find('foundations',s.foundation);
 const q=n=>Math.round(n*100)/100;
 const rows=[];
 const add=(name,detail,price,quantity,kind,group,excluded=false,pending=false,unit='м²')=>{
  const m=c.margins,low=kind==='work'?m.workLow:m.materialLow,high=kind==='work'?m.workHigh:m.materialHigh;
  rows.push({name,detail,unit,kind,quantity:q(quantity),excluded,pending,group,cost:excluded||pending?null:[Math.round(price*quantity*(1-low/100)),Math.round(price*quantity*(1+high/100))]});
 };
 const woodArea=Math.ceil(area*(1+pattern.waste/100)*10-1e-8)/10;
 add(wood.name,wood.spec+' · '+woodArea+' м² · запас '+pattern.waste+'%'+(wood.note?' · '+wood.note:''),wood.price,woodArea,'material','wood',!!s.ownParquet,pattern.individual&&!s.ownParquet);
 const unique=new Set([...base.recipe,...(base.mode==='choose'?foundation.recipe:[]),...c.common]);
 for(const id of unique){const x=c.items.find(x=>x.id===id&&x.active);if(!x)throw new InputError('Некорректный состав');
  if(isChemical(x,'items')&&x.pricingMode==='area'){const m=materialData(x,'items'),quantity=area*(1+x.waste/100);add(x.name,area+' м² · расход '+q(m.usage)+' '+m.packUnit+'/м²'+(x.waste?' · запас '+x.waste+'%':'')+' · '+x.spec,x.areaPrice,quantity,x.kind,x.group,!!s.ownSupplies&&x.owner==='chem',false,'м²');continue}
  const raw=area*x.consumption*(1+x.waste/100),quantity=x.unit==='m2'?q(raw):Math.ceil(raw-1e-8);
  const unit={m2:'м²',pack:'уп.',sheet:'лист.'}[x.unit];
  add(x.name,[quantity+' '+unit,x.spec,x.note].filter(Boolean).join(' · '),x.price,quantity,x.kind,x.group,!!s.ownSupplies&&x.owner==='chem',false,unit);
 }
 const packs=Math.ceil(area/finish.coverage-1e-8);
 if(finish.pricingMode==='area'){const m=materialData(finish,'finishes');add('Лак · '+finish.name,area+' м² · расход '+q(m.usage)+' л/м² на все 3 слоя · '+finish.spec,finish.areaPrice,area,'material','chem',!!s.ownSupplies,false,'м²')}else add('Лак · '+finish.name,packs+' уп. × '+finish.packSize+' л · '+finish.spec+' · 1 уп. на '+finish.coverage+' м² на весь цикл',finish.price,packs,'material','chem',!!s.ownSupplies,false,'уп.');
 add('Укладка · '+pattern.name,area+' м² · '+pattern.note,pattern.price,area,'work','work',false,pattern.individual);
 const total=rows.reduce((a,x)=>x.cost?[a[0]+x.cost[0],a[1]+x.cost[1]]:a,[0,0]);
 const titles={wood:'Паркет',base:'Подготовка основания',chem:'Клей, химия и расходники',work:'Работы по паркету'};
 const groups=Object.entries(titles).map(([id,title])=>({title,rows:rows.filter(x=>x.group===id)})).filter(g=>g.rows.length);
 const scope=[base.note,base.mode==='choose'?foundation.note:'',c.exclusions].filter(Boolean).join(' ');
 return {total,groups,scope,partial:pattern.individual,area,pattern:pattern.name,base:base.name,spec:wood.name+' · '+wood.spec+'; '+(base.mode==='existing'?base.name:foundation.name)+'; '+finish.name,selection:{area,wood:wood.id,finish:finish.id,pattern:pattern.id,base:base.id,foundation:foundation.id,ownParquet:!!s.ownParquet,ownSupplies:!!s.ownSupplies}};
}
