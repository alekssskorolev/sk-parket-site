// Only these public routes are called by the static site. No admin cookies are sent.
export const API_ORIGIN='https://d5dbi82cmvjpt86kth9a.d8epmcec.apigw.yandexcloud.net';
export async function request(path,options={}){
 if(!['/api/config','/api/leads','/api/gallery'].includes(path))throw Error('Неизвестный маршрут');
 return fetch(API_ORIGIN+path,{...options,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(45000)});
}
