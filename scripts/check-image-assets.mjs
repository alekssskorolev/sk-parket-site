import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const canonical='https://skparket.ru/',hash=b=>createHash('sha256').update(b).digest('hex');
async function requestAsset(url){
 for(let attempt=0;attempt<4;attempt++){
  const r=await fetch(url,{signal:AbortSignal.timeout(45000)});
  if(![429,502,503,504].includes(r.status)||attempt===3)return r;
  await r.arrayBuffer();console.log(JSON.stringify({assetRetry:url,status:r.status,attempt:attempt+1}));
  await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
 }
}
export async function checkImageAssets(out){
 mkdirSync(out,{recursive:true});
 const files=readdirSync(new URL('../docs/assets/seo/',import.meta.url)),results=[];let next=0;
 await Promise.all(Array.from({length:3},async()=>{
  for(;;){
   const name=files[next++];if(!name)return;
   const url=canonical+'assets/seo/'+name,r=await requestAsset(url);assert.equal(r.status,200,url);
   const bytes=Buffer.from(await r.arrayBuffer()),expected=readFileSync(new URL('../docs/assets/seo/'+name,import.meta.url));
   assert.equal(hash(bytes),hash(expected),url);
   const ext=name.split('.').at(-1),mime={webp:'image/webp',jpg:'image/jpeg',svg:'image/svg+xml'}[ext];
   assert.ok(r.headers.get('content-type')?.startsWith(mime),url);
   results.push({url,status:r.status,contentType:r.headers.get('content-type'),cacheControl:r.headers.get('cache-control'),bytes:bytes.length,sha256:hash(bytes)});
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 }));
 writeFileSync(out+'/image-responses.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({imageFilesChecked:files.length,allStatus200:true,allMimeCorrect:true,allHashesMatch:true}));
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkImageAssets(process.argv[2]||'seo-evidence/images');
