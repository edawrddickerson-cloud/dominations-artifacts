/* Read-only stat constraints and observation audit. Context can disambiguate
 * candidates, but never rewrites raw OCR, invents a captured sign, learns a rule
 * from repetition, or applies ordinary tiers to Legendary/Mythical items. */
((root,factory)=>{
  if(typeof module==='object' && module.exports)module.exports={create:factory};
  else root.DNArtifactStatContext=factory(root.DN_ARTIFACT_STAT_CONTEXT);
})(typeof window==='object'?window:globalThis,data=>{
  'use strict';
  const normalize=value=>String(value || '').trim().toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ');
  const index=new Map();
  for(const [name,stat] of Object.entries(data.stats))for(const alias of [name,...stat.aliases]){
    const key=normalize(alias),prior=index.get(key);if(prior && prior.name!==name)throw new Error('Ambiguous stat alias: '+alias);index.set(key,{name,...stat});
  }
  const lookup=name=>index.get(normalize(name)) || null;
  function tierBases({hall,type,crafting=false}={}){
    hall=normalize(hall);type=normalize(type);
    if(!['main','war'].includes(hall) || /legendary|mythical/.test(type))return null;
    if(/^war /.test(type))hall='war';type=type.replace(/^war /,'');
    if(!data.rules.ordinary_categories[hall].includes(type) && !(crafting && !type))return null;
    return ['white','green','blue'].map(tier=>data.tier_profiles[hall].tiers[tier]);
  }
  function assess(row,context={}){
    const stat=row?.known===false || row?.assumed?null:lookup(row?.name),declaredHall=normalize(context.hall),warType=/^war /i.test(String(context.type || '').trim()),hall=warType?'war':declaredHall,profile=data.tier_profiles[hall];
    const expectedSign=stat?.expected_sign ?? null,issues=[],fresh=context.freshCraft===true;
    const bases=tierBases({...context,crafting:fresh});let legalValues=null,expectedValue=null;
    const tier=fresh?(row?.tierSource==='starting-percentage'?row.tier:({neutral:'white',white:'white',green:'green',blue:'blue'}[row?.colour] || null)):
      ['manual','percentage-level','unique-percentage'].includes(row?.tierSource)?row.tier:null;
    // Unknown levels keep every level possible. Stored text colour supplies none.
    const locked=row?.unlocked===false;
    const trustedLevel=locked || ['ocr','manual','crafting','locked-star','recorded'].includes(row?.levelSource);
    const level=fresh || locked?1:trustedLevel && Number.isInteger(row?.level) && row.level>=1 && row.level<=10?row.level:null;
    if(warType && declaredHall==='main')issues.push('hall-category');
    if(bases && !fresh && !locked && trustedLevel && row.level!=null && level===null)issues.push('upgrade-level');
    if(stat && profile && bases && expectedSign && !issues.length){
      const starts=tier && profile.tiers[tier]!=null?[profile.tiers[tier]]:bases;
      const levels=level?[level]:Array.from({length:10},(_,i)=>i+1);
      legalValues=[...new Set(starts.flatMap(base=>levels.map(value=>expectedSign*(base+value-1))))].sort((a,b)=>a-b);
      if(legalValues.length===1)expectedValue=legalValues[0];
    }
    const numeric=Number.isFinite(row?.value);
    if(numeric && expectedSign && Math.sign(row.value)!==expectedSign)issues.push('fixed-sign');
    if(numeric && legalValues && !legalValues.includes(row.value))issues.push('tier-level');
    return {version:data.schema_version,knownStat:!!stat,expectedSign,
      ordinaryAvailability:stat?.ordinary_availability[hall]?.status || 'unknown',
      scope:bases?fresh?'ordinary-crafting':'ordinary-storage':/legendary|mythical/i.test(context.type || '')?'named-artifact':'unknown',
      tier,level,legalValues,expectedValue,issues,status:issues.length?'conflict':!stat?'unknown':!numeric?'incomplete':'compatible'};
  }
  function resolveCandidates(row,candidates,context={}){
    const checked=candidates.map(candidate=>({...candidate,context:assess({...row,value:candidate.value},context)}));
    const supported=checked.filter(candidate=>Number.isFinite(candidate.value) && candidate.context.knownStat && candidate.context.expectedSign && !candidate.context.issues.length);
    const values=[...new Set(supported.map(candidate=>candidate.value))];
    return {status:values.length===1?'resolved':values.length>1?'ambiguous':'unresolved',value:values.length===1?values[0]:null,
      expectedValue:assess(row,context).expectedValue,source:'stat-context',direct:false,
      candidates:checked.map(({context,...candidate})=>({...candidate,status:context.status,issues:context.issues}))};
  }
  function annotate(result,{freshCraft=false}={}){
    if(!result?.rows)return result;
    const context={hall:result.hall || result.artifact?.hall,type:result.artifact?.type || result.type,freshCraft};
    return {...result,rows:result.rows.map((row,index)=>{
      const candidates=[];
      for(const observation of result.observations || [])for(const read of observation.fieldReads?.[index] || []){
        const text=read.percentage?.text,match=/^([+-]\s*\d+(?:[.,]\d+)?)\s*%$/.exec(text || '');
        if(match)candidates.push({value:Number(match[1].replace(/\s/g,'').replace(',','.')),source:read.pass,confidence:read.percentage.confidence});
      }
      const evidence=assess(row,context);
      if(candidates.length && (new Set(candidates.map(candidate=>candidate.value)).size>1 || evidence.status!=='compatible' || row.conflict || row.tierConflict || row.confidence<80))evidence.candidateResolution=resolveCandidates(row,candidates,context);
      return {...row,statContext:evidence};
    })};
  }
  function summarizeObservations(input){
    const stats=new Map(),unknown=new Set();let rowObservations=0,signConflicts=0,tierConflicts=0,inferred=0,corrected=0,numericRowsWithTierContext=0,numericRowsWithoutTierContext=0;
    const add=(row,context,manual=false)=>{
      rowObservations++;const stat=lookup(row?.name);
      if(!stat){if(row?.name)unknown.add(row.name);return;}
      const key=JSON.stringify([stat.name,context.hall || null]);
      if(!stats.has(key))stats.set(key,{name:stat.name,hall:context.hall || null,rows:0,values:[],inferred:0,corrected:0,signConflicts:0,tierConflicts:0});
      const entry=stats.get(key);entry.rows++;
      if(Number.isFinite(row.value) && !entry.values.includes(row.value))entry.values.push(row.value);
      if(row.inferred || row.inferredFields?.includes('value')){inferred++;entry.inferred++;}
      if(manual){corrected++;entry.corrected++;}
      const evidence=assess(row,context);
      if(Number.isFinite(row.value)){if(evidence.legalValues)numericRowsWithTierContext++;else numericRowsWithoutTierContext++;}
      if(evidence.issues.includes('fixed-sign')){signConflicts++;entry.signConflicts++;}
      if(evidence.issues.includes('tier-level')){tierConflicts++;entry.tierConflicts++;}
    };
    const scans=Array.isArray(input?.scans)?input.scans:[],items=Array.isArray(input?.items)?input.items:[];
    for(const scan of scans)for(const observation of scan.observations || [])for(const row of observation.rows || [])add(row,{hall:scan.hall,type:scan.type,freshCraft:scan.freshCraft===true});
    // Scans and final items overlap. Include items separately only for manual
    // corrections, or when this is an inventory with no diagnostic scan history.
    for(const item of items)if(!scans.length || item.corrected)for(const row of item.rows || [])add(row,{hall:item.hall,type:item.type,freshCraft:item.freshCraft===true},!!item.corrected);
    return {authority:'Unverified local observations; repetition is not a confirmed stat rule.',
      scope:scans.length?'ocr-passes-and-reviewed-item-records':'item-records',
      counts:{scans:scans.length,items:items.length,rowObservations,knownNameHallPairs:stats.size,unknownNames:unknown.size,inferred,corrected,signConflicts,tierConflicts,numericRowsWithTierContext,numericRowsWithoutTierContext},
      stats:[...stats.values()].map(stat=>({...stat,values:stat.values.sort((a,b)=>a-b)})).sort((a,b)=>a.name.localeCompare(b.name)||String(a.hall).localeCompare(String(b.hall))),unknownNames:[...unknown].sort(),
      ...(scans.length && items.length?{itemRecords:summarizeObservations({items})}:{})};
  }
  async function browserEvidence({storage=globalThis.localStorage,databases=globalThis.indexedDB,collector}={}){
    const errors=[];let log=null,inventory=[];
    try{log=JSON.parse(storage?.getItem('dn-crafting-scanner-log-v2') || 'null');}catch{errors.push('Saved crafting observations could not be read.');}
    if(collector){
      const current=collector.exportData(),scans=new Map(),items=new Map();
      for(const source of [log,current]){
        for(const scan of source?.scans || [])scans.set(JSON.stringify(scan),scan);
        for(const item of source?.items || [])items.set(item.id || Symbol(),item);
      }
      log={scans:[...scans.values()],items:[...items.values()]};
    }
    if(databases)try{
      if(!databases.databases || (await databases.databases()).some(db=>db.name==='dn-stored-artifacts'))inventory=await new Promise((resolve,reject)=>{
        let cancelled=false;
        const fail=()=>{cancelled=true;clearTimeout(timer);reject(new Error('Inventory unavailable'));};
        const timer=setTimeout(fail,5000);let request;
        try{request=databases.open('dn-stored-artifacts');}catch{fail();return;}
        request.onupgradeneeded=()=>request.transaction.abort(); // Never create/migrate a database for an audit.
        request.onerror=request.onblocked=fail;
        request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(cancelled){db.close();return;}if(!db.objectStoreNames.contains('inventory')){db.close();resolve([]);return;}
          let transaction,read;
          try{transaction=db.transaction('inventory','readonly');read=transaction.objectStore('inventory').getAll();}catch{db.close();reject(new Error('Inventory unavailable'));return;}
          transaction.oncomplete=()=>{db.close();resolve(read.result.flatMap(record=>record.items || []));};
          transaction.onabort=transaction.onerror=()=>{db.close();reject(new Error('Inventory unavailable'));};
        };
      });
    }catch{errors.push('Saved owned inventory could not be read.');}
    return {crafting:summarizeObservations(log),owned:summarizeObservations({items:inventory}),errors};
  }
  return {version:1,lookup,tierBases,assess,resolveCandidates,annotate,summarizeObservations,browserEvidence};
});
