
'use strict';
const {createHandler}=require('./app');
const {createStorage}=require('./ydb-storage');
const {createAdminStorage}=require('./admin-storage');
const {createAdminHandler}=require('./admin-app');
const seed=require('./config.seed.json');
let init;
module.exports.handler=async function(event={},context){
 init||=import('./engine.mjs').then(engine=>{
  const raw=createStorage(),adminStorage=createAdminStorage(raw.getDriver,seed);
  const legacy=createHandler({storage:raw,...engine});
  const admin=createAdminHandler({storage:adminStorage,...engine});
  return async(e,c)=>{
   const result=await admin(e,c);if(result)return result;
   const route=e.queryStringParameters?.route||e.path||e.rawPath||'/health';
   if(route==='/health'){try{await raw.check();await adminStorage.ensure();return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:true,database:'connected',stage:'admin',leadsEnabled:false})}}catch{return {statusCode:503,body:JSON.stringify({ok:false,error:'Database unavailable'})}}}
   if(route==='/api/config'&&process.env.ADMIN_ORIGIN){try{return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://alekssskorolev.github.io'},body:JSON.stringify({...await adminStorage.current(),leadsEnabled:false,photosEnabled:false,testOnly:true})}}catch{return {statusCode:503,body:JSON.stringify({error:'Сервис временно недоступен'})}}}
   return legacy({...e,queryStringParameters:{...e.queryStringParameters,route}},c);
  };
 });return (await init)(event,context);
};
