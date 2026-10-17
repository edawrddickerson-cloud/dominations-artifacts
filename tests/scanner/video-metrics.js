/* Independent video-label comparison. Shared by browser replay and Node checks.
 * Never use catalogue matching, numeric inference, or OCR output as gold labels. */
(() => {
 'use strict';
 const normalize=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function compare(label,result){
  const rows=result?.presentation?.rows || result?.rows || [];
  const fields=label.rows.map(([name,value,level],i)=>{
   const row=rows[i] || {},star=row.unlocked ?? result?.unlocked?.states?.[i] ?? null,expectedStar=label.stars?label.stars[i]:i<label.unlocked;
   return {row:i+1,name:normalize(row.name)===normalize(name),value:row.value===value,
    directName:normalize(row.name)===normalize(name) && !!row.known && !row.assumed && !(row.inferredFields || []).includes('name'),
    directValue:row.value===value && !row.inferred && !(row.inferredFields || []).includes('value'),
    star:expectedStar==null?null:star===expectedStar,...(label.mode==='storage'?{level:level==null?null:row.level===level,levelSource:row.levelSource ?? null,dice:row.rerollEligible===label.dice}:{})};
  });
  const category=result?.artifact?.type===label.category,hall=(result?.hall || result?.artifact?.hall)===label.hall,title=label.mode==='storage'?normalize(result?.artifact?.name)===normalize(label.title):null;
  const statsExact=rows.length===label.rows.length && fields.every(f=>f.name && f.value);
  const visibleExact=statsExact && category && hall && title!==false && fields.every(f=>f.star!==false && f.level!==false && f.dice!==false);
  return {statsExact,visibleExact,directStats:statsExact && fields.every(f=>f.directName && f.directValue),category,hall,title,fields,accepted:!!result?.valid,acceptedWrongStats:!!result?.valid && !statsExact};
 }
 const api={normalize,compare};
 if(typeof module!=='undefined' && module.exports)module.exports=api;
 else window.DNVideoMetrics=api;
})();
