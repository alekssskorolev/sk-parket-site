
'use strict';
const {createHandler}=require('./app');
const {createStorage}=require('./ydb-storage');
const {createAdminStorage}=require('./admin-storage');
const {createAdminHandler}=require('./admin-app');
const {createPublicHandler,intakeEnabled}=require('./public-app');
const {createTelegram,isTimerEvent}=require('./telegram');
const {createGalleryStorage}=require('./gallery-storage');
const {createGallery,createObjectStore}=require('./gallery');
const seed=require('./config.seed.json');
let init;
module.exports.handler=async function(event={},context){
 init||=import('./engine.mjs').then(engine=>{
  const raw=createStorage(),adminStorage=createAdminStorage(raw.getDriver,seed);
  const objects=createObjectStore(),galleryStorage=createGalleryStorage(raw.getDriver);
  const gallery=createGallery({storage:galleryStorage,objects,limits:adminStorage});
  const telegram=createTelegram({storage:adminStorage});
  const legacy=createHandler({storage:raw,...engine});
  const admin=createAdminHandler({storage:adminStorage,telegram,gallery,...engine});
  const publicAPI=createPublicHandler({storage:adminStorage,telegram,gallery,...engine});
  return async(e,c)=>{
   objects.credentials(c);
   if(isTimerEvent(e)){await Promise.all([telegram.flush(3),gallery.cleanup().catch(()=>{})]);return {ok:true}}
   const result=await admin(e,c);if(result)return result;
   const route=e.queryStringParameters?.route||e.path||e.rawPath||'/health';
   if(route==='/health'){try{await raw.check();await adminStorage.ensure();await galleryStorage.ensure();return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:true,database:'connected',stage:'cloud-site',leadsEnabled:intakeEnabled(process.env)})}}catch{return {statusCode:503,body:JSON.stringify({ok:false,error:'Database unavailable'})}}}
   if(process.env.ADMIN_ORIGIN){const response=await publicAPI(e);if(response)return response;}
   return legacy({...e,queryStringParameters:{...e.queryStringParameters,route}},c);
  };
 });return (await init)(event,context);
};
