const assert=require('node:assert/strict');
const {harness,parsed,flush}=require('./test_scanner_reading.js');
async function main(){
  const h=await harness(),{reader,e,jobs}=h,frame=h.canvas();
  const strong={...parsed(),hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon'},rows:parsed().rows.map(row=>({...row,confidence:94,hasPercent:true}))};
  const weak={...strong,valid:false,rows:strong.rows.map((row,i)=>i===2?{name:'',value:null,known:false,hasPercent:false}:{...row,confidence:45})};
  reader.update(frame,{session:1,current:true});e.read.fire('click');jobs.at(-1).resolve(strong);await flush();
  const names=()=>h.comparisons.at(-1)?.result?.rows.map(row=>row.name);
  reader.invalidate('Automatic panel movement',{preserveDisplay:true});reader.update(frame,{session:1,current:true});
  e.read.fire('click');jobs.at(-1).resolve(weak);await flush();
  assert.equal(JSON.stringify(names()),JSON.stringify(strong.rows.map(row=>row.name)),'panel movement cannot erase accepted names on a weaker reread');
  assert.equal(h.comparisons.at(-1).result.rows[2].value,10,'accepted percentage stays present');
  e.read.fire('click');const stale=jobs.at(-1);reader.invalidate('Field geometry refresh',{preserveDisplay:true});stale.resolve(weak);await flush();
  reader.update(frame,{session:1,current:true});e.read.fire('click');jobs.at(-1).resolve(weak);await flush();
  assert.equal(JSON.stringify(names()),JSON.stringify(strong.rows.map(row=>row.name)),'stale in-flight work and later retries cannot clear the held candidate');
  const conflictingMetadata={...weak,hall:'war',hallSource:'selected-hall',artifact:{type:'Armor'}};
  e.read.fire('click');jobs.at(-1).resolve(conflictingMetadata);await flush();
  assert.equal(h.comparisons.at(-1).result.rows[2].value,10,'weak category/Hall metadata does not reset same-encounter stats');
  assert.equal(e.hall.value,'main','weak Hall metadata cannot switch the accepted scoring context');
  frame.pixel=240;reader.update(frame,{session:1,current:true});const beforeNew=jobs.length;e.read.fire('click');
  assert.equal(jobs.length,beforeNew+1,'new artifact starts a fresh OCR job');jobs.at(-1).resolve(weak);await flush();
  assert.equal(h.batches.at(-1).result.rows[2].value,null,'a genuinely new artifact starts with fresh evidence');
  h.DN.setActiveProfile(h.DN.addProfile('Retention context'));
  e.read.fire('click');jobs.at(-1).resolve({valid:false,warnings:[],rows:[]});await flush();
  assert.equal(h.comparisons.at(-1).result,null,'old-profile evidence cannot populate a new profile read');
  reader.reset();console.log('Scanner retention: geometry refresh, weak retries, stale jobs, metadata, new artifacts and profile isolation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
