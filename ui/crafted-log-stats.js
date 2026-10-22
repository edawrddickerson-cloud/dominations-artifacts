/* Statistics over the existing log's canonical best record per encounter.
 * No additional item store, confirmations, collection writes or uploads. */
(() => {
  'use strict';
  const finite=Number.isFinite;
  function interval(hits,total) {
    if(!total)return null;
    const z=1.959963984540054,p=hits/total,d=1+z*z/total,center=(p+z*z/(2*total))/d;
    const half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
    return [Math.max(0,center-half),Math.min(1,center+half)];
  }
  const rowUsable=(row,direct)=>!!row && !!row.name && (row.known || row.assumed) && finite(row.value) && row.hasPercent!==false && !row.conflict && !row.tierConflict &&
    (!direct || !row.assumed && !row.inferred);
  function analyze(records,filter={}) {
    // IDs come from the scanner collector. Never deduplicate identical stats:
    // independently crafted items with identical rolls remain separate.
    const unique=new Map();for(const item of records || [])if(item?.id)unique.set(item.id,item);
    const history=[...unique.values()].filter(item=>(!filter.hall || item.hall===filter.hall) && (!filter.category || item.type===filter.category) &&
      (!filter.profile || item.profileKey===filter.profile) && (!filter.source || (item.captureMethod || 'unknown')===filter.source));
    const sample=history.filter(item=>['main','war'].includes(item.hall) && !!item.type && item.rows?.length===(item.expectedRows || 5) &&
      item.rows.every(row=>rowUsable(row,filter.evidence==='direct')));
    const frequencies=new Map(),values=new Map();let hits=0,selectedRows=0;
    for(const item of sample) {
      const seen=new Set();let hit=false;
      for(const [index,row] of item.rows.entries()) {
        if(filter.position && index+1!==Number(filter.position))continue;
        let entry=frequencies.get(row.name);
        if(!entry){entry={name:row.name,items:0,rows:0,min:row.value,max:row.value};frequencies.set(row.name,entry);}
        entry.rows++;entry.min=Math.min(entry.min,row.value);entry.max=Math.max(entry.max,row.value);
        if(!seen.has(row.name)){entry.items++;seen.add(row.name);}
        if(row.name===filter.perk){selectedRows++;values.set(row.value,(values.get(row.value)||0)+1);if(filter.minimum==null || row.value>=filter.minimum)hit=true;}
      }
      if(hit)hits++;
    }
    const total=sample.length,rate=total?hits/total:null,bounds=interval(hits,total);
    const contexts=new Set(sample.map(item=>JSON.stringify([item.hall,item.type,item.craftingEventId || null])));
    const liveOnly=!!total && sample.every(item=>item.captureMethod==='live-capture'),homogeneous=contexts.size===1;
    const attempts=Number(filter.attempts);
    const projected=filter.perk && liveOnly && homogeneous && Number.isInteger(attempts) && attempts>=1 && attempts<=100000?
      {attempts,rate:1-Math.pow(1-rate,attempts),bounds:bounds.map(p=>1-Math.pow(1-p,attempts))}:null;
    return {history,sample,total,kept:history.filter(item=>item.keptId).length,excluded:history.length-total,
      inferred:sample.filter(item=>item.rows.some(row=>row.inferred || row.assumed)).length,
      frequencies:[...frequencies.values()].sort((a,b)=>b.items-a.items || a.name.localeCompare(b.name)),
      values:[...values].sort((a,b)=>a[0]-b[0]),selectedRows,hits,rate,bounds,homogeneous,liveOnly,projected};
  }
  window.DNCraftedLogStats={analyze,interval};
})();
