import {readFileSync,writeFileSync} from 'node:fs';
const dir=process.argv[2],results=[];
for(const profile of ['mobile','desktop']){
 const r=JSON.parse(readFileSync(dir+'/'+profile+'.json','utf8'));
 results.push({profile,url:r.finalDisplayedUrl||r.finalUrl,date:r.fetchTime,lighthouseVersion:r.lighthouseVersion,userAgent:r.userAgent,settings:r.configSettings,performanceScore:r.categories.performance.score,LCP:r.audits['largest-contentful-paint'].numericValue,CLS:r.audits['cumulative-layout-shift'].numericValue,TBT:r.audits['total-blocking-time'].numericValue,INP:'Not measured by this navigation lab test',fieldCrUX:'Not measured'});
}
writeFileSync(dir+'/summary.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
