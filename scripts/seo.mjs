// Only the custom-domain production build calls this transform.
// public/ and build:demo retain their noindex policy.
export const canonical = 'https://skparket.ru/';
export const title = 'Укладка штучного паркета в СПб под ключ | SK паркет';
export const description = 'Укладка штучного паркета под ключ в Санкт-Петербурге: подбор, закупка, доставка и финишная обработка. Калькулятор стоимости и бесплатный выезд в пределах КАД.';
export const businessSchema = {
  '@context':'https://schema.org',
  '@graph':[
    {'@type':'Organization','@id':canonical+'#business',name:'SK паркет',url:canonical,telephone:'+79117982306',email:'skparket@bk.ru'},
    {'@type':'Service','@id':canonical+'#service',name:'Укладка штучного паркета под ключ',serviceType:'Укладка штучного паркета',provider:{'@id':canonical+'#business'},areaServed:{'@type':'City',name:'Санкт-Петербург'},url:canonical}
  ]
};
export function productionSeo(html) {
  const head = html.match(/<head>[\s\S]*?<\/head>/i)?.[0];
  if (!head) throw new Error('Missing document head');
  let next = head.replace(/<script\b(?=[^>]*\bid=["']business-schema["'])[^>]*>[\s\S]*?<\/script>\s*/gi, '').replace(/<title>[\s\S]*?<\/title>/i, '<title>'+title+'</title>')
    .replace(/<meta\b(?=[^>]*\bname=["'](?:description|robots|googlebot|yandex)["'])[^>]*>\s*/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>\s*/gi, '');
  next = next.replace('</title>', '</title>\n<meta name="description" content="'+description+'">\n<link rel="canonical" href="'+canonical+'">');
  next = next.replace('</head>', '<script id="business-schema" type="application/ld+json">'+JSON.stringify(businessSchema)+'</script>\n</head>');
  return html.replace(head, next);
}
