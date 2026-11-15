import {readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {HERO_ORIGIN,HERO_DEVICES,validateHeroManifest,validateHeroSnapshot} from './hero-content.mjs';
const root=new URL('../',import.meta.url);
const MAX_IMAGE_BYTES=5000000;
export async function boundedBytes(response,maxBytes){
 if(Number(response.headers.get('content-length'))>maxBytes||!response.body)throw Error('Public response is too large or empty');
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes){await reader.cancel();throw Error('Public response is too large')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
 return Buffer.concat(chunks,length);
}
export async function readManifest(fetcher=fetch){const r=await fetcher(HERO_ORIGIN+'/api/gallery?view=hero',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Published hero HTTP '+r.status);return validateHeroManifest(JSON.parse((await boundedBytes(r,32768)).toString('utf8')))}
export function currentSnapshot(workspace=root){try{return validateHeroSnapshot(JSON.parse(readFileSync(new URL('public/content/hero.json',workspace),'utf8')))}catch{return null}}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function needsRefresh(published,snapshot=currentSnapshot(),workspace=root){
 if(!snapshot||JSON.stringify(snapshot.published)!==JSON.stringify(published))return true;
 for(const device of HERO_DEVICES){const file=new URL('public/'+snapshot.images[device].src.slice(2),workspace);if(!existsSync(file)||!snapshot.images[device].src.endsWith('/'+hash(readFileSync(file))+'.webp'))return true;
  if(published[device].image===null&&hash(readFileSync(new URL('public/assets/hero-'+device+'.webp',workspace)))!==hash(readFileSync(file)))return true;
 }
 return false;
}
export async function refreshHero({fetcher=fetch,workspace=root}={}){
 const published=await readManifest(fetcher);if(!needsRefresh(published,currentSnapshot(workspace),workspace))return false;
 const sharp=createRequire(import.meta.url)('../cloud-functions/ydb-stage1/function/node_modules/sharp'),images={},buffers=new Map();
 for(const device of HERO_DEVICES){
  let bytes;
  if(published[device].image===null)bytes=readFileSync(new URL('public/assets/hero-'+device+'.webp',workspace));
  else{const r=await fetcher(HERO_ORIGIN+published[device].image,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/webp'))throw Error('Invalid public hero image response');bytes=await boundedBytes(r,MAX_IMAGE_BYTES)}
  if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw Error('Hero image is too large');
  const meta=await sharp(bytes,{limitInputPixels:60000000}).metadata();if(meta.format!=='webp'||!meta.width||!meta.height||meta.width*meta.height>60000000)throw Error('Unsupported hero image');
  await sharp(bytes,{limitInputPixels:60000000}).stats();
  const name=hash(bytes)+'.webp';images[device]={src:'./assets/hero/'+name,width:meta.width,height:meta.height};buffers.set(name,bytes);
 }
 // Publication/rollback can race downloads; never publish a mixed snapshot.
 const latest=await readManifest(fetcher);if(JSON.stringify(latest)!==JSON.stringify(published))throw Error('Hero publication changed while downloading; retry synchronization');
 const snapshot=validateHeroSnapshot({schema:1,published,images}),targetAssets=new URL('public/assets/hero/',workspace);mkdirSync(targetAssets,{recursive:true});mkdirSync(new URL('public/content/',workspace),{recursive:true});
 for(const [name,bytes]of buffers)writeFileSync(new URL(name,targetAssets),bytes);
 writeFileSync(new URL('public/content/hero.json',workspace),JSON.stringify(snapshot,null,2)+'\n');return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const check=process.argv.includes('--check'),changed=check?needsRefresh(await readManifest()):await refreshHero();
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'changed='+changed+'\n');
 console.log(changed?'Published hero snapshot needs/received update':'Published hero snapshot is current');
}
