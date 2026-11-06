// Navigation views share the existing items array and pricing/recipe model.
export const itemSections=['glues','putties','primers','work','items'];
export function itemSection(item){
 if(item.kind==='work')return 'work';
 if(['glues','putties','primers','items'].includes(item.adminCategory))return item.adminCategory;
 const name=String(item.name||'');
 if(/кле[йя]|\bglue\b/iu.test(name)||['glue','ply-glue'].includes(item.id))return 'glues';
 if(/шпакл|шпатл|\bputty\b/iu.test(name)||item.id==='putty')return 'putties';
 if(/грунт|\bprimer\b/iu.test(name)||item.id==='primer')return 'primers';
 return 'items';
}
export function newItem(section,items){
 const template=items.find(x=>itemSection(x)===section);
 const fallback={name:'Новый материал',kind:'material',unit:'pack',price:1,consumption:1,packSize:1,packUnit:'кг',waste:0,group:'chem',owner:'chem',spec:'',note:'',active:true};
 const item=structuredClone(template||fallback);
 item.name=({glues:'Новый клей',putties:'Новая шпаклёвка',primers:'Новая грунтовка',items:'Новый расходник'})[section];
 if(item.kind==='material')item.adminCategory=section;
 return item;
}
