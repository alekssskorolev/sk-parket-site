// GITHUB_TOKEN commits do not trigger legacy Pages automatically. Also recover
// a previous successful snapshot push whose subsequent build request failed.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {currentSnapshot,boundedBytes} from './refresh-hero-content.mjs';
export function pagesBuildAction(latest,head){
 if(latest&&['queued','building'].includes(latest.status))return 'pending';
 if(latest?.status==='built'&&latest.commit===head)return 'current';
 return 'request';
}
export async function requestPagesBuild({repository,token,head,force=false,fetcher=fetch,onRequested=()=>{}}){
 if(repository!=='alekssskorolev/sk-parket-site'||!token||!/^[a-f0-9]{40}$/.test(head))throw Error('Invalid Pages build context');
 const url='https://api.github.com/repos/'+repository+'/pages/builds',headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const response=await fetcher(url+'/latest',{headers,signal:AbortSignal.timeout(30000)});
 if(!response.ok&&response.status!==404)throw Error('Pages build lookup HTTP '+response.status);
 const latest=response.status===404?null:await response.json();let action=pagesBuildAction(latest,head);
 if(force&&action==='current')action='request';
 if(action==='request'){onRequested(latest);const r=await fetcher(url,{method:'POST',headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Pages build request HTTP '+r.status)}
 return action;
}
export async function waitForPagesBuild({repository,token,head,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxAttempts=30,requested=false,previousBuild=null,requireFresh=false}){
 const url='https://api.github.com/repos/'+repository+'/pages/builds',headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const identity=value=>JSON.stringify([value?.id,value?.created_at,value?.updated_at,value?.commit,value?.status]);let seenFresh=!previousBuild;
 for(let attempt=0;attempt<maxAttempts;attempt++){
  const r=await fetcher(url+'/latest',{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Pages build lookup HTTP '+r.status);const latest=await r.json();
  if(identity(latest)!==identity(previousBuild)||['queued','building'].includes(latest.status))seenFresh=true;
  if(latest.status==='built'&&latest.commit===head&&(!requireFresh||seenFresh))return;
  if(latest.status==='errored'&&latest.commit===head&&(!requested||seenFresh))throw Error('Pages build failed for the published hero commit');
  if(!requested&&pagesBuildAction(latest,head)==='request'){const response=await fetcher(url,{method:'POST',headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Pages recovery request HTTP '+response.status);requested=true}
  if(attempt+1<maxAttempts)await sleep(10000);
 }
 throw Error('Timed out waiting for Pages publication of the hero commit');
}
export async function verifyStaticHero({snapshot,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxAttempts=12}){
 const start=Date.now();let lastError;
 for(let attempt=0;attempt<maxAttempts&&Date.now()-start<120000;attempt++){
  try{
   const r=await fetcher('https://skparket.ru/?hero_static_revision='+snapshot.published.revision,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('text/html'))throw Error('Public hero page HTTP/MIME '+r.status);const html=(await boundedBytes(r,1000000)).toString('utf8');
   if(!html.includes('data-hero-revision="'+snapshot.published.revision+'"')||!Object.values(snapshot.images).every(x=>html.includes(x.src)))throw Error('Pages hero snapshot has not propagated yet');
   for(const image of new Map(Object.values(snapshot.images).map(x=>[x.src,x])).values()){
    const response=await fetcher('https://skparket.ru/'+image.src.slice(2),{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/webp'))throw Error('Static hero asset HTTP/MIME '+response.status);const bytes=await boundedBytes(response,5000000),{createHash}=await import('node:crypto');if(!image.src.endsWith('/'+createHash('sha256').update(bytes).digest('hex')+'.webp'))throw Error('Static hero asset digest mismatch');
   }
   return;
  }catch(error){lastError=error}
  if(attempt+1<maxAttempts)await sleep(5000);
 }
 throw Error('Static hero publication could not be verified: '+lastError?.message);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),context={repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,head};
 let previousBuild;const force=process.env.HERO_FORCE_BUILD==='true';
 const action=await requestPagesBuild({...context,force,onRequested:latest=>{previousBuild=latest}});console.log('Pages build: '+action);
 await waitForPagesBuild({...context,requested:action==='request',previousBuild,requireFresh:force&&action==='request'});
 const snapshot=currentSnapshot();if(!snapshot)throw Error('Missing static hero snapshot');await verifyStaticHero({snapshot});console.log('Static hero publication verified');
}
