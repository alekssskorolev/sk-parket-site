// Only the custom-domain production build calls this transform.
// public/ and build:demo retain their noindex policy.
export const canonical = 'https://skparket.ru/';
export const title = 'Укладка штучного паркета в СПб под ключ | SK паркет';
export const description = 'Укладка штучного паркета под ключ в Санкт-Петербурге: подбор, закупка, доставка и финишная обработка. Калькулятор стоимости и бесплатный выезд в пределах КАД.';
export function productionSeo(html) {
  const head = html.match(/<head>[\s\S]*?<\/head>/i)?.[0];
  if (!head) throw new Error('Missing document head');
  let next = head.replace(/<title>[\s\S]*?<\/title>/i, '<title>'+title+'</title>')
    .replace(/<meta\b(?=[^>]*\bname=["'](?:description|robots|googlebot|yandex)["'])[^>]*>\s*/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>\s*/gi, '');
  next = next.replace('</title>', '</title>\n<meta name="description" content="'+description+'">\n<link rel="canonical" href="'+canonical+'">');
  return html.replace(head, next);
}
