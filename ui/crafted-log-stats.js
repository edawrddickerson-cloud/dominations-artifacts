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
  function distributions(items) {
    const frequencies=new Map(),eleven=[],duplicates=[];
    for(const item of items){
      const perks=new Map();let hits=0;
      for(const row of item.rows){
        const name=row.name || row.perk;
        let entry=frequencies.get(name);
        if(!entry){entry={name,items:0,rows:0,values:new Map()};frequencies.set(name,entry);}
        entry.rows++;entry.values.set(row.value,(entry.values.get(row.value)||0)+1);
        perks.set(name,(perks.get(name)||0)+1);if(Math.abs(row.value)===11)hits++;
      }
      for(const name of perks.keys())frequencies.get(name).items++;
      duplicates.push(Math.max(0,...perks.values()));
      if(item.elevenEligible ?? item.hall==='main')eleven.push(hits);
    }
    const metric=(hits,total)=>({hits,total,rate:total?hits/total:null,bounds:interval(hits,total)});
    const bins=(values,start)=>Array.from({length:6-start},(_,i)=>{const count=i+start;return {count,exact:metric(values.filter(n=>n===count).length,values.length),atLeast:metric(values.filter(n=>n>=count).length,values.length)};});
    return {frequencies:[...frequencies.values()].map(entry=>({...entry,values:[...entry.values].sort((a,b)=>a[0]-b[0]).map(([value,count])=>({value,count,rate:count/entry.rows}))})).sort((a,b)=>b.items-a.items || a.name.localeCompare(b.name)),
      distributions:{eleven:bins(eleven,0),duplicates:bins(duplicates,2)}};
  }
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
        if(!entry){entry={name:row.name,items:0,rows:0,min:row.value,max:row.value,values:new Map()};frequencies.set(row.name,entry);}
        entry.rows++;entry.min=Math.min(entry.min,row.value);entry.max=Math.max(entry.max,row.value);
        entry.values.set(row.value,(entry.values.get(row.value)||0)+1);
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
      frequencies:[...frequencies.values()].map(entry=>({...entry,values:[...entry.values].sort((a,b)=>a[0]-b[0]).map(([value,count])=>({value,count,rate:count/entry.rows}))})).sort((a,b)=>b.items-a.items || a.name.localeCompare(b.name)),
      distributions:distributions(sample).distributions,
      values:[...values].sort((a,b)=>a[0]-b[0]),selectedRows,hits,rate,bounds,homogeneous,liveOnly,projected};
  }
  window.DNCraftedLogStats={analyze,interval,distributions};
})();
