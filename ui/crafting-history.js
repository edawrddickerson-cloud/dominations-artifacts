/* Canonical log reconciliation. This is a projection of scanner-collection,
 * never an independent item store. Cleared records retain only counter facts. */
(() => {
  'use strict';
  const keys=['logged','kept','main','war','threeUnlocked'];
  const copy=value=>JSON.parse(JSON.stringify(value));
  const empty=()=>Object.fromEntries(keys.map(key=>[key,0]));
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value && typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
  const validCounts=v=>v && keys.every(k=>Number.isSafeInteger(v[k]) && v[k]>=0) && v.kept<=v.logged && v.main+v.war<=v.logged && v.threeUnlocked<=v.logged;
  function normalize(log) {
    if(!log)return {version:2,items:[],ledger:{version:1,baseline:null,archived:[]}};
    if(log.version!==2 || log.items!=null && !Array.isArray(log.items))throw Error('Unsupported crafting history.');
    const value=copy(log);
    value.items=value.items || [];
    if(!value.ledger) {
      const counts=value.lifetimeStatistics?.archived;
      if(counts && !validCounts(counts))throw Error('Invalid archived crafting totals.');
      // Exact legacy snapshots share an identity when restored on another device.
      // Different snapshots are ambiguous and require choosing an authoritative
      // backup; never assume that their missing historical crafts are disjoint.
      const savedSince=value.lifetimeStatistics?.sinceLastKept;
      const baselineSince=Number.isSafeInteger(savedSince)?Math.max(0,savedSince-value.items.filter(i=>!i.keptId).length):counts?.kept?0:counts?.logged || 0;
      const baseline=counts?.logged?{id:'legacy:'+canonical({counts,ids:value.items.map(i=>i.id).sort()}),counts:copy(counts),sinceLastKept:baselineSince}:null;
      const covered=value.items.map(i=>i.id).sort();
      const sinceBaseline=Number.isSafeInteger(savedSince) && savedSince>=0?{id:canonical({covered,savedSince}),value:savedSince,covered}:null;
      value.ledger={version:1,baseline,sinceBaseline,archived:[]};
    }
    validate(value);
    return value;
  }
  function validate(log) {
    const ledger=log.ledger;
    if(log.version!==2 || !Array.isArray(log.items) || ledger?.version!==1 || !Array.isArray(ledger.archived) || ledger.baseline && (typeof ledger.baseline.id!=='string' || !validCounts(ledger.baseline.counts) || !Number.isSafeInteger(ledger.baseline.sinceLastKept) || ledger.baseline.sinceLastKept<0))throw Error('Invalid crafting ledger.');
    if(ledger.sinceBaseline && (!Number.isSafeInteger(ledger.sinceBaseline.value) || ledger.sinceBaseline.value<0 || !Array.isArray(ledger.sinceBaseline.covered) || ledger.sinceBaseline.covered.some(id=>typeof id!=='string')))throw Error('Invalid Keep baseline.');
    const ids=new Set();
    for(const [visible,list] of [[true,log.items],[false,ledger.archived]])for(const item of list) {
      if(typeof item.id!=='string' || !item.id || ids.has(item.id) || item.revision!=null && (!Number.isSafeInteger(item.revision) || item.revision<0))throw Error('Invalid crafting record identity.');
      ids.add(item.id);
      if(visible && !Array.isArray(item.rows))throw Error('Invalid crafting rows.');
      if(item.artworkId!=null && !window.DNArtworkIds?.includes(item.artworkId))throw Error('Invalid artwork reference.');
    }
    return log;
  }
  const facts=item=>({id:item.id,firstSeen:item.firstSeen || null,lastUpdated:item.lastUpdated || null,revision:item.revision || 0,writer:item.writer || '',
    hall:item.hall || null,keptId:item.keptId || null,keptAt:item.keptAt || null,unlockedCount:item.unlockedCount ?? item.unlocked?.count ?? null});
  function totals(log,now=new Date()) {
    log=normalize(log);
    const counts=log.ledger.baseline?copy(log.ledger.baseline.counts):empty();
    const records=[...log.items,...log.ledger.archived].map(facts);
    const start=new Date(now);start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
    let weekly=0,unknownDates=0;
    for(const item of records) {
      counts.logged++;if(item.keptId)counts.kept++;
      if(['main','war'].includes(item.hall))counts[item.hall]++;
      if(item.unlockedCount===3)counts.threeUnlocked++;
      const at=Date.parse(item.firstSeen);
      if(!Number.isFinite(at))unknownDates++;else if(at>=start.getTime() && at<=now.getTime())weekly++;
    }
    const keeps=records.filter(i=>i.keptId && Number.isFinite(Date.parse(i.keptAt))).map(i=>i.keptAt).sort();
    const last=keeps.at(-1);
    const covered=new Set(log.ledger.sinceBaseline?.covered || []);
    const sinceLastKept=last?records.filter(i=>Date.parse(i.firstSeen)>Date.parse(last)).length:log.ledger.sinceBaseline?
      log.ledger.sinceBaseline.value+records.filter(i=>!covered.has(i.id)).length:(log.ledger.baseline?.sinceLastKept || 0)+records.filter(i=>!i.keptId).length;
    return {...counts,weekly,unknownDates,legacy:log.ledger.baseline?.counts.logged || 0,sinceLastKept};
  }
  function reconcile(left,right,{baselineChoice}={}) {
    const a=project(normalize(left)),b=project(normalize(right)),ab=a.ledger.baseline,bb=b.ledger.baseline;
    let baseline=ab || bb;
    let sinceBaseline=a.ledger.sinceBaseline || b.ledger.sinceBaseline || null;
    if(a.ledger.sinceBaseline && b.ledger.sinceBaseline && a.ledger.sinceBaseline.id!==b.ledger.sinceBaseline.id) {
      if(!baselineChoice)throw Object.assign(Error('Keep counters overlap. Choose a saved version.'),{code:'LEGACY_BASELINE'});
      sinceBaseline=baselineChoice==='local'?a.ledger.sinceBaseline:b.ledger.sinceBaseline;
    }
    if(ab && bb && ab.id!==bb.id) {
      if(!baselineChoice)throw Object.assign(Error('Archived totals overlap. Choose a saved version.'),{code:'LEGACY_BASELINE'});
      baseline=baselineChoice==='local'?ab:bb;
    }
    const entries=new Map();
    for(const log of [a,b])for(const [archived,list] of [[false,log.items],[true,log.ledger.archived]])for(const value of list) {
      const item=archived?{...facts(value),archived:true}:copy(value),prior=entries.get(item.id);
      if(!prior){entries.set(item.id,item);continue;}
      const rank=i=>[String(i.revision || 0).padStart(16,'0'),i.writer || '',canonical(i)].join(':');
      let next=rank(item)>rank(prior)?item:prior;
      if(prior.keptId || item.keptId)next={...next,keptId:[prior.keptId,item.keptId].filter(Boolean).sort()[0],keptAt:[prior.keptAt,item.keptAt].filter(Boolean).sort()[0] || null};
      if(prior.archived || item.archived)next={...facts(next),archived:true};
      else if((item.revision || 0)===(prior.revision || 0) && canonical(item)!==canonical(prior))next={...next,reconciliationConflict:true};
      entries.set(item.id,next);
    }
    const all=[...entries.values()].sort((x,y)=>(x.firstSeen || '').localeCompare(y.firstSeen || '') || x.id.localeCompare(y.id));
    const result={version:2,items:all.filter(i=>!i.archived),ledger:{version:1,baseline,sinceBaseline,archived:all.filter(i=>i.archived).map(facts)}};
    const t=totals(result);result.lifetimeStatistics={version:1,archived:archivedTotals(result),totals:Object.fromEntries(keys.map(k=>[k,t[k]])),sinceLastKept:t.sinceLastKept};
    return result;
  }
  function archivedTotals(log) {
    const counts=log.ledger.baseline?copy(log.ledger.baseline.counts):empty();
    for(const item of log.ledger.archived){counts.logged++;if(item.keptId)counts.kept++;if(['main','war'].includes(item.hall))counts[item.hall]++;if(item.unlockedCount===3)counts.threeUnlocked++;}
    return counts;
  }
  const rowKeys=['name','known','value','hasPercent','level','levelSource','tier','tierSource','colour','base','max','rangeSource','assumed','inferred','conflict','tierConflict','outOfRange','nameSource','valueSource','unlocked','rerollEligible','rerollSource'];
  function project(log) {
    const value=normalize(log);
    const baseline=value.ledger.baseline;
    const since=value.ledger.sinceBaseline;
    const ledger={version:1,baseline:baseline?{id:baseline.id,counts:Object.fromEntries(keys.map(k=>[k,baseline.counts[k]])),sinceLastKept:baseline.sinceLastKept}:null,sinceBaseline:since?{id:since.id,value:since.value,covered:since.covered.slice()}:null,archived:value.ledger.archived.map(facts)};
    return {version:2,ledger,items:value.items.map(i=>({...facts(i),captureMethod:i.captureMethod || 'unknown',expectedRows:i.expectedRows || 5,
      captureSessionId:i.captureSessionId || null,encounterId:i.encounterId || null,profileKey:i.profileKey || null,type:i.type || null,name:i.name || null,nameSource:i.nameSource || null,hallSource:i.hallSource || null,
      ...(i.artworkId?{artworkId:i.artworkId}:{}),
      validated:!!i.validated,corrected:!!i.corrected,freshCraft:i.freshCraft===true,identityEvidence:i.identityEvidence || 'unknown',reconciliationConflict:!!i.reconciliationConflict,
      startingContextSource:i.startingContextSource || 'unknown',
      craftingEventId:i.craftingEventId || null,craftingEventSource:i.craftingEventSource || 'unknown',gameVersion:i.gameVersion || null,gameVersionSource:i.gameVersionSource || 'unknown',
      unlocked:i.unlocked?{count:i.unlocked.count}:null,keepId:i.keepId || 'craft-log-'+i.id,
      rows:i.rows.map(row=>Object.fromEntries(rowKeys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])))}))};
  }
  function preserveLocalDetails(log,local) {
    const previous=new Map((local?.items || []).map(item=>[item.id,item]));
    for(const item of log.items) {
      const prior=previous.get(item.id);if(!prior)continue;
      if(prior.image)item.image=prior.image;
      if(prior.ocrEvidence)item.ocrEvidence=copy(prior.ocrEvidence);
      if(prior.scannerSource)item.scannerSource=prior.scannerSource;
      if(prior.name===item.name && prior.nameEvidence)item.nameEvidence=copy(prior.nameEvidence);
      item.rows=item.rows.map((row,index)=>{
        const old=prior.rows[index];
        const projected=old && Object.fromEntries(rowKeys.filter(k=>old[k]!==undefined).map(k=>[k,old[k]]));
        return canonical(projected)===canonical(row)?copy(old):row;
      });
    }
    return log;
  }
  window.DNCraftingHistory={keys,normalize,validate,facts,totals,reconcile,archivedTotals,project,preserveLocalDetails,canonical};
})();
