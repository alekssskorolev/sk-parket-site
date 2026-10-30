import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {validateConfig} from '../public/engine.js';
const require=createRequire(import.meta.url);
const sharp=require('../cloud-functions/ydb-stage1/function/node_modules/sharp');
const root=new URL('../',import.meta.url),assets=new URL('public/assets/seo/',root),content=new URL('public/content/',root);
mkdirSync(assets,{recursive:true});mkdirSync(content,{recursive:true});
const origin='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net';
async function get(path){const r=await fetch(origin+path,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(path+': HTTP '+r.status);return r}
const hash=b=>createHash('sha256').update(b).digest('hex').slice(0,16);
const src=name=>'./assets/seo/'+name;
async function variants(bytes){
 const metadata=await sharp(bytes).metadata(),widths=[...new Set([400,800,1200].map(w=>Math.min(w,metadata.width)))].sort((a,b)=>a-b);
 const files={webp:{},jpeg:{}};
 for(const width of widths){
  for(const [format,ext]of [['webp','webp'],['jpeg','jpg']]){
   const output=await sharp(bytes).rotate().resize({width,withoutEnlargement:true})[format]({quality:format==='webp'?82:88}).toBuffer();
   const file=hash(output)+'-'+width+'.'+ext;
   writeFileSync(new URL(file,assets),output);files[format][width]=src(file);
  }
 }
 const fallback=widths.includes(800)?800:widths.at(-1);
 return {src:files.jpeg[fallback],webp:widths.map(w=>files.webp[w]+' '+w+'w').join(', '),jpeg:widths.map(w=>files.jpeg[w]+' '+w+'w').join(', '),full:files.jpeg[widths.at(-1)],width:metadata.width,height:metadata.height};
}
const state=await (await get('/api/config')).json();
validateConfig(state.config);
if(!Number.isInteger(state.version)||!state.updated||state.config.demo)throw Error('Expected a published production price configuration');
const gallery=await (await get('/api/gallery')).json();
if(gallery.configured!==true||!gallery.items?.length)throw Error('Public gallery must be configured');
const images={},items=[];
for(const x of gallery.items){
 if(!['project','visualization'].includes(x.kind)||!['pair','single'].includes(x.mode)||typeof x.title!=='string'||typeof x.description!=='string')throw Error('Unsupported gallery metadata');
 const item={id:x.id,title:x.title,description:x.description,kind:x.kind,mode:x.mode,placement:x.placement,before:null,after:null};
 for(const key of x.mode==='single'?['after']:['before','after']){
  const image=x[key];
  if(!/^\/api\/gallery\/images\/[a-f0-9-]{36}$/.test(image?.path)||!Number.isInteger(image.width)||!Number.isInteger(image.height))throw Error('Invalid public image');
  const r=await get(image.path),bytes=Buffer.from(await r.arrayBuffer());
  if(!r.headers.get('content-type')?.startsWith('image/'))throw Error('Image MIME missing');
  images[image.path]=await variants(bytes);
  if(images[image.path].width!==image.width||images[image.path].height!==image.height)throw Error('Image dimensions differ from public manifest');
  item[key]={path:image.path,width:image.width,height:image.height};
  console.log(JSON.stringify({path:image.path,status:r.status,contentType:r.headers.get('content-type'),bytes:bytes.length,width:image.width,height:image.height}));
 }
 items.push(item);
}
const fetchedAt=new Date().toISOString();
writeFileSync(new URL('prices.json',content),JSON.stringify({fetchedAt,source:origin+'/api/config',version:state.version,updated:state.updated,config:state.config},null,2)+'\n');
writeFileSync(new URL('gallery.json',content),JSON.stringify({fetchedAt,source:origin+'/api/gallery',updated:gallery.updated,items},null,2)+'\n');
writeFileSync(new URL('gallery-images.json',content),JSON.stringify(images,null,2)+'\n');
writeFileSync(new URL('web-cloud/image-manifest.js',root),'// Generated from the public gallery; rerun refresh-public-content.mjs.\nexport const galleryImages = '+JSON.stringify(images,null,2)+';\n');
// Externalize the current approved source images. SVG logos remain SVG; photos get responsive WebP/JPEG.
let html=readFileSync(new URL('public/index.html',root),'utf8');
for(const match of [...html.matchAll(/<img\b[^>]*\bsrc="data:image\/([^;]+);base64,([^"]+)"[^>]*>/g)]){
 const [tag,type,base64]=match,bytes=Buffer.from(base64,'base64');
 if(type==='svg+xml'){
  const name=hash(bytes)+'.svg';writeFileSync(new URL(name,assets),bytes);html=html.replace(tag,tag.replace(/src="[^"]+"/,'src="'+src(name)+'"'));continue;
 }
 const v=await variants(bytes),sizes=tag.includes('portrait')?'(max-width:699px) calc(100vw - 40px), 420px':tag.includes('Сергей')?'(max-width:699px) calc(100vw - 40px), 420px':'(max-width:699px) 30vw, 180px';
 const img=tag.replace(/src="[^"]+"/,'src="'+v.src+'" srcset="'+v.jpeg+'" sizes="'+sizes+'"');
 html=html.replace(tag,'<picture><source type="image/webp" srcset="'+v.webp+'" sizes="'+sizes+'">'+img+'</picture>');
}
if(/data:image\//.test(html))throw Error('Embedded image remains in source HTML');
writeFileSync(new URL('public/index.html',root),html);
console.log(JSON.stringify({fetchedAt,version:state.version,cards:items.length,images:Object.keys(images).length,emptyDescriptions:items.filter(x=>!x.description).map(x=>x.title)}));
