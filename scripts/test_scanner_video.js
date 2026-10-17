/* Video evidence contract: qualifiers, signs, duplicates, unknown labels and
 * inferred values must not inflate exact/direct extraction measurements. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compare}=require('../tests/scanner/video-metrics.js');
const root=path.resolve(__dirname,'..'),labels=require('../tests/scanner/video/2026-10-16.json');
const seen=new Set();
for(const label of labels.cases){
 assert(!seen.has(label.time),'one independently labelled encounter per timestamp');seen.add(label.time);
 assert(label.time>=0 && label.time<labels.source.duration);
 assert(['crafting','storage'].includes(label.mode));assert(['main','war'].includes(label.hall));
 assert([5,6].includes(label.rows.length));assert(label.rows.every(r=>typeof r[0]==='string' && Number.isFinite(r[1])));
 if(label.stars){assert.equal(label.stars.length,label.rows.length);assert(label.stars.every(s=>s===null || typeof s==='boolean'));}
}
const label={mode:'storage',title:'Helg\u00f6 Buddha',category:'War Weapon',hall:'war',unlocked:1,dice:true,rows:[['Enemy Tower Damage',-1,2],['Enemy Tower Damage',-6,null]]};
const gold={valid:true,artifact:{name:'Helgo Buddha',type:'War Weapon'},hall:'war',rows:label.rows.map(([name,value,level],i)=>({name,value,level,known:true,unlocked:i===0,rerollEligible:true}))};
assert(compare(label,gold).visibleExact,'diacritics normalize and an unreadable gold level is excluded');
const copy=()=>JSON.parse(JSON.stringify(gold));
let result=copy();result.rows[0].value=1;assert(!compare(label,result).statsExact,'sign error cannot pass');
assert(compare(label,result).acceptedWrongStats,'wrong accepted signed value is exposed');
result=copy();result.rows[0].name='Tower Damage';assert(!compare(label,result).statsExact,'enemy qualifier is mandatory');
result=copy();result.rows.reverse();assert(!compare(label,result).statsExact,'duplicate physical rows cannot swap percentages');
result=copy();result.rows.splice(0,1);assert(!compare(label,result).statsExact,'omitted row cannot borrow its neighbour');
result=copy();result.rows.push({...result.rows[0]});assert(!compare(label,result).statsExact,'extra rows are not complete');
result=copy();result.rows[1].inferred=true;assert(compare(label,result).statsExact && !compare(label,result).directStats,'correct inference is not direct OCR');
result=copy();result.rows[0].assumed=true;assert(!compare(label,result).directStats,'assumed names are not direct');
result=copy();result.rows[0].inferredFields=['name'];assert(!compare(label,result).directStats);
result=copy();result.rows[0].rerollEligible=null;assert(!compare(label,result).visibleExact,'unread dice cannot count as complete');
result=copy();result.rows[0].level=3;assert(!compare(label,result).visibleExact,'wrong visible upgrade level fails');
result=copy();result.rows[1].unlocked=null;
assert(compare({...label,stars:[true,null]},result).visibleExact,'unlabelled animated star is excluded');
assert(!compare(label,result).visibleExact,'a labelled locked star is still required');
result=copy();result.artifact.name='Different artifact';assert(!compare(label,result).visibleExact,'stored title is required');
assert(!compare(label,null).statsExact,'no result is a missed read');
for(const filename of ['scanner-video-2026-10-16-baseline.json','scanner-video-2026-10-16-replay.json','scanner-video-category-after.json','scanner-video-category-replay.json','scanner-video-percentage-after.json','scanner-video-percentage-replay.json','scanner-video-stat-context-after.json','scanner-video-evidence-replay.json','scanner-video-evidence-control-replay.json']){
 const file=path.join(root,'reports',filename);if(!fs.existsSync(file))continue;
 const text=fs.readFileSync(file,'utf8'),report=JSON.parse(text);
 if(report.testVariant && report.testVariant!=='production')assert.match(report.scope,/Isolated historical control/,'Control measurements must identify their changed inference behavior');
 assert.equal(report.source.sha256,labels.source.sha256);
 assert(!text.includes('data:image/'),'reports never embed frame/artwork pixels');
 if(report.runs)for(const run of report.runs){const goldLabel=labels.cases.find(label=>label.time===run.time);assert(goldLabel);assert.deepEqual(run.accuracy,compare(goldLabel,run.result),'saved baseline metrics reproduce from labels and selected result');}
 if(report.records)for(const record of report.records){const goldLabel=labels.cases.find(label=>label.time===record.nearestLabelTime);assert(goldLabel);assert.deepEqual(record.accuracy,compare(goldLabel,record.result),'saved replay metrics reproduce from independently labelled fields');}
 if(report.encountered){const direct=new Set(report.records.filter(record=>record.withinTwoSeconds && record.accuracy.directStats).map(record=>record.nearestLabelTime));assert.equal(report.summary.withDirectStats,direct.size,'correct inference cannot inflate direct encounter totals');}
}
console.log('Scanner video evidence checks passed.');
