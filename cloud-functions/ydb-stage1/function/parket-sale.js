'use strict';
const https=require('node:https');
const SOURCE='https://www.parket-sale.ru/parketnaya-himiya/berger-seidle/klei/odnokomponentnyy-parketnyy-kley-berger-bond-m1x-7kg.html';
const ARTICLE='156524';
function plain(html){return html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>{const n=s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' '}).replace(/&(nbsp|thinsp|ensp|emsp|quot|amp|lt|gt);/gi,(_,s)=>({nbsp:' ',thinsp:' ',ensp:' ',emsp:' ',quot:'"',amp:'&',lt:'<',gt:'>'}[s.toLowerCase()])).replace(/\s+/g,' ').trim()}
function parseProduct(html){
 if(typeof html!=='string'||html.length>2200000)throw Error('Некорректная страница магазина');
 const h1=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
 if(!/Berger\s+(?:Bond\s+)?M1X\s+7\s*кг/iu.test(h1))throw Error('Название товара или фасовка изменились. Цена не обновлена.');
 const text=plain(html);
 if(!/(?:Вес упаковки,?\s*кг|Фасовка,?\s*кг)\s*:?\s*7\b/iu.test(text))throw Error('Не удалось подтвердить фасовку 7 кг.');
 if(!/Артикул\s*:?\s*156524\b[\s\S]{0,100}?Товар\s+в\s+наличии/iu.test(text))throw Error('Товар отсутствует или наличие не подтверждено.');
 const prices=[];
 for(const m of text.matchAll(/Артикул\s*:?\s*156524\b/giu)){
  const part=text.slice(m.index+m[0].length,m.index+m[0].length+1000).split(/Самые покупаемые|Рекомендуем|Похожие товары|С этим товаром|Сопутствующ/iu)[0];
  const value=part.match(/(?<!\d)(\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:руб\.?|₽|р\.)\s*(?:\/|за)?\s*(?:шт\.?|уп\.?|упаковк[ауи])/iu)?.[1];
  if(value){const n=Number(value.replace(/\s/g,'').replace(',','.'));if(Number.isFinite(n))prices.push(n)}
 }
 const unique=[...new Set(prices)];
 if(unique.length!==1||unique[0]<1000||unique[0]>100000)throw Error('Цена упаковки не распознана однозначно.');
 return {article:ARTICLE,price:Math.round(unique[0]*100)/100,packSize:7,packUnit:'кг',inStock:true,source:SOURCE};
}
async function fetchProduct(){
 const deadline=Date.now()+9000;
 async function read(url,redirects=0){
  const u=new URL(url),fixed=new URL(SOURCE);
  if(u.protocol!=='https:'||!['www.parket-sale.ru','parket-sale.ru'].includes(u.hostname)||u.pathname!==fixed.pathname||u.port||u.username||u.password||redirects>2)throw Error('Магазин перенаправил на другую страницу.');
  return new Promise((resolve,reject)=>{
   const req=https.get(u,{family:4,headers:{'User-Agent':'SKParket-PriceCheck/1.0 (+https://skparket.ru)','Accept':'text/html'},signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(!res.headers.location)return reject(Error('Некорректный ответ магазина.'));read(new URL(res.headers.location,u).href,redirects+1).then(resolve,reject);return}
    if(res.statusCode!==200){res.resume();reject(Error('Магазин недоступен (HTTP '+res.statusCode+').'));return}
    if(!String(res.headers['content-type']).includes('text/html')){res.resume();reject(Error('Магазин вернул неожиданный формат.'));return}
    const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>2200000){req.destroy();reject(Error('Страница магазина слишком большая.'));return}chunks.push(b)});res.on('error',()=>reject(Error('Не удалось загрузить страницу магазина.')));res.on('end',()=>{try{const charset=String(res.headers['content-type']).match(/charset=["']?([\w-]+)/i)?.[1]||'utf-8';resolve(new TextDecoder(charset).decode(Buffer.concat(chunks)))}catch{reject(Error('Не удалось прочитать ответ магазина.'))}});
   });req.on('error',()=>reject(Error('Не удалось соединиться с магазином. Повторите позже.')));
  });
 }
 return parseProduct(await read(SOURCE));
}
module.exports={SOURCE,ARTICLE,parseProduct,fetchProduct};
