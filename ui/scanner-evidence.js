/* Local, bounded evidence selection. No network, catalogue learning or scoring.
 * Callers establish encounter/profile/capture identity before merging. Physical
 * row position, never a perk-name lookup, keeps duplicate rows distinct. */
((root,factory)=>{
  const api=factory(root);
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.DNScannerEvidence=api;
})(typeof window==='object'?window:globalThis,root=>{
  'use strict';
  const present=value=>value!==null && value!==undefined && value!=='';
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const normalize=value=>String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const qualifier=value=>String(value || '').toLowerCase().match(/^(enemy|invading)\b/)?.[1] || '';
  const numeric=value=>Number.isFinite(value);
  const fieldKeys=['name','value','level','unlocked','rerollEligible','tier','colour'];
  const companions={
    name:['name','known','assumed','nameSource','nameMatch','nameCorrected','rawName'],
    value:['value','hasPercent','inferred','inferredFields','valueSource','rawPercentage','percentageCorrected','outOfRange','observedValue'],
    level:['level','observedLevel','levelSource'],unlocked:['unlocked','unlockedSource'],
    rerollEligible:['rerollEligible','rerollSource','rerollConfidence','rerollEvidence','rerollConflict','rerollCaptureExpected'],
    tier:['tier','tierSource','tierEvidence'],colour:['colour']
  };
  function copyFields(target,source,key){
    for(const field of companions[key]){if(Object.prototype.hasOwnProperty.call(source,field))target[field]=source[field];else delete target[field];}
  }
  function sourceOf(row,key){
    if(key==='rerollEligible')return row.rerollSource || 'unknown';
    if(key==='colour')return row.colourSource || 'pixels';
    return row[key+'Source'] || (key==='value' && (row.inferred || row.inferredFields?.includes('value'))?'inferred':
      key==='name' && row.assumed?'suggestion':key==='tier' && row.tierSource || 'ocr');
  }
  const inferred=(row,key)=>sourceOf(row,key)!=='manual' && (row.inferredFields?.includes(key) ||
    key==='value' && row.inferred || ['inferred','tier-level','tier-percentage','locked-star','unique-percentage','percentage-level','fresh-craft'].includes(sourceOf(row,key)));
  function confidence(row,key,read,index){
    const detail=read?.evidence?.find?.(item=>item.index===index) || read?.evidence?.[index];
    const direct=key==='value'?detail?.amount?.confidence ?? detail?.percentage?.confidence:
      key==='name'?detail?.label?.confidence ?? detail?.name?.confidence:key==='level'?detail?.level?.confidence:null;
    const stored=row.fieldEvidence?.[key]?.selected;
    const own=stored && equal(stored.value,row[key] ?? null) && stored.source===sourceOf(row,key);
    if(own && numeric(stored.confidence))return stored.confidence;
    return numeric(direct)?direct:numeric(row[key+'Confidence'])?row[key+'Confidence']:
      key==='rerollEligible'?row.rerollConfidence==='high'?100:row.rerollConfidence==='medium'?70:0:
      ['name','value'].includes(key) && numeric(row.confidence)?row.confidence:null;
  }
  function observation(row,key,read,index){
    const raw=key==='name'?row.rawName || row.raw:key==='value'?row.rawPercentage || row.raw:null;
    return {value:row[key] ?? null,source:sourceOf(row,key),confidence:confidence(row,key,read,index),
      inferred:!!inferred(row,key),...(raw?{raw:String(raw).slice(0,240)}:{})};
  }
  function rank(row,key,read,index){
    if(!present(row[key]) || key==='colour' && row[key]==='unknown')return [0,0];
    if(sourceOf(row,key)==='manual')return [5,100];
    if(key==='name' && !row.known)return [1,confidence(row,key,read,index) || 0];
    if(key==='name' && row.assumed)return [2,confidence(row,key,read,index) || 0];
    if(key==='value' && (row.hasPercent===false || row.outOfRange || row.conflict || row.tierConflict))return [1,0];
    if(key==='tier' && row.tierConflict)return [1,0];
    if(inferred(row,key))return [2,confidence(row,key,read,index) || 0];
    return [4,confidence(row,key,read,index) ?? 80];
  }
  const greater=(a,b)=>a[0]>b[0] || a[0]===b[0] && a[1]>b[1];
  function journal(prior,next,selected,key,first,retry,index){
    const previous=prior.fieldEvidence?.[key];
    const observations=[...(previous?.alternatives || []),observation(prior,key,first,index),observation(next,key,retry,index)]
      .filter(item=>present(item.value));
    const fromNext=selected===next || selected!==prior && equal(selected[key],next[key]) && sourceOf(selected,key)===sourceOf(next,key);
    const chosen=observation(selected,key,fromNext?retry:first,index),alternatives=[];
    for(const item of observations)if(!equal(item.value,chosen.value) && !alternatives.some(other=>equal(item,other)))alternatives.push(item);
    // Repeated reads of identical text do not accumulate votes or confidence.
    return {selected:chosen,alternatives:alternatives.slice(-2)};
  }
  function compatibleIdentity(prior,next){
    if(prior.nameSource==='manual')return !next.known || next.name===prior.name;
    if(prior.known && next.known)return prior.name===next.name;
    return !next.name || !prior.name || normalize(prior.name)===normalize(next.name) ||
      (!next.known && !qualifier(next.name) && !/[a-z]{3}/i.test(next.name));
  }
  function titleRank(artifact){
    if(artifact?.nameSource==='manual')return [6,100];
    if(!artifact?.name)return [/[a-z]{3}/i.test(artifact?.nameEvidence?.text || '')?1:0,artifact?.nameEvidence?.confidence ?? -1];
    const evidence=artifact.nameEvidence,match=artifact.titleMatch || evidence?.match;
    if(artifact.titleUnclear)return [1,evidence?.confidence ?? artifact.titleConfidence ?? 0];
    if(artifact.titleConflict)return [1,evidence?.confidence || 0];
    if(match?.automatic && match.method==='exact')return [5,evidence?.confidence || 0];
    if(match?.automatic)return [4,evidence?.confidence || 0];
    if(evidence?.accepted===false)return [1,evidence.confidence || 0];
    return [3,evidence?.confidence ?? artifact.titleConfidence ?? 60];
  }
  function mergeArtifact(first={},retry={}){
    const title=greater(titleRank(retry),titleRank(first))?retry:first;
    const out={...first,...retry};
    for(const key of ['name','nameSource','nameEvidence','titleMatch','titleCatalogMatch','titleUnclear','titleConflict','titleConfidence','titleEvidence','rawTitle']){
      if(Object.prototype.hasOwnProperty.call(title,key))out[key]=title[key];else delete out[key];
    }
    // Category evidence cannot erase a manual choice or an identified category.
    const type=first.typeSource==='manual' || !retry.type || retry.typeSource==='selected' || retry.metadataConflict?first:retry;
    if(type.type){out.type=type.type;out.typeSource=type.typeSource;}
    const picture=!first.image || (retry.image && (retry.imageEvidence?.quality ?? 0)>(first.imageEvidence?.quality ?? 0))?retry:first;
    if(picture.image){out.image=picture.image;if(picture.artworkId)out.artworkId=picture.artworkId;else delete out.artworkId;}
    else if(retry.artworkId || first.artworkId)out.artworkId=retry.artworkId || first.artworkId;
    return out;
  }
  function metadata(read){
    const artifact=read?.artifact || {};
    return Object.fromEntries(['name','type','hall','image','artworkId'].map(key=>{
      const value=key==='hall'?read?.hall || artifact.hall:key==='image'?artifact.image?'captured':null:artifact[key] ?? null;
      const source=key==='hall'?read?.hallSource:key==='name'?artifact.nameSource:key==='type'?artifact.typeSource || artifact.source:key==='image'?'local-crop':'artwork-catalogue';
      const confidence=key==='name'?artifact.nameEvidence?.confidence ?? artifact.titleConfidence:key==='type'?artifact.typeConfidence ?? artifact.categoryConfidence:null;
      const raw=key==='name'?artifact.nameEvidence?.text || artifact.rawTitle:key==='type'?artifact.rawType:null;
      return [key,{selected:{value,source:source || 'unknown',confidence:confidence ?? null,...(raw?{raw:String(raw).slice(0,240)}:{})},alternatives:[]}];
    }));
  }
  function metadataJournal(first,retry,selected){
    const prior=first.fieldEvidence?.metadata || metadata(first),next=metadata(retry),chosen=metadata(selected);
    for(const key of Object.keys(chosen)){
      const alternatives=[...(prior[key]?.alternatives || []),prior[key]?.selected,next[key].selected].filter(item=>item && present(item.value) && !equal(item.value,chosen[key].selected.value));
      chosen[key].alternatives=alternatives.filter((item,index)=>alternatives.findIndex(other=>equal(item,other))===index).slice(-2);
    }
    return chosen;
  }
  function seed(read){
    if(!read)return read;
    const dispute=(read.rows || []).some(row=>row.fieldEvidence?.value?.conflict);
    return {...read,...(dispute?{valid:false}:{}),fieldEvidence:read.fieldEvidence?{...read.fieldEvidence,conflict:!!read.fieldEvidence.conflict || dispute}:{version:1,composed:false,conflict:dispute,metadata:metadata(read)},rows:(read.rows || []).map((row,index)=>({...row,fieldEvidence:Object.fromEntries(fieldKeys.map(key=>[key,
      row.fieldEvidence?.[key] || {selected:observation(row,key,read,index),alternatives:[]}]))}))};
  }
  function merge(first,retry,{sameEncounter=false,expectedRows=5,base=retry,storage=false}={}){
    if(!first || !retry || !sameEncounter)return seed(retry);
    // Short/missing OCR passes cannot establish positional field correspondence.
    // Preserve the existing row-count reconciliation instead of shifting rows.
    if(first.rows?.length!==expectedRows || retry.rows?.length!==expectedRows)return seed({...base,artifact:mergeArtifact(first.artifact,{...retry.artifact,metadataConflict:retry.metadataConflict}),fieldEvidence:{...base.fieldEvidence,version:1,conflict:!!first.fieldEvidence?.conflict || !!retry.fieldEvidence?.conflict}});
    let composed=false,credibleConflict=!!first.fieldEvidence?.conflict || !!retry.fieldEvidence?.conflict || (first.rows || []).some(row=>row.fieldEvidence?.value?.conflict) || (retry.rows || []).some(row=>row.fieldEvidence?.value?.conflict);
    const rows=base.rows.map((candidate,index)=>{
      const prior=first.rows[index],next=retry.rows[index],row={...candidate},chosen={};
      const nextSign=root.DN?.expectedPerkSign?.(prior.name);
      const independentlyRead=!next.known && prior.known && numeric(next.value) && next.hasPercent!==false &&
        /^[+-]\s*\d+(?:\s*[.,]\s*\d+)?\s*%$/.test(String(next.rawPercentage || '').trim()) &&
        (confidence(next,'value',retry,index) ?? 0)>=80 && (!qualifier(next.name) || qualifier(next.name)===qualifier(prior.name)) &&
        (nextSign!==1 && nextSign!==-1 || Math.sign(next.value)===nextSign);
      const compatible=compatibleIdentity(prior,next) || independentlyRead;
      for(const key of fieldKeys){
        let selected=candidate;
        if(sourceOf(prior,key)==='manual')selected=prior;
        else if(key==='value' && row.name!==prior.name){
          // A percentage belongs to the observation's named identity. Never
          // attach the previous identity's value to a newly exact stat name.
          selected=row.name===next.name?next:candidate;
        }else if(key==='name'){
          // Only stronger exact identity evidence can improve an already known
          // name. Its strength is independent of a manually entered percentage.
          const exact=next.known && !next.assumed && (!next.nameMatch || next.nameMatch.method==='exact' || next.nameSource==='manual');
          const paired=next.name===prior.name || numeric(next.value) || !numeric(prior.value) || prior.valueSource==='manual';
          selected=exact && paired && greater(rank(next,key,retry,index),rank(prior,key,first,index))?next:candidate;
        }else if(key==='rerollEligible' && Object.prototype.hasOwnProperty.call(next,key)){
          // Explicit unknown dice are fresh evidence, not an absent read.
          selected=next;
        }else if(key==='value'){
          if(compatible && !next.conflict && !next.tierConflict && greater(rank(next,key,retry,index),rank(prior,key,first,index)))selected=next;
          else if(present(prior[key]))selected=prior;
        }else if((key!=='level' && key!=='tier' || compatible) && greater(rank(next,key,retry,index),rank(prior,key,first,index)))selected=next;
        else if(present(prior[key]) && (!present(candidate[key]) || greater(rank(prior,key,first,index),rank(candidate,key,base,index))))selected=prior;
        if(!equal(row[key],selected[key]))composed=true;
        copyFields(row,selected,key);chosen[key]=selected;
      }
      // A newly exact name cannot inherit an unrelated old name's percentage.
      if(row.name!==prior.name && row.name!==next.name){row.value=null;row.hasPercent=false;composed=true;}
      const directDisagreement=compatible && numeric(prior.value) && numeric(next.value) && prior.value!==next.value &&
        !prior.conflict && !next.conflict && !prior.tierConflict && !next.tierConflict &&
        rank(prior,'value',first,index)[0]===4 && rank(next,'value',retry,index)[0]===4 &&
        (confidence(prior,'value',first,index) ?? 0)>=80 && (confidence(next,'value',retry,index) ?? 0)>=80;
      if(directDisagreement && sourceOf(prior,'value')!=='manual'){
        credibleConflict=true;
        // A weaker competing observation belongs in the journal; it must not
        // poison the held candidate and let the next weak read displace it.
        // Keep the candidate usable for provisional scoring; the field's
        // unresolved dispute separately blocks confirmation and explicit saving.
      }
      // Dependent tier/level/range evidence is recomputed by the shared storage
      // owner, never copied from an unrelated observation as a confirmed tuple.
      if(storage && (row.value!==candidate.value || row.level!==candidate.level || row.tier!==candidate.tier)){
        if(candidate.rangeSource!=='manual'){delete row.base;delete row.max;delete row.rangeSource;}
      }
      if(prior.conflict && prior.fieldEvidence && sourceOf(next,'value')!=='manual')row.conflict=true;
      row.inferredFields=['value','level','tier'].filter(key=>inferred(chosen[key],key));
      row.fieldEvidence=Object.fromEntries(fieldKeys.map(key=>[key,journal(prior,next,chosen[key],key,first,retry,index)]));
      if(prior.fieldEvidence?.value?.conflict || next.fieldEvidence?.value?.conflict || directDisagreement && sourceOf(prior,'value')!=='manual')row.fieldEvidence.value.conflict=true;
      return row;
    });
    const artifact=mergeArtifact(first.artifact,{...retry.artifact,metadataConflict:retry.metadataConflict});
    const identified=read=>['manual','hall-colour','crafting-label','percentage-tier'].includes(read.hallSource);
    const hallConflict=identified(first) && identified(retry) && first.hall && retry.hall && first.hall!==retry.hall;
    const hall=first.hallSource==='manual' || identified(first) && !identified(retry) || hallConflict?first:retry;
    const states=rows.map(row=>row.unlocked ?? null),allStates=states.every(value=>typeof value==='boolean');
    const out={...base,metadataConflict:!!base.metadataConflict || !!hallConflict,artifact,hall:hall.hall || first.hall,hallSource:hall.hallSource,rows,
      unlocked:{...base.unlocked,states,count:allStates?states.filter(Boolean).length:base.unlocked?.count ?? null},
      valid:!!base.valid && !composed && !credibleConflict && !hallConflict,
      fieldEvidence:{version:1,composed,conflict:credibleConflict}};
    out.fieldEvidence.metadata=metadataJournal(first,retry,out);
    if(storage && root.DNStoredArtifacts)out.rows=root.DNStoredArtifacts.backfillItem({hall:out.hall,type:artifact.type,rows}).rows;
    if(root.DNArtifactStatContext)out.rows=root.DNArtifactStatContext.annotate(out,{freshCraft:!storage}).rows;
    if(out.rows.some(row=>row.conflict || row.tierConflict || composed && row.statContext?.status==='conflict'))out.valid=false;
    return out;
  }
  function resolveManual(row,{all=false}={}){
    if(!row.fieldEvidence)return row;
    const fields={...row.fieldEvidence};
    for(const key of fieldKeys)if(all || sourceOf(row,key)==='manual')fields[key]={...fields[key],selected:observation(row,key,null,0),conflict:false};
    return {...row,fieldEvidence:fields};
  }
  return {version:1,merge,seed,mergeArtifact,titleRank,resolveManual};
});
