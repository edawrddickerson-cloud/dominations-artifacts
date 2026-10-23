/* Opt-in structured evidence derived from the canonical log. No images,
 * raw OCR, profile names, account names or inventory decisions. */
(() => {
  'use strict';
  const POLICY='2026-10-23',RULES='ordinary-starts-2026-10-23';
  const normal=value=>String(value || '').trim().toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ');
  function rules(data=window.DN_ARTIFACT_STAT_CONTEXT) {
    const index=new Map();if(!data)return index;
    for(const [perk,stat] of Object.entries(data.stats)) {
      if(stat.unit!=='percent' || ![-1,1].includes(stat.expected_sign))continue;
      for(const hall of ['main','war']) {
        if(!['confirmed','approved','observed-reviewed'].includes(stat.ordinary_availability?.[hall]?.status))continue;
        const starts=Object.values(data.tier_profiles[hall].tiers).map(value=>stat.expected_sign*value);
        for(const category of data.rules.ordinary_categories[hall])for(const alias of [perk,...stat.aliases])index.set([hall,normal(category),normal(alias)].join('|'),{perk,starts});
      }
    }
    return index;
  }
  function encode(item,index=rules()) {
    const category=normal(item.type).replace(/^war /,''),hall=item.hall || 'unknown';
    let exclusion=item.archived?'archived':item.reconciliationConflict?'conflict':item.captureMethod!=='live-capture' || item.identityEvidence!=='observed-transition'?'identity':
      item.freshCraft!==true || item.startingContextSource!=='craft-result-controls-v1'?'starting-unknown':item.rows?.length!==5?'incomplete':null;
    const rows=[];
    if(!exclusion)for(const row of item.rows) {
      const rule=index.get([hall,category,normal(row.name)].join('|'));
      if(row.level!==1){exclusion='upgraded';break;}
      if(!row.known || row.assumed || row.inferred || row.conflict || row.tierConflict || row.outOfRange || row.hasPercent===false || !Number.isFinite(row.value)){exclusion='uncertain';break;}
      if(!rule || !rule.starts.includes(row.value)){exclusion='range';break;}
      rows.push({perk:rule.perk,value:row.value});
    }
    return {id:item.id,revision:item.revision || 0,writer:item.writer || '',deleted:!!item.archived,observed_at:item.firstSeen || null,hall,category,
      event_id:item.craftingEventSource==='dataset'?item.craftingEventId || null:null,
      game_version:item.gameVersionSource==='dataset'?item.gameVersion || null:null,
      exclusion,rows:exclusion?[]:rows};
  }
  function payload(log) {
    const value=window.DNCraftingHistory.normalize(log),index=rules();
    return {version:2,policy:POLICY,rules:RULES,records:[...value.items,...value.ledger.archived.map(i=>({...i,archived:true}))].map(i=>encode(i,index))};
  }
  function interval(hits,total) {
    if(!total)return null;
    const z=1.959963984540054,p=hits/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
    return [Math.max(0,c-h),Math.min(1,c+h)];
  }
  function analyze(records,filter={},index=rules()) {
    const unique=new Map();for(const record of records || [])unique.set(record.id,record);
    const sample=[...unique.values()].filter(i=>!i.deleted && ['hall','category','event_id','game_version'].every(key=>!filter[key] || (i[key] || 'unknown')===filter[key]));
    const counts={recorded:sample.length,excluded:0,eligibleArtifacts:0,eligibleRows:0,elevenRows:0,elevenArtifacts:0,twoElevenArtifacts:0,duplicateArtifacts:0,duplicateEligible:0},exclusions={};
    for(const item of sample) {
      if(item.exclusion){counts.excluded++;exclusions[item.exclusion]=(exclusions[item.exclusion] || 0)+1;continue;}
      const checked=item.rows.map(row=>({row,rule:index.get([item.hall,normal(item.category),normal(row.perk)].join('|'))}));
      if(checked.length!==5 || checked.some(({row,rule})=>!rule || !rule.starts.includes(row.value))){counts.excluded++;exclusions.range=(exclusions.range || 0)+1;continue;}
      counts.duplicateEligible++;
      if(new Set(checked.map(({rule})=>rule.perk)).size<5)counts.duplicateArtifacts++;
      const eligible=checked.filter(({rule})=>rule.starts.some(v=>Math.abs(v)===11));
      const hits=eligible.filter(({row})=>Math.abs(row.value)===11).length;
      counts.eligibleRows+=eligible.length;counts.elevenRows+=hits;
      if(eligible.length){counts.eligibleArtifacts++;if(hits)counts.elevenArtifacts++;if(hits>=2)counts.twoElevenArtifacts++;}
    }
    const metric=(hits,total)=>({hits,total,rate:total?hits/total:null,bounds:interval(hits,total)});
    return {...counts,exclusions,metrics:{rows11:metric(counts.elevenRows,counts.eligibleRows),any11:metric(counts.elevenArtifacts,counts.eligibleArtifacts),two11:metric(counts.twoElevenArtifacts,counts.eligibleArtifacts),duplicate:metric(counts.duplicateArtifacts,counts.duplicateEligible)}};
  }
  window.DNCraftingCommunity={POLICY,RULES,rules,encode,payload,analyze,interval};
})();
