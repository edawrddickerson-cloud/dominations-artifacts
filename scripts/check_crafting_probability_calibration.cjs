/* Hold out complete artifacts by ID; report predictions without asserting that
 * approximate game models must reproduce each random sample exactly. */
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const input=process.argv.find(a=>a.startsWith('--input='))?.slice(8);
if(!input)throw Error('Use --input=PRIVATE_LOG_OR_BACKFILL_PLAN.json');
const raw=JSON.parse(fs.readFileSync(input)),log=raw.workspace?.craftingLog || raw.craftingLog || raw;
const app={window:{}};vm.createContext(app);for(const f of ['data/artifact_stat_context','crafted-log-stats','crafting-community','crafting-probability'])vm.runInContext(fs.readFileSync('ui/'+f+'.js','utf8'),app);
const C=app.window.DNCraftingCommunity,P=app.window.DNCraftingProbability,rules=C.rules();
const items=log.items.filter(i=>!C.encode(i,rules).exclusion),held=i=>crypto.createHash('sha256').update(i.id).digest()[0]%5===0;
const training=items.filter(i=>!held(i)),testing=items.filter(held),results=[];
for(const hall of ['main','war'])for(const category of P.categories[hall]){
 const model=P.model(training,hall,category);if(!model.artifacts)continue;
 const e=[1,0,0,0,0,0];for(const perk of model.perks)for(let n=5;n>0;n--)e[n]+=e[n-1]*perk.rows/model.rows;
 const repeatProbability=1-120*e[5],sample=testing.filter(i=>i.hall===hall&&i.type===category);
 for(const period of ['event','normal']){
  const [start,end]=P.calibration[period].map(Date.parse),test=sample.filter(i=>Date.parse(i.firstSeen)>=start&&Date.parse(i.firstSeen)<end),profile=model.profiles[period];
  if(!test.length||profile.artifacts<20)continue;
  const top=P.calculate(model,[{perks:model.perks.map(p=>p.name),count:1,mode:'combined',match:'atLeast',tier:'max'}],period);
  if(top.status!=='ready')continue;
  const observed={repeat:0,topTier:0};
  for(const item of test){const rows=C.encode(item,rules).rows;if(new Set(rows.map(r=>r.perk)).size<5)observed.repeat++;if(rows.some(r=>Math.abs(r.value)===(hall==='war'?6:11)))observed.topTier++;}
  results.push({hall,category,period,trainingArtifacts:model.artifacts,testArtifacts:test.length,observed,expected:{repeat:test.length*repeatProbability,topTier:test.length*top.probability}});
 }
}
const totals=results.reduce((a,r)=>{a.testArtifacts+=r.testArtifacts;for(const key of ['repeat','topTier']){a.observed[key]+=r.observed[key];a.expected[key]+=r.expected[key];}return a;},{testArtifacts:0,observed:{repeat:0,topTier:0},expected:{repeat:0,topTier:0}});
const report={checkedAt:new Date().toISOString(),method:'SHA-256 encounter-ID holdout, approximately 20%; pooled category perk frequencies and period-specific tiers fitted only on training artifacts.',limits:['Descriptive calibration, not proof of independence or verified game odds.','Repeated encounters can cross the ID split.','No adjustment for scanner selection, OCR bias or uncertainty in fitted probabilities.'],totals,results};
fs.mkdirSync('data/temp/crafting-probability-previews',{recursive:true});fs.writeFileSync('data/temp/crafting-probability-previews/calibration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.totals,null,2));
