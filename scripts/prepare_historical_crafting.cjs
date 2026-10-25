/* Recover original encounter identities; never turn OCR retries into crafts.
 * Detailed recovery data remains private under data/temp. No network writes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),option=key=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3);
const downloads=option('downloads') || 'C:/Users/edwar/Downloads';
const scratch=path.join(root,'data/temp/historical-crafting');fs.mkdirSync(scratch,{recursive:true});
const app={window:{},TextEncoder};vm.createContext(app);
for(const f of ['data/artifact_stat_context','data/artwork_ids','crafting-history','crafted-log-stats','crafting-community','integration-core'])vm.runInContext(fs.readFileSync(path.join(root,'ui',f+'.js'),'utf8'),app);
const H=app.window.DNCraftingHistory,C=app.window.DNCraftingCommunity;
const rules=C.rules(),encode=item=>C.encode(item,rules);
const live=JSON.parse(fs.readFileSync(path.join(root,'data/temp/historical-crafting-live-snapshot.json'),'utf8'));
if(live.workspaces.length!==1)throw Error('Select an account explicitly when more than one workspace exists.');
const workspace=live.workspaces[0],current=H.normalize(workspace.data.craftingLog);
const cleanup=JSON.parse(fs.readFileSync(path.join(root,'reports/crafting-deduplication-2026-10-18.json'),'utf8'));
const removed=new Set(cleanup.bursts.flatMap(b=>b.removedIds));
const protectedIds=new Set([...current.items,...current.ledger.archived].map(i=>i.id));
// Evidence tombstones also dominate historical detail, even if absent privately.
for(const e of live.evidence)if(e.owner_id===workspace.owner_id && e.deleted)protectedIds.add(e.id);
const candidates=new Map(),sources=[],conflicts=[];
const signature=i=>JSON.stringify([i.hall,i.type,i.rows?.map(r=>[r.name,r.value])]);
for(const filename of fs.readdirSync(downloads).filter(n=>/^(artifact-perk-observations|dominations-).*\.json$/.test(n)).sort()){
  const raw=fs.readFileSync(path.join(downloads,filename)),data=JSON.parse(raw);
  let log=data.records?.find(r=>r.id==='crafting-log')?.value || data;
  if(typeof log==='string')log=JSON.parse(log);
  const source={filename,sha256:crypto.createHash('sha256').update(raw).digest('hex'),exportedAt:data.exportedAt,version:log.version,scans:log.scans?.length || 0,items:log.items?.length || 0};sources.push(source);
  if(log.version!==2 || !Array.isArray(log.items))continue;
  for(const item of log.items){
    if(!item.id || !Array.isArray(item.rows) || removed.has(item.id) || protectedIds.has(item.id))continue;
    const prior=candidates.get(item.id),rank=[item.revision || 0,item.lastUpdated || item.firstSeen || '',data.exportedAt || ''];
    if(prior && JSON.stringify(prior.rank.slice(0,2))===JSON.stringify(rank.slice(0,2)) && signature(prior.item)!==signature(item))conflicts.push(item.id);
    if(!prior || rank[0]>prior.rank[0] || rank[0]===prior.rank[0] && (rank[1]>prior.rank[1] || rank[1]===prior.rank[1] && rank[2]>prior.rank[2]))candidates.set(item.id,{item,rank,filename});
  }
}
const imported=[...candidates.values()].map(({item})=>({...item,...(conflicts.includes(item.id)?{reconciliationConflict:true}:{})})).sort((a,b)=>a.firstSeen.localeCompare(b.firstSeen)||a.id.localeCompare(b.id));
const projected=H.project({version:2,items:imported});
// Retain the existing Keep counter anchor. Historical records before its anchor
// are covered by the saved count; they must not inflate crafts since Keep.
const ledger=JSON.parse(JSON.stringify(current.ledger));
if(ledger.baseline?.counts.logged)throw Error('Undated baseline overlap requires explicit review.');
if(ledger.sinceBaseline){
  const covered=new Set(ledger.sinceBaseline.covered),anchor=current.items.filter(i=>covered.has(i.id)).map(i=>i.firstSeen).filter(Boolean).sort().at(-1);
  if(!anchor)throw Error('Cannot establish existing Keep-counter anchor.');
  for(const i of projected.items)if(i.firstSeen<=anchor)covered.add(i.id);
  ledger.sinceBaseline.covered=[...covered].sort();
  ledger.sinceBaseline.id=H.canonical({covered:ledger.sinceBaseline.covered,savedSince:ledger.sinceBaseline.value});
}
const merged={version:2,ledger,items:[...current.items,...projected.items].sort((a,b)=>a.firstSeen.localeCompare(b.firstSeen)||a.id.localeCompare(b.id))};
H.validate(merged);assert.equal(new Set(merged.items.map(i=>i.id)).size,merged.items.length);
for(const i of current.items)assert.deepEqual(merged.items.find(j=>j.id===i.id),i);
const before=H.totals(current),after=H.totals(merged);
assert.equal(after.logged-before.logged,imported.length);
const evidence=projected.items.map(encode);
const metric=items=>{
  const a=C.analyze(items.map(encode),{hall:'main'},rules);
  return {recorded:a.recorded,eligible:a.eligibleArtifacts,exclusions:a.exclusions,rows11:a.metrics.rows11,any11:a.metrics.any11,two11:a.metrics.two11};
};
const days=[...new Set(merged.items.map(i=>i.firstSeen.slice(0,10)))].sort();
const daily=days.map(day=>({day,...metric(merged.items.filter(i=>i.firstSeen.startsWith(day)))}));
const eligible=merged.items.filter(i=>i.hall==='main'&&!encode(i).exclusion).map(i=>({...i,hit:i.rows.some(r=>Math.abs(r.value)===11)}));
const logLike=(hits,n)=>!n?0:(hits?hits*Math.log(hits/n):0)+(n-hits?(n-hits)*Math.log(1-hits/n):0);
const totalHits=eligible.filter(i=>i.hit).length;let hits=0,best=null;
for(let i=0;i<eligible.length-1;i++){
  hits+=Number(eligible[i].hit);const left=i+1,right=eligible.length-left;if(left<50||right<50)continue;
  const score=logLike(hits,left)+logLike(totalHits-hits,right);
  if(!best||score>best.score)best={score,left,right,leftHits:hits,rightHits:totalHits-hits,after:eligible[i].firstSeen,before:eligible[i+1].firstSeen};
}
const periods=[['through-18',i=>i.firstSeen<'2026-10-19'],['from-20',i=>i.firstSeen>='2026-10-20']].map(([name,accept])=>{
  const items=merged.items.filter(accept),seen=new Set();
  const unique=items.filter(i=>{const key=signature(i);if(seen.has(key))return false;seen.add(key);return true;});
  return {name,...metric(items),direct:metric(items.filter(i=>i.rows.every(r=>!r.assumed&&!r.inferred))),uniqueRollsSensitivity:metric(unique),byCategory:Object.fromEntries(['Weapon','Armor','Jewelry','Pottery'].map(type=>[type,metric(items.filter(i=>i.type===type))]))};
});
const contribution=C.analyze(evidence,{},rules),newWorkspace={...workspace.data,craftingLog:merged};
assert(Buffer.byteLength(JSON.stringify(newWorkspace))<16777216);
app.window.DNIntegrationCore.validate(newWorkspace);
const plan={version:1,createdAt:new Date().toISOString(),owner:workspace.owner_id,expectedRevision:workspace.revision,operationId:crypto.randomUUID(),sources,knownDuplicateIdsOmitted:removed.size,conflictingIds:[...new Set(conflicts)],before,after,added:imported.length,contribution:{recorded:contribution.recorded,eligible:contribution.eligibleArtifacts,excluded:contribution.excluded,exclusions:contribution.exclusions},daily,periods,changePoint:best,limits:['11–12 October exports contain OCR scans, not encounter records.','Missing categories are retained privately and excluded from community eligible samples.','Previously reviewed duplicate IDs remain omitted; no new heuristic encounter deduplication is applied.','OCR, inference and repeated physical encounters can bias empirical rates.','An inferred change window is not a verified event boundary; event IDs remain unknown.'],workspace:newWorkspace,evidence};
fs.writeFileSync(path.join(scratch,'plan.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(scratch,'recovered-log.json'),JSON.stringify({kind:'unverified-artifact-perk-observations',exportedAt:new Date().toISOString(),...merged},null,2)+'\n');
const {workspace:privateWorkspace,evidence:privateEvidence,owner,...report}=plan;
fs.writeFileSync(path.join(scratch,'analysis.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({added:plan.added,before,after,contribution:plan.contribution,daily:daily.map(d=>({day:d.day,eligible:d.eligible,hits:d.rows11.hits,rows:d.rows11.total,rate:d.rows11.rate})),changePoint:best,periods:periods.map(p=>({name:p.name,eligible:p.eligible,rows11:p.rows11,any11:p.any11}))},null,2));
