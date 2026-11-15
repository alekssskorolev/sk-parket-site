const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../..');
const fixture=()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hero-static-'));return {directory,workspace:pathToFileURL(directory+'/'),clean:()=>fs.rmSync(directory,{recursive:true,force:true})}};
const publication=()=>({revision:1,desktop:{image:'/api/gallery/images/11111111-1111-4111-8111-111111111111',name:'Desktop',zoom:70,panX:20,panY:70,strength:100,position:50,width:100,darkness:0,brightness:76,text:'dark'},mobile:{image:'/api/gallery/images/22222222-2222-4222-8222-222222222222',name:'Mobile',zoom:150,panX:70,panY:20,strength:0,position:50,width:100,darkness:12,brightness:60,text:'light'}});
test('static sync validates all bytes, commits one consistent manifest and is idempotent',async()=>{
 const {refreshHero,currentSnapshot}=await import('../../../scripts/refresh-hero-content.mjs'),bytes=fs.readFileSync(root+'/public/assets/hero-desktop.webp'),f=fixture(),published=publication();let requests=0;
 try{const fetcher=async(url,options)=>{assert.equal(options.redirect,'error');requests++;return url.includes('view=hero')?Response.json(published):new Response(bytes,{headers:{'content-type':'image/webp'}})};
  assert.equal(await refreshHero({fetcher,workspace:f.workspace}),true);const s=currentSnapshot(f.workspace);assert.equal(s.published.revision,1);assert.equal(s.images.desktop.src,s.images.mobile.src);assert.ok(s.images.desktop.width>0);assert.equal(requests,4);
  assert.equal(await refreshHero({fetcher,workspace:f.workspace}),false);assert.equal(requests,5);
 }finally{f.clean()}
});
test('publication races and corrupt downloads never replace the previous snapshot',async()=>{
 const {refreshHero}=await import('../../../scripts/refresh-hero-content.mjs'),bytes=fs.readFileSync(root+'/public/assets/hero-desktop.webp');
 for(const mode of ['race','corrupt','redirect']){const f=fixture();let reads=0;try{
  await refreshHero({workspace:f.workspace,fetcher:async url=>url.includes('view=hero')?Response.json(publication()):new Response(bytes,{headers:{'content-type':'image/webp'}})});
  const previous=fs.readFileSync(f.directory+'/public/content/hero.json','utf8');
  const fetcher=async(url)=>{
   if(url.includes('view=hero')){const p=publication();p.revision=mode==='race'&&reads++?3:2;return Response.json(p)}
   if(mode==='redirect')return new Response(null,{status:302});return new Response(mode==='corrupt'?'not a webp':bytes,{headers:{'content-type':'image/webp'}});
  };await assert.rejects(refreshHero({fetcher,workspace:f.workspace}));assert.equal(fs.readFileSync(f.directory+'/public/content/hero.json','utf8'),previous)
 }finally{f.clean()}}
});
