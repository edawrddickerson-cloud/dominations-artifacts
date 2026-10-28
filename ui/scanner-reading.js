/*
 * Authority: Scanner brief, user-selected all visible perks, shared artifact scorer.
 * Ownership: Scanner recognition results and correction form; no rating/state writes.
 * Invariants: Locked rows and duplicates count; OCR/manual use the same scorer;
 * incomplete/ambiguous input has no confirmed rating; superseded work never renders;
 * manual correction cannot bypass the fixed sign of a stat.
 * History: Added user-requested storage layout with five/six rows and shared ratings.
 * Crafting field calibration adds geometry invalidation and freezes median crops;
 * optional metadata fields also participate in frame-change signatures.
 * Completed crafting reads stay visible during retries and automatic panel movement.
 */
(() => {
  "use strict";
  const DN=window.DN, recognition=window.DNScannerRecognition;
  const get=id=>document.getElementById("scanner-"+id);
  const el=Object.fromEntries(["read","auto","layout","rows","hall","infer","progress","result-status","warnings","result","correct","accept","names","mode","off","def","profile-label"].map(id=>[id,get(id)]));
  let factory={}, names=[], canonPerk=value=>value, ready=false, engine=null;
  let token=0, session=null, busy=null, latestCanvas=null, hash=null, stableSince=0, readHash=null, result=null, confirmed=false, editing=false, stableTimer=null;
  let attempts=0,settled=false,best=null,anchor=null,phase='idle',resultCurrent=false;
  const frames=window.DNScannerFrames.create();
  let signatures=[];
  let itemId=0,itemAnchor=null,itemBoundary=false;
  let observedPanel=false;
  let displayedScore=null;
  let displayedKeeper=null;
  let displayedCapture=null,renderedResultHtml=null;
  let displayedItemId=null;
  let inlineEditing=false,deferredFrame=null;
  let latestCategorySource=null,categoryRegion=null;
  let latestFields=null,fieldGeometry=null;
  let ratingContext=null;
  let resultProfile=null;
  let itemArtwork=null;
  let focusAnchor=null,focusAbsent=null,focusCleared=false;
  let liveCapture=false,sampleRevision=0,speculatedToken=null;
  const storageEdits=new Map();
  let storageTypeOverride=null;
  let storageNameOverride=null;
  let storageTypeReread=false;
  const preview=document.createElement("canvas");
  preview.width=256;preview.height=128;
  const previewContext=preview.getContext("2d",{willReadFrequently:true});
  const storage=!!window.DNStorageRecognition;
  const serviceSource=storage?'storage':'crafting';
  function observeServices(value,options={}) {
    const context={source:serviceSource,captureMethod:liveCapture?'live-capture':'local-image',encounterId:JSON.stringify([session,itemId]),expectedRows:rowCount(),...options};
    // The sharing prompt needs only a local success bit, even without analytics.
    if(value?.valid && !window.DNSuccessfulScan){window.DNSuccessfulScan=true;window.dispatchEvent(new Event('dn-successful-scan'));}
    try{window.DNTelemetry?.scannerResult(value,context);}catch{}
  }
  const rowCount=()=>Number(el.rows.value)===6?6:5;
  const manualStorageType=()=>storageTypeOverride?.session===session && storageTypeOverride.itemId===itemId && storageTypeOverride.profileKey===window.DNStoredArtifacts?.collectionKey()?storageTypeOverride.type:null;
  const manualStorageName=()=>storageNameOverride?.session===session && storageNameOverride.itemId===itemId && storageNameOverride.profileKey===window.DNStoredArtifacts?.collectionKey()?storageNameOverride.name:null;
  function applyStorageName(value) {
    const name=manualStorageName();
    if(!value || name===null)return value;
    return {...value,artifact:{...value.artifact,name,nameSource:'manual',titleUnclear:!name.trim(),titleConflict:false,titleCatalogMatch:null,
      metadataWarnings:(value.artifact?.metadataWarnings || []).filter(warning=>warning!=='Check the artifact name.')}};
  }
  function say(text){el["result-status"].textContent=text;}
  function progress(next,text){phase=next;el.progress.className='scanner-progress is-'+next;el.progress.textContent=storage?next==='finished'?/failed/i.test(text)?'Finished · read failed':'Finished':({reading:'Reading…',waiting:'Waiting…',paused:'Paused',idle:'Waiting for an artifact'}[next] || text):text;}
  const settleDelay=storage?700:220;
  function schedule(delay=settleDelay) {
    // Small live shimmer must not postpone OCR indefinitely. Material item
    // changes clear this timer below and start a new settling period.
    if(stableTimer!==null)return;
    clearTimeout(stableTimer);
    stableTimer=setTimeout(()=>{stableTimer=null;if(busy?.speculative && !busy.validationDone){validateSpeculation(busy);return;}if(!document.hidden && ready && latestCanvas && (el.auto.checked || window.DNScannerCollection?.isEnabled()) && !editing && !busy && !settled)startRead();},delay);
  }
  const readContext=()=>JSON.stringify([token,session,itemId,fieldGeometry,window.DNStoredArtifacts?.collectionKey(),el.layout.value,rowCount(),el.hall.value,el.infer.checked,categoryRegion]);
  function discardSpeculation(reason) {
    const job=busy;if(!job?.speculative)return;
    job.discarded=true;job.validationDone=true;job.witness=null;
    job.timing?.('speculation-discarded');job.resolveValidation?.(false);
  }
  function validateSpeculation(job) {
    if(busy!==job || job.validationDone)return;
    const eligible=!document.hidden && ready && latestCanvas && !editing && !settled && liveCapture &&
      (el.auto.checked || window.DNScannerCollection?.isEnabled()) && job.context===readContext();
    if(!eligible || sampleRevision<=job.sampleRevision){discardSpeculation('context or freshness');return;}
    const remaining=settleDelay-(performance.now()-stableSince);
    if(remaining>0){schedule(remaining);return;}
    let current;
    try {
      current=captureInput();
      const witness=window.DNScannerFieldRecognition.witness(current.snapshot,latestFields,current.categorySource,readContext(),undefined,current.titleSource);
      if(!window.DNScannerFieldRecognition.sameWitness(job.witness,witness)){discardSpeculation('changed pixels');return;}
      if(current.startingSource){job.startingSource=document.createElement('canvas');job.startingSource.width=current.startingSource.width;job.startingSource.height=current.startingSource.height;job.startingSource.getContext('2d').drawImage(current.startingSource,0,0);}
      job.approvedTemporal=current.temporal;job.artwork=captureArtwork(current.metadataPanel);job.validationDone=true;job.approved=true;job.witness=null;
      job.timing?.('speculation-validated');job.resolveValidation(true);
    }catch{discardSpeculation('validation unavailable');}
    finally{current?.release();}
  }
  function speculate() {
    if(storage || !liveCapture || document.hidden || !ready || !latestCanvas || busy || settled || editing || attempts ||
      !engine?.isWarm?.({fast:true}) ||
      el.layout.value!=='panel' || rowCount()!==5 || !latestFields || !window.DNScannerFieldRecognition?.witness ||
      !(el.auto.checked || window.DNScannerCollection?.isEnabled()) || speculatedToken===token || performance.now()-stableSince>=settleDelay)return false;
    speculatedToken=token;startRead({speculative:true});return true;
  }
  function invalidate(message="Previous result is no longer current.",{preserveDisplay=false}={}) {
    discardSpeculation('invalidated');
    const retained=!storage && preserveDisplay && resultProfile===window.DNStoredArtifacts?.collectionKey()?(best || result):null;
    itemArtwork=null;
    if(!preserveDisplay || storage){displayedScore=null;displayedKeeper=null;displayedCapture=null;}
    frames.clear();signatures=[];hash=null;readHash=null;
    clearTimeout(stableTimer);stableTimer=null;
    token++; confirmed=false; resultCurrent=false; result=null; score(); el.warnings.textContent="";
    el.correct.textContent="";
    say(message); if(el.accept)el.accept.disabled=true;
    window.DNStorageScanner?.update(null,false);
    attempts=0;settled=false;best=retained;if(!retained)anchor=null;progress('idle','Waiting for an artifact');
  }
  function reset() {
    storageTypeOverride=null;
    storageNameOverride=null;
    storageTypeReread=false;
    inlineEditing=false;deferredFrame=null;window.DNScannerTargetRatings?.stopEditing?.();
    liveCapture=false;sampleRevision=0;speculatedToken=null;
    focusAnchor=null;focusAbsent=null;focusCleared=false;
    latestCategorySource=null;categoryRegion=null;
    latestFields=null;fieldGeometry=null;
    itemAnchor=null;itemBoundary=true;
    observedPanel=false;
    invalidate("No artifact read yet."); session=null; latestCanvas=null; hash=null; readHash=null;
    stableSince=0; editing=false; el.read.disabled=true;
    if(busy){busy.snapshot.width=busy.snapshot.height=0;if(busy.categorySource)busy.categorySource.width=busy.categorySource.height=0;busy=null;}
    if(engine){const previous=engine;engine=null;previous.close().catch(()=>{});}
  }
  function signature(canvas) {
    if(storage && latestFields && window.DNStorageRegions) {
      const resolved=window.DNStorageRegions.resolve(latestFields.template,latestFields.panel,latestFields.source);
      if(resolved.valid) {
        const values=[];
        for(const [id,box] of Object.entries(resolved.boxes))if(id!=='artwork') {
          previewContext.drawImage(latestFields.source,box.x,box.y,box.width,box.height,0,0,64,16);
          const pixels=previewContext.getImageData(0,0,64,16).data;
          for(let i=0;i<pixels.length;i+=4)values.push(Math.round((pixels[i]+pixels[i+1]+pixels[i+2])/24),Math.round((pixels[i+2]-Math.max(pixels[i],pixels[i+1]))/16));
        }
        return values;
      }
    }
    const fullStorage=storage && el.layout.value==='storage';
    // Artwork animates independently of the text. Watch the title, stats,
    // levels and dice on the right, plus the category ribbon sampled below.
    const roi=fullStorage?{x:canvas.width*.303,y:canvas.height*.018,width:canvas.width*.66,height:canvas.height*.918}:
      storage || el.layout.value==='text'?{x:0,y:0,width:canvas.width,height:canvas.height}:
      {x:canvas.width*.115,y:canvas.height*.275,width:canvas.width*.84,height:canvas.height*.657};
    previewContext.drawImage(canvas,roi.x,roi.y,roi.width,roi.height,0,0,256,128);
    const pixels=previewContext.getImageData(0,0,256,128).data;
    const values=[];
    for(let i=0;i<pixels.length;i+=4) {
      values.push(Math.round((pixels[i]+pixels[i+1]+pixels[i+2])/24));
      if(storage)values.push(Math.round((pixels[i+2]-Math.max(pixels[i],pixels[i+1]))/16));
    }
    if(fullStorage) {
      previewContext.drawImage(canvas,canvas.width*.072,canvas.height*.439,canvas.width*.2,canvas.height*.058,0,0,32,16);
      const ribbon=previewContext.getImageData(0,0,32,16).data;
      for(let i=0;i<ribbon.length;i+=4)values.push(Math.round((ribbon[i]+ribbon[i+1]+ribbon[i+2])/24),Math.round((ribbon[i+2]-Math.max(ribbon[i],ribbon[i+1]))/16));
    }
    if(latestFields && window.DNScannerRegions) {
      const resolved=window.DNScannerRegions.resolve(latestFields.template,latestFields.panel,latestFields.source);
      for(const id of ['category','hall',...Array.from({length:5},(_,i)=>i+'-dice')])if(resolved.valid && resolved.boxes[id]) {
        const box=resolved.boxes[id];previewContext.drawImage(latestFields.source,box.x,box.y,box.width,box.height,0,0,32,16);
        const labelPixels=previewContext.getImageData(0,0,32,16).data;
        for(let i=0;i<labelPixels.length;i+=4)values.push(Math.round((labelPixels[i]+labelPixels[i+1]+labelPixels[i+2])/24),Math.round((labelPixels[i+2]-Math.max(labelPixels[i],labelPixels[i+1]))/16));
      }
    }
    return values;
  }
  function changed(a,b,threshold=.0005) {
    if(!a || !b) return true;
    let differences=0;
    for(let i=0;i<a.length;i++) if(Math.abs(a[i]-b[i])>1) differences++;
    return differences>a.length*threshold;
  }
  function update(canvas, state) {
    if(!storage && inlineEditing){deferredFrame={canvas,state:{...state}};return;}
    if(session!==state.session){reset();session=state.session;}
    let correctedGeometryType=null,correctedGeometryName=null;
    if(Object.prototype.hasOwnProperty.call(state,'live'))liveCapture=state.live===true;
    if(Object.prototype.hasOwnProperty.call(state,'fields')) {
      const next=state.fields || null,key=next?JSON.stringify([next.template,next.panel,!!next.foregroundRows]):null;
      if(storage && key!==fieldGeometry && next?.template?.kind==='storage' && latestFields?.template?.kind==='storage' &&
        next.template.rows.length!==latestFields.template.rows.length && next.template.rows.length===rowCount()){
        correctedGeometryType=manualStorageType();correctedGeometryName=manualStorageName();
      }
      if(key!==fieldGeometry){invalidate('Field regions changed. Checking the current artifact.',{preserveDisplay:true});hash=null;readHash=null;latestCanvas=null;}
      latestFields=next;fieldGeometry=key;
    }
    if(Object.prototype.hasOwnProperty.call(state,'categorySource'))latestCategorySource=state.categorySource || null;
    if(Object.prototype.hasOwnProperty.call(state,'panelRegion'))categoryRegion=state.panelRegion || null;
    if(!storage) {
      if(state.itemPresent===true) {
        focusAnchor=signature(canvas);focusAbsent=null;focusCleared=false;
      } else if(state.itemPresent===false && focusAnchor && !document.hidden) {
        const now=performance.now();
        // A missed gold border alone is not an empty scene: require a broad
        // change from the last visible panel, several fresh frames and time.
        if(changed(focusAnchor,signature(canvas),.2)) {
          if(!focusAbsent || now-focusAbsent.last>750)focusAbsent={since:now,last:now,frames:0};
          focusAbsent.last=now;focusAbsent.frames++;
          if(!focusCleared && focusAbsent.frames>=5 && now-focusAbsent.since>=2000) {
            editing=false;itemAnchor=null;itemBoundary=true;
            invalidate('No artifact in focus.');latestCanvas=null;el.read.disabled=true;focusCleared=true;
          }
        } else focusAbsent=null;
        state={...state,current:false};
      } else focusAbsent=null;
      if(focusCleared)return;
    }
    if(!state.current){
      discardSpeculation('capture paused');
      resultCurrent=false;
      frames.clear();signatures=[];
      if(latestCanvas){token++;confirmed=false;clearTimeout(stableTimer);stableTimer=null;progress(!storage && state.itemPresent===false && focusAnchor?'waiting':'paused','Checking the view · showing the last capture');score();say('Preview unavailable or delayed; displayed rows are the last capture.');}
      latestCanvas=null;el.read.disabled=true;return;
    }
    const resuming=!latestCanvas;latestCanvas=canvas; el.read.disabled=!ready || busy;
    // Load the local model while capture settles, rather than after Read starts.
    if(ready && !engine) {
      const owner=engine=recognition.create({names,canonPerk});
      owner.warm?.({fast:!storage && !!latestFields && el.layout.value==='panel'}).then(()=>{if(engine===owner)speculate();}).catch(()=>{if(engine===owner)engine=null;owner.close().catch(()=>{});});
    }
    const current=signature(canvas),now=performance.now();
    signatures.push(current);if(signatures.length>3)signatures.shift();
    // A broad scene transition is immediate; small overlays get the temporal gate.
    if(anchor && changed(anchor,current,.08))signatures=[current];
    const next=signatures.length===3?window.DNScannerFrames.median(signatures):signatures[0];
    frames.push(canvas);
    sampleRevision++;
    // Hold a complete crafting read through local shimmer and overlays. Keep
    // the original anchor so small changes cannot accumulate into anchor drift.
    const holdConfirmed=!storage && confirmed && resultCurrent && result?.rows?.length===5 &&
      result.rows.every(row=>row.known && !row.assumed && !row.inferred && !row.conflict && !row.tierConflict && Number.isFinite(row.value));
    // Inferred and partial reads also contain useful held stats. Keep their
    // best rows through minor motion while retries improve the missing fields.
    const holdKnown=!storage && (best || result)?.rows?.some(row=>row.known && !row.assumed && Number.isFinite(row.value));
    const changeThreshold=(holdConfirmed || holdKnown) ? .02 : .003;
    const differentArtifact=changed(anchor,next,changeThreshold);
    if(holdConfirmed && !differentArtifact)return;
    if(changed(itemAnchor,next,changeThreshold)){
      if(changed(itemAnchor,next,.08))itemBoundary=true;
      itemId++;itemAnchor=next;
      if(correctedGeometryType)storageTypeOverride={...storageTypeOverride,itemId};
      if(correctedGeometryName!==null)storageNameOverride={...storageNameOverride,itemId};
    }
    // Cancel on changes in the filtered fields below. A noisy individual
    // frame must not repeatedly supersede storage OCR or its ownership check.
    // Broad scene changes already bypass the median above.
    if(resuming){settled=false;attempts=0;best=!storage && !differentArtifact?best || result:null;readHash=null;schedule();}
    if(settled && !differentArtifact)return;
    if(changed(hash,next)) {
      if(storage || differentArtifact || hash===null)stableSince=now;
      hash=next;readHash=null;
      if(differentArtifact){discardSpeculation('new artifact');clearTimeout(stableTimer);stableTimer=null;token++;attempts=0;settled=false;best=null;itemArtwork=null;anchor=next;frames.clear();frames.push(canvas);editing=false;confirmed=false;resultCurrent=false;el.correct.textContent='';if(el.accept)el.accept.disabled=true;}
      if(!busy || differentArtifact){progress('waiting','Waiting for a steady image'+(result?' · keeping the last capture visible':''));say('Checking the artifact region. Displayed rows will update when the read finishes.');}
      score();schedule();
    }
    // One early job per context may overlap the settling window. It cannot
    // publish until exact inputs match the ordinary settled snapshot.
    speculate();
    // Small bounded change/stability gate; no overlapping worker jobs or queue.
    if(!document.hidden && ready && (el.auto.checked || window.DNScannerCollection?.isEnabled()) && !editing && !busy && !settled && now-stableSince>=settleDelay && readHash!==hash) startRead();
  }
  function options() {
    const revision=DN.strategyRevision();
    if(!ratingContext || ratingContext.profile!==DN.activeProfileId() || ratingContext.revision!==revision) {
      const active=DN.createStrategyRatingContext(factory,{canonPerk});
      const strategies=DN.comparisonStrategies().map(strategy=>({id:strategy.id,name:strategy.name,favorite:strategy.favorite,
        context:strategy.id===active.strategy.id?active:DN.createStrategyRatingContext(factory,{strategyId:strategy.id,canonPerk})}));
      ratingContext={profile:DN.activeProfileId(),revision,active,strategies};
    }
    el["profile-label"].textContent="Profile: "+DN.activeProfile().name+" · Strategy: "+ratingContext.active.strategy.name+". All visible perks, including locked rows, count.";
    const base={canonPerk,scoreMode:'combined',prefSortAxes:{offensive:el.off.checked,defensive:el.def.checked}};
    return {...base,ratingOf:ratingContext.active.ratingOf,strategyId:ratingContext.active.strategy.id,
      strategyName:ratingContext.active.strategy.name,revision,
      strategyOptions:ratingContext.strategies.map(strategy=>({id:strategy.id,name:strategy.name,favorite:strategy.favorite,
        options:{...base,ratingOf:strategy.context.ratingOf,strategyId:strategy.id,revision}}))};
  }
  function score() {
    if(!storage && resultProfile && resultProfile!==window.DNStoredArtifacts?.collectionKey()){
      resultProfile=null;invalidate('Profile changed. Read the current artifact again.');return;
    }
    const hallStatus=get('hall-label');
    if(!storage && hallStatus)hallStatus.textContent=(result?.hall || el.hall.value)==='war'?'War item':'Main (Multiplayer) item';
    if(!storage && hallStatus)hallStatus.textContent+=' · '+({
      'hall-colour':'detected from ribbon colour','crafting-label':'detected from label','percentage-tier':'detected from percentages','selected-hall':'using selected Hall'
    }[result?.hallSource] || 'using selected Hall');
    const baseOpts=ready?options():null;
    let opts=baseOpts;
    if(!storage && opts)opts=window.DNScannerComparisonCore?.craftOptions(opts,{hall:result?.hall || el.hall.value,type:result?.artifact?.type,rows:result?.rows}) || opts;
    const row={};
    result?.rows.forEach((perk,index)=>{row["perk_"+(index+1)+"_name"]=perk.name;row["perk_"+(index+1)+"_base"]=String(perk.value);row["perk_"+(index+1)+"_max"]="";});
    const current=resultCurrent && !!latestCanvas && (!editing || confirmed);
    const starCurrent=resultCurrent && !!latestCanvas;
    if(!storage && starCurrent && result){displayedKeeper=result;displayedCapture=result;displayedItemId=itemId;}
    const captureHolding=!storage && !!displayedCapture && !starCurrent;
    const visibleResult=captureHolding?displayedCapture:result;
    const estimate=!storage && current && opts?window.DNScannerComparisonCore?.estimate(result,{names,options:opts,hall:el.hall.value,expectedRows:rowCount()}):null;
    const candidate=estimate || (confirmed?result:null);
    if(!storage && current && candidate)displayedScore=candidate;
    const holding=!storage && !!displayedScore && !(current && candidate);
    const scoreResult=holding?displayedScore:candidate;
    if(!storage && opts && scoreResult)opts=window.DNScannerComparisonCore?.craftOptions(opts,{hall:scoreResult.hall || el.hall.value,type:scoreResult.artifact?.type,rows:scoreResult.rows}) || opts;
    if(!storage && scoreResult)scoreResult.rows.forEach((perk,index)=>{
      row['perk_'+(index+1)+'_name']=perk.name;row['perk_'+(index+1)+'_base']=String(perk.value);
      row['perk_'+(index+1)+'_max']=String(Math.sign(perk.value)*(Math.abs(perk.value)+9));
    });
    const retainDecision=holding && !editing && ['waiting','reading'].includes(phase);
    const keeperResult=starCurrent?result:!editing && ['waiting','reading'].includes(phase)?displayedKeeper:null;
    const draft=!storage && editing && !confirmed && resultCurrent?corrections(true):null;
    const captureResult=draft?{...visibleResult,rows:draft.rows,unlocked:{states:draft.rows.map(row=>row.unlocked)}}:visibleResult;
    window.DNScannerComparison?.update(scoreResult || result,(current && !!candidate) || retainDecision,baseOpts,{keeperResult,categoryResult:starCurrent?result:null,captureResult,captureRetained:captureHolding,encounterId:JSON.stringify([session,itemId])});
    window.DNScannerKeep?.update(result,{current,confirmed,profileKey:resultProfile,encounterId:JSON.stringify([session,itemId])});
    const rerollType=get('compare-type')?.value || scoreResult?.artifact?.type;
    const targetContext=!storage?window.DNScannerComparison?.scoringContext?.():null;
    const editingRatings=!storage && !!window.DNScannerTargetRatings?.isEditing();
    if(!storage && baseOpts && scoreResult)opts=window.DNScannerComparisonCore?.craftOptions(baseOpts,{hall:scoreResult.hall || el.hall.value,type:rerollType,rows:scoreResult.rows}) || baseOpts;
    const totals=scoreResult && opts?window.DNArtifactScoring.score(!storage && window.DNScannerComparisonCore?window.DNScannerComparisonCore.statRow(scoreResult.rows.map(perk=>({...perk,value:Math.sign(perk.value)*(Math.abs(perk.value)+9)}))):row,opts):null;
    const rerollTotal=!storage && scoreResult && opts?window.DNScannerComparisonCore?.craftPotential?.({...scoreResult,artifact:{...scoreResult.artifact,type:rerollType}},targetContext?.options || opts):null;
    const live=get('live-score'),assumption=get('score-assumption');
    if(live) {
      const visible=totals;
      live.innerHTML=[['Off','offensive',opts?.prefSortAxes.offensive],['Def','defensive',opts?.prefSortAxes.defensive],['Total','preference',opts && (opts.prefSortAxes.offensive || opts.prefSortAxes.defensive)]].map(([label,key,selected])=>'<div><span>'+label+'</span><strong>'+(!selected?'Off':visible?String(totals[key]):'—')+'</strong></div>').join('');
    }
    if(assumption)assumption.textContent=scoreResult?.provisional?(scoreResult.assumption || 'Provisional score · verify OCR values')+' · Review before deciding.':'';
    const count=visibleResult?.unlocked?.count;
    const progress=recognition.coverage(visibleResult?.rows || [],rowCount());
    const lightText=progress.light==='green'?rowCount()+' stats captured':progress.light==='orange'?'Incomplete / check rows':'Nothing useful in view';
    const correctionError=storage && editing && !confirmed?corrections(true).error:'';
    const correctionStatus=get('correction-status');
    if(correctionStatus)correctionStatus.textContent=correctionError || (editing && !confirmed?(storage?'Complete the remaining fields; valid edits apply automatically.':'Changes are valid. Use Corrected Values, then Keep Artifact.'):'');
    const unknownEditable=storage && [...el.correct.querySelectorAll('input,select,.scanner-perk-unlocked,.scanner-perk-reroll')].some(input=>!input.disabled && !input.classList?.contains('scanner-perk-tier') &&
      (String(input.value ?? '').trim()==='' || input.classList.contains('is-unknown') || input.validity?.valid===false));
    window.DNStorageScanner?.update(result,confirmed && !!latestCanvas,{reviewable:resultCurrent && !!latestCanvas && (!editing || confirmed),pending:editing && !confirmed,correctionError,expectedRows:rowCount(),unknownEditable,profileKey:resultProfile,encounterId:JSON.stringify([session,itemId]),manualCorrection:manualStorageName()!==null || !!manualStorageType() || editing && confirmed});
    let previewOpts;
    const rowStatus=get('row-status');
    if(rowStatus)rowStatus.textContent=progress.total+'/'+rowCount()+' stats captured';
    const artifactName=recognition.cleanArtifactName(visibleResult?.artifact?.name) || (editingRatings?'':visibleResult?'Unknown artifact':'Artifact');
    const scoringName=targetContext?.label || baseOpts?.strategyName || '';
    const scoringTitle=scoringName?scoringName+' Score':'';
    const resultHtml=(storage?'<div class="scanner-glance"><div class="scanner-traffic is-'+progress.light+'" role="status"><span class="scanner-light" aria-hidden="true"></span><strong>'+progress.total+'/'+rowCount()+' · '+lightText+'</strong><small>'+progress.known+' known · '+progress.assumed+' assumed · '+progress.collected+' new names</small></div>'+
      '<div class="scanner-enabled"><strong>'+(count ?? '?')+'</strong><span>ENABLED STATS<small>'+(count!=null?'Filled yellow stars':'Include row stars in the full item crop')+'</small></span></div></div>':'')+
      '<div class="scanner-score">'+(!holding && totals?
      (opts.prefSortAxes.offensive?'<span>Off <strong>'+totals.offensive+'</strong></span>':'')+
      (opts.prefSortAxes.defensive?'<span>Def <strong>'+totals.defensive+'</strong></span>':''):'<span>Rating unconfirmed</span>')+'</div>'+
      (storage?'<p>'+(count!=null?count+' of '+rowCount()+' unlocked — filled stars':'Unlocked stars unclear')+' · All '+rowCount()+' count toward rating'+(visibleResult?.temporal?.frames===3?' · 3-frame noise filtering':'')+'</p>':'')+
      (storage?'':'<div class="scanner-score-heading"><h3 id="scanner-artifact-name" class="scanner-artifact-name scanner-inline-field" data-inline-field="artifact" contenteditable="'+(editingRatings?'plaintext-only':'false')+'"'+(editingRatings?' role="textbox" tabindex="0" aria-label="Artifact name"':'')+' title="'+DN.esc(artifactName)+'">'+DN.esc(artifactName)+'</h3><button type="button" class="btn" data-target-edit aria-pressed="'+editingRatings+'">Edit</button></div><div class="scanner-stat-table'+(editingRatings?' is-editing':'')+'"><div class="scanner-scoring-heading"><span id="scanner-score-context" class="scanner-score-context" title="'+DN.esc(scoringTitle)+'">'+DN.esc(scoringTitle)+'</span></div><div class="scanner-stat-heading"><span>Stat</span><span>%</span><span title="Shared rating multiplier" aria-label="Stat Rating">Stat Rating</span><span title="Score at maximum upgrade">Max score</span><span>Dice</span></div>'+Array.from({length:rowCount()},(_,index)=>{
        const perk=visibleResult?.rows[index],edit=editing && !confirmed?el.correct.querySelectorAll('.scanner-edit-row')[index]:null;
        const star=edit?.querySelector('.scanner-perk-unlocked');
        const state=star?.tagName==='BUTTON'?star.value===''?null:star.value==='true':perk?.unlocked;
        const selectedTier=edit?.querySelector('.scanner-perk-tier')?.value || perk?.tier;
        const editedDice=edit?.querySelector('.scanner-perk-reroll');
        const rerollEligible=editedDice?.tagName==='BUTTON'?editedDice.value===''?null:editedDice.value==='true':perk?.rerollEligible;
        const colour=selectedTier==='white'?'neutral':['green','blue'].includes(selectedTier)?selectedTier:visibleResult?.colours?.[index] ?? perk?.colour;
        const scored=scoreResult?.rows[index], line=totals?.lines[index];
        const matches=perk && scored && perk.name===scored.name && (perk.value===scored.value || scored.estimated);
        // Crafting rows are level 1; nine upgrades add nine percentage points.
        const maxMagnitude=scored && Number.isFinite(scored.value)?Math.abs(scored.value)+9:null;
        const acceptedScore=matches && line && opts && maxMagnitude!=null?window.DNArtifactScoring.lineActiveScore(line,opts.prefSortAxes):null;
        let previewScore=null;
        if(acceptedScore===null && !storage && !editing && perk?.known && Number.isFinite(perk.value)) {
          if(previewOpts===undefined)previewOpts=baseOpts && window.DNScannerComparisonCore?.craftOptions(baseOpts,{hall:visibleResult.hall || el.hall.value,type:visibleResult.artifact?.type || get('compare-type')?.value,rows:visibleResult.rows}) || baseOpts;
          previewScore=window.DNScannerComparisonCore?.previewRowScore(perk,previewOpts) ?? null;
        }
        const contribution=targetContext?.contributions?.[index];
        const excluded=!!targetContext && (contribution?.included===false || contribution?.active===false) && !!perk?.known;
        const multiplier=excluded?0:targetContext?contribution?.weight:acceptedScore!=null && maxMagnitude?acceptedScore/maxMagnitude:null;
        const multiplierMarkup=editingRatings && contribution?.included && contribution?.active!==false?'<input type="number" class="scanner-rating-input" min="0" max="10" step="1" data-target-rating-row="'+index+'" data-target-id="'+DN.esc(targetContext.id)+'" data-perk="'+DN.esc(contribution.name)+'" value="'+multiplier+'" aria-label="'+DN.esc(contribution.name+': shared rating multiplier')+'" />':multiplier!=null?String(multiplier):'&mdash;';
        const provisional=!excluded && (targetContext?!!contribution?.uncertain:previewScore!==null);
        const rowScore=excluded?0:targetContext?contribution?.score ?? null:acceptedScore ?? previewScore;
        const scoreTitle=targetContext?(contribution?.included?targetContext.label+(rowScore!==null?' · Max '+(Math.abs(perk.value)+9)+'% × '+multiplier+' = '+rowScore:''): 'Not included in '+targetContext.label):provisional?'Provisional score for the best current reading; excluded from the item subtotal. '+window.DNScannerComparisonCore.scoreExclusion(perk):rowScore===null?(window.DNScannerComparisonCore?.scoreExclusion(perk) || (!opts?'Perk ratings are still loading':editing?'Apply the corrected values to score this row':'Waiting for a scoring result matching this row')):perk?.inferred?'Score uses the displayed percentage, inferred from text colour':scored?.estimated?'Estimated maximum percentage times perk rating':'';
        const gain=!provisional && (rowScore!==null || targetContext && perk?.known && Number.isFinite(perk.value)) && rerollTotal && rerollEligible===true?Math.max(0,rerollTotal.rerollTarget-(rowScore ?? 0)):null;
        const best=rerollTotal?.rerollIndex===index && gain>0;
        const rerollTitle=best?(targetContext?'Possible reroll gain for '+targetContext.label+'. ':'Best single reroll gain, included in the item total. ')+rerollTotal.rerollStat+' at '+rerollTotal.rerollMagnitude+'%: '+rerollTotal.rerollTarget+' points before replacing this row.':'Gain is shown only for the lowest-scoring rerollable row';
        const colourClass=['neutral','green','blue'].includes(colour)?' is-'+colour:'';
        const editable=(field,label)=>' class="scanner-inline-field" data-inline-row="'+index+'" data-inline-field="'+field+'" contenteditable="'+(editingRatings?'plaintext-only':'false')+'"'+(editingRatings?' role="textbox" tabindex="0" aria-label="'+label+' '+(index+1)+'"':'');
        return '<div class="scanner-perk'+colourClass+(state===true?' is-unlocked':state===false?' is-locked':'')+'"><span class="scanner-stat-title">'+starMarkup(state,index)+(index+1)+'. <span'+editable('name','Perk name')+'>'+DN.esc(perk?.name || (editingRatings?'':'Waiting for stat'))+'</span></span><span class="scanner-stat-value"><span'+editable('value','Percentage')+'>'+
          (perk?.value!=null?(perk.value>=0?'+':'')+perk.value+'%':editingRatings?'':'?%')+'</span></span><span class="scanner-stat-multiplier">'+multiplierMarkup+'</span><span class="scanner-stat-score'+(best?' is-best-reroll':'')+'"'+(scoreTitle?' title="'+DN.esc(scoreTitle)+'" tabindex="0"':'')+'>'+'<span class="scanner-stat-base-score">'+(rowScore!=null?(!excluded && (provisional || scored?.estimated)?'~':'')+rowScore:'&mdash;')+'</span>'+(best?' <span class="scanner-reroll-gain" title="'+DN.esc(rerollTitle)+'">+ '+gain+'</span>':'<span class="scanner-reroll-gain"></span>')+'</span><span class="scanner-stat-reroll" title="'+DN.esc(rerollTitle)+'">'+rerollMarkup(rerollEligible,index)+'</span></div>';
      }).join('')+'</div>');
    if(storage || resultHtml!==renderedResultHtml){
      const focused=editingRatings && document.activeElement?.matches?.('[data-target-rating-row],[data-inline-field]')?document.activeElement:null;
      const selection=focused?.dataset.inlineField?window.getSelection?.():null;
      const start=selection?.anchorOffset,end=selection?.focusOffset;
      el.result.innerHTML=resultHtml;renderedResultHtml=resultHtml;
      if(focused){
        const replacement=focused.dataset.inlineField==='artifact'?get('artifact-name'):focused.dataset.inlineField?el.result.querySelector('[data-inline-row="'+focused.dataset.inlineRow+'"][data-inline-field="'+focused.dataset.inlineField+'"]'):el.result.querySelector('[data-target-rating-row="'+focused.dataset.targetRatingRow+'"]');
        if(replacement && (focused.dataset.inlineField || replacement.dataset.perk===focused.dataset.perk && replacement.dataset.targetId===focused.dataset.targetId)){
          replacement.replaceWith(focused);focused.focus({preventScroll:true});
          if(selection && focused.firstChild){const range=document.createRange(),length=focused.firstChild.textContent.length;range.setStart(focused.firstChild,Math.min(start,length));range.setEnd(focused.firstChild,Math.min(end,length));selection.removeAllRanges();selection.addRange(range);}
        }
      }
    }
    const rerollStatus=get('reroll-status');
    if(rerollStatus) {
      const diceRows=(visibleResult?.rows || []).map((row,i)=>{
        const button=editing && !confirmed?el.correct.querySelectorAll('.scanner-edit-row')[i]?.querySelector('.scanner-perk-reroll'):null;
        return button?.tagName==='BUTTON'?button.value===''?null:button.value==='true':row.rerollEligible;
      });
      const count=diceRows.filter(value=>value===true).length,unknown=diceRows.filter(value=>typeof value!=='boolean').length;
      rerollStatus.textContent=!diceRows.length?'Read an artifact to check reroll availability.':unknown?'Reroll availability needs review · '+unknown+' unknown':count===0?'Cannot reroll':count===diceRows.length?'All '+count+' stats rerollable':count===1?'Only stat '+(diceRows.indexOf(true)+1)+' rerollable':count+' stats rerollable · Verify dice pattern';
      rerollStatus.classList?.toggle('scanner-warning',unknown>0 || count>1 && count<diceRows.length);
    }
    if(storage)el.correct.querySelectorAll('.storage-read-stat').forEach((cell,index)=>{
      const perk=result?.rows[index];
      const name=cell.querySelector?.('.storage-read-name'),value=cell.querySelector?.('strong');
      if(name)name.textContent=perk?.name || 'Waiting for stat';
      if(value)value.textContent=perk?.value!=null?(perk.value>=0?'+':'')+perk.value+'%':'?%';
      if(!editing || confirmed)syncStar(cell.querySelector?.('.scanner-perk-unlocked'),perk?.unlocked,index);
    });
  }
  const starShape='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1z" /></svg>';
  const diceShape='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.4"/><circle cx="16" cy="8" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="8" cy="16" r="1.4"/><circle cx="16" cy="16" r="1.4"/></svg>';
  function rerollMarkup(eligible,index) {
    const special=/legendary|mythical/i.test(result?.artifact?.type || '');
    const state=special?'false':eligible===true?'true':eligible===false?'false':'';
    return '<button type="button" class="scanner-perk-reroll reroll-dice'+(state==='true'?' is-rerollable':state===''?' is-unknown':'')+'" data-row-index="'+index+'" value="'+state+'"'+(special?' disabled':'')+' aria-label="Row '+(index+1)+' reroll: '+(state==='true'?'available':state==='false'?'unavailable':'unknown')+'. Click to change." title="Reroll '+(state==='true'?'available':state==='false'?'unavailable':'unknown')+' (click: available / unavailable / unknown)">'+diceShape+'</button>';
  }
  function cycleReroll(button) {
    if(!button || button.disabled)return;
    button.value=button.value===''?'true':button.value==='true'?'false':'';
    button.classList.toggle('is-rerollable',button.value==='true');button.classList.toggle('is-unknown',button.value==='');
    button.title='Reroll '+(button.value==='true'?'available':button.value==='false'?'unavailable':'unknown');
    button.setAttribute('aria-label','Reroll '+(button.value==='true'?'available':button.value==='false'?'unavailable':'unknown')+'. Click to change.');
    button.dataset.manual='true';
  }
  function starMarkup(unlocked,index) {
    const state=unlocked===true?'true':unlocked===false?'false':'';
    return '<button type="button" data-row-index="'+index+'" class="scanner-perk-unlocked storage-star'+(unlocked===true?' is-unlocked':'')+(state===''?' is-unknown':'')+'" value="'+state+'" aria-pressed="'+(state || 'mixed')+'" aria-label="Row '+(index+1)+': '+(state===''?'star unknown. Click to unlock':unlocked?'unlocked. Click to lock':'locked. Click to unlock')+'">'+starShape+'</button>';
  }
  function syncStar(button,unlocked,index) {
    if(!button)return;
    const state=unlocked===true?'true':unlocked===false?'false':'';
    button.value=state;
    button.classList?.toggle('is-unlocked',unlocked===true);
    button.classList?.toggle('is-unknown',state==='');
    button.setAttribute?.('aria-pressed',state || 'mixed');
    button.setAttribute?.('aria-label','Row '+(index+1)+': '+(state===''?'star unknown. Click to unlock':unlocked?'unlocked. Click to lock':'locked. Click to unlock'));
  }
  function highlightUnknownFields() {
    const category=get('compare-type');
    if(!storage && category)category.classList?.toggle('is-unknown',!category.value);
    for(const field of el.correct.querySelectorAll('.scanner-edit-row')) {
      for(const key of ['name','value','tier','level','base','max','reroll']) {
        const input=field.querySelector('.scanner-perk-'+key);
        if(!input)continue;
        const empty=!String(input.value || '').trim();
        const unknown=!(storage && key==='tier') && !input.disabled && (empty || key==='name' && !names.includes(canonPerk(input.value.trim())) || input.validity?.valid===false);
        input.classList?.toggle('is-unknown',!!unknown);
      }
      const base=field.querySelector('.scanner-perk-base'),max=field.querySelector('.scanner-perk-max');
      field.querySelector('.storage-range-edit summary')?.classList?.toggle('is-unknown',!base?.value || !max?.value);
      const title=field.querySelector('.storage-read-name'),tier=field.querySelector('.scanner-perk-tier')?.value;
      title?.classList?.toggle('is-green',tier==='green');
      title?.classList?.toggle('is-blue',tier==='blue');
    }
  }
  function autofillLockedLevels() {
    if(!storage)return;
    for(const field of el.correct.querySelectorAll('.scanner-edit-row')) {
      const star=field.querySelector('.scanner-perk-unlocked'),level=field.querySelector('.scanner-perk-level');
      if(!star || !level)continue;
      const locked=star.value==='false';
      level.readOnly=locked;
      if(locked) {
        const inferred=level.value!=='1' || level.dataset?.autoInferred==='true';
        if(level.value!=='1') {
          level.value='1';
          if(level.dataset)level.dataset.autoInferred='true';
        }
        // A confirmed level also resolves the tier when the percentage is present.
        autofillEditedRow(level);
        if(inferred && level.dataset)level.dataset.autoInferred='true';
        level.title='Locked stats are always level 1.';
      }else if(level.title==='Locked stats are always level 1.')level.title='';
    }
  }
  function nameMatchNote(perk) {
    if(!perk.nameCorrected)return '';
    const substitutions=(perk.nameMatch?.corrections || []).map(rule=>rule.from+' → '+rule.to).join('; ');
    const title='OCR: '+(perk.rawName || perk.raw || '')+(substitutions?'. Reviewed corrections: '+substitutions:'')+'. Match score is a name matching heuristic, not an OCR probability.';
    return '<small title="'+DN.esc(title)+'">'+(perk.nameMatch?.automatic?'Matched automatically':'Suggested match')+' · '+Math.floor((perk.nameMatch?.confidence || 0)*100)+'% match score</small>';
  }
  function showCorrection() {
    storageEdits.clear();
    const rows=Array.from({length:rowCount()},(_,index)=>result?.rows[index] || {name:'',value:null});
    const specialTier=storage && /legendary|mythical/i.test(result?.artifact?.type || document.getElementById('storage-type')?.value || '');
    el.correct.innerHTML=rows.map((perk,index)=>'<div class="scanner-edit-row">'+(storage?'<div class="storage-read-stat">'+starMarkup(perk.unlocked,index)+'<span class="storage-read-name">'+DN.esc(perk.name || 'Waiting for stat')+'</span><strong>'+(perk.value!=null?(perk.value>=0?'+':'')+perk.value+'%':'?%')+'</strong>'+(perk.inferredFields?.length?'<small class="storage-inference-note">Inferred '+DN.esc(perk.inferredFields.join(' and '))+'. Verify before keeping.</small>':'')+'</div>':'')+'<label>'+(storage?'Edit perk':'Perk')+(!storage?'<div class="crafting-perk-name-field">'+starMarkup(perk.unlocked,index):'')+'<input class="scanner-perk-name" list="scanner-names" aria-label="Perk '+(index+1)+' name" value="'+DN.esc(perk.name)+'" />'+(!storage?'</div>':'')+nameMatchNote(perk)+'</label>'+
      '<label>Value %<input class="scanner-perk-value"'+(perk.inferred || perk.inferredFields?.includes('value')?' data-auto-inferred="true"':'')+' type="number" step="any" value="'+(perk.value??'')+'" /></label>'+
      '<label>Tier<select class="scanner-perk-tier"'+(specialTier?' disabled':'')+(perk.tier && perk.tierSource!=='manual'?' data-auto-inferred="true"':'')+'><option value="">'+(specialTier?'Not applicable':'Unknown')+'</option>'+['white','green','blue'].map(tier=>'<option value="'+tier+'"'+((perk.tier || perk.tierEvidence)===tier?' selected':'')+'>'+tier[0].toUpperCase()+tier.slice(1)+'</option>').join('')+'</select></label>'+ 
      (storage?'<label>Level /10<input class="scanner-perk-level"'+(perk.inferredFields?.includes('level')?' data-auto-inferred="true"':'')+' type="number" min="1" max="10" step="1" value="'+(perk.level??'')+'" /></label>'+ 
      '<details class="storage-range-edit"><summary>Range'+(perk.tier?' · '+DN.esc(perk.tier[0].toUpperCase()+perk.tier.slice(1))+' tier':'')+(perk.base!=null && perk.max!=null?' · '+perk.base+'% → '+perk.max+'%'+(['inferred-level','inferred-tier'].includes(perk.rangeSource)?' (inferred)':''):' · level needed')+'</summary><label>Base %<input class="scanner-perk-base" type="number" step="any" value="'+(perk.base??'')+'" /></label><label>Max %<input class="scanner-perk-max" type="number" step="any" value="'+(perk.max??'')+'" /></label></details>':'')+'<label>Reroll'+rerollMarkup(perk.rerollEligible,index)+'</label></div>').join('');
    if(el.accept)el.accept.disabled=false;
    autofillLockedLevels();
    highlightUnknownFields();
    const hall=get('correct-hall');
    if(hall)hall.value=['hall-colour','crafting-label','percentage-tier','manual'].includes(result?.hallSource)?result.hall:'';
  }
  function captureInput() {
    const source=latestCanvas,snapshot=document.createElement('canvas'),temporal=frames.snapshot(snapshot,source);
    let categorySource=null;
    const metadataPanel=!storage && el.layout.value==='text' && latestCategorySource?recognition.detectPanel(latestCategorySource) || categoryRegion:categoryRegion;
    const categoryRect=!storage?recognition.categoryRect(latestCategorySource,metadataPanel):null;
    if(categoryRect) {
      categorySource=document.createElement('canvas');const scale=Math.min(2,1800/categoryRect.width);
      categorySource.width=Math.round(categoryRect.width*scale);categorySource.height=Math.round(categoryRect.height*scale);
      categorySource.getContext('2d').drawImage(latestCategorySource,categoryRect.x,categoryRect.y,categoryRect.width,categoryRect.height,0,0,categorySource.width,categorySource.height);
      const context=categorySource.getContext('2d',{willReadFrequently:true}),pixels=context.getImageData(0,0,categorySource.width,categorySource.height);
      const coloured=(r,g,b)=>g>90 && g>r*1.25 && g>b*.8;
      let ink=0;for(let i=0;i<pixels.data.length;i+=4)if(coloured(pixels.data[i],pixels.data[i+1],pixels.data[i+2]))ink++;
      if(ink>=30) {
        for(let i=0;i<pixels.data.length;i+=4){const value=coloured(pixels.data[i],pixels.data[i+1],pixels.data[i+2])?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
        context.putImageData(pixels,0,0);
      }
    }
    let titleSource=null;
    if(categoryRect && metadataPanel && latestCategorySource) {
      const source=latestCategorySource;
      const left=Math.max(0,Math.floor(categoryRect.x-metadataPanel.width*source.width*.04));
      const top=Math.max(0,Math.floor((metadataPanel.y-metadataPanel.height*.65)*source.height));
      const right=Math.min(source.width,Math.ceil((metadataPanel.x+metadataPanel.width)*source.width));
      const bottom=Math.max(top,categoryRect.y-2);
      if(right>left && bottom>top) {
        titleSource=document.createElement('canvas');const scale=Math.min(2,1800/(right-left));
        titleSource.width=Math.round((right-left)*scale);titleSource.height=Math.round((bottom-top)*scale);
        const context=titleSource.getContext('2d',{willReadFrequently:true});
        context.drawImage(source,left,top,right-left,bottom-top,0,0,titleSource.width,titleSource.height);
        const pixels=context.getImageData(0,0,titleSource.width,titleSource.height);
        for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];const value=Math.min(r,g,b)>145 || g>90 && g>r*1.25 && g>b*1.05?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
        context.putImageData(pixels,0,0);
      }
    }
    const startingSource=!storage && liveCapture && window.DNCraftingResultContext?.enabled()?window.DNCraftingResultContext.capture(latestCategorySource,metadataPanel):null;
    return {snapshot,temporal,categorySource,titleSource,metadataPanel,startingSource,release(){snapshot.width=snapshot.height=0;if(categorySource)categorySource.width=categorySource.height=0;if(titleSource)titleSource.width=titleSource.height=0;if(startingSource)startingSource.width=startingSource.height=0;}};
  }
  function captureArtwork(metadataPanel) {
    // The crafting artwork sits immediately left of the gold benefits panel.
    // Keep only this small crop in memory, attached to the completed read.
    let artwork=itemArtwork;
    if(!storage && !artwork && latestCategorySource && metadataPanel) {
      const source=latestCategorySource,panel=metadataPanel;
      const box={x:(panel.x-panel.width*.48)*source.width,y:(panel.y+panel.height*.065)*source.height,width:panel.width*.45*source.width,height:panel.height*.85*source.height};
      if(box.x>=0 && box.y>=0 && box.x+box.width<=source.width && box.y+box.height<=source.height) {
        const picture=document.createElement('canvas');picture.width=240;picture.height=Math.max(1,Math.round(240*box.height/box.width));
        picture.getContext('2d').drawImage(source,box.x,box.y,box.width,box.height,0,0,picture.width,picture.height);
        artwork=picture.toDataURL('image/jpeg',.88);
      }
    }
    return artwork;
  }
  async function read({speculative=false}={}) {
    if(!ready || busy || !latestCanvas || inlineEditing)return;
    if(!storage && resultProfile && resultProfile!==window.DNStoredArtifacts?.collectionKey()){
      resultProfile=null;invalidate('Profile changed. Reading the current artifact again.');
    }
    const request=token,source=latestCanvas,readingProfile=window.DNStoredArtifacts?.collectionKey(),readingSession=session,readingItemId=itemId;
    const timing=stage=>{
      const point={stage,time:performance.now(),session:readingSession,itemId:readingItemId,request,source:serviceSource};
      try{window.DNScannerPerformance?.(point);}catch{}
      try{window.DNTelemetry?.scannerStage(point);}catch{}
    };
    timing(speculative?'speculation-start':'read-start');
    const input=captureInput(),{snapshot,categorySource,titleSource,metadataPanel}=input;
    let temporal=input.temporal,rerollObservations=null;
    const context=readContext(),witness=speculative?window.DNScannerFieldRecognition.witness(snapshot,latestFields,categorySource,context,undefined,titleSource):null;
    if(speculative && !witness){input.release();return;}
    let artwork=speculative?null:captureArtwork(metadataPanel);
    if(storage && el.layout.value==='storage') {
      const info=window.DNStorageRecognition.inspect(snapshot);
      const checkedType=manualStorageType(),hall=checkedType?(/^War /i.test(checkedType)?'war':'main'):info.hall;
      if(hall){el.hall.value=hall;window.DNPrimaryFilters?.setHall(hall);}
    }
    if(storage && window.DNScannerRerollRecognition) {
      const detect=(canvas,expectedRows)=>{
        const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
        if(latestFields?.template?.kind==='storage' && latestFields.template.rows.length===expectedRows && window.DNStorageRegions) {
          const resolved=window.DNStorageRegions.resolve(latestFields.template,{x:0,y:0,width:1,height:1},canvas);
          return latestFields.template.rows.map((_,i)=>resolved.valid && resolved.boxes[i+'-dice']?window.DNScannerRerollRecognition.classify(pixels,canvas.width,canvas.height,resolved.boxes[i+'-dice']):window.DNScannerRerollRecognition.unknown('uncalibrated-dice'));
        }
        return window.DNScannerRerollRecognition.detectStorage(pixels,canvas.width,canvas.height,{expectedRows,layout:el.layout.value});
      };
      // Freeze both possible layouts before awaiting category OCR. Only the
      // category-selected count may supply dice evidence to the resulting rows.
      rerollObservations={};
      for(const count of el.layout.value==='storage'?[5,6]:[rowCount()]) {
        const currentDice=detect(source,count),medianDice=detect(snapshot,count);
        rerollObservations[count]=currentDice.map((row,i)=>row.rerollEligible===medianDice[i]?.rerollEligible?row:
          {...row,rerollEligible:null,rerollConfidence:'unknown',rerollConflict:true,rerollEvidence:{reason:'transition'}});
      }
    }
    let previous=!storage && resultProfile!==readingProfile?null:resultCurrent?result:best;
    const knownTiers=(previous?.rows || []).map(row=>({...row,hall:previous?.artifact?.hall || previous?.hall || el.hall.value}));
    const job={snapshot,categorySource,speculative,witness,context,sampleRevision,timing};
    if(speculative)job.validation=new Promise(resolve=>{job.resolveValidation=resolve;});
    busy=job;attempts++;el.read.disabled=true;progress('reading','Reading · attempt '+attempts+(storage?' of 2':'')+' · keep this artifact open');say("Reading artifact locally…");
    resultCurrent=false;score();
    readHash=hash;
    const owner=engine || (engine=recognition.create({names,canonPerk}));
    let serviceOutcome='cancelled',serviceCalls=0,serviceInferences=0;
    try {
      timing('ocr-start');
      const parsed=await owner.recognize(snapshot,{expectedRows:Number(el.rows.value),layout:el.layout.value,hall:el.hall.value,manualType:storage?manualStorageType():null,inferColours:el.infer.checked,categorySource,titleSource,fields:latestFields?{...latestFields,panelSource:snapshot}:null,knownTiers,autoFit:!speculative,
        fieldReuse:!storage && !speculative?{epoch:JSON.stringify([session,itemId,fieldGeometry,request]),profile:readingProfile || DN.activeProfileId()}:null,
        isCurrent:()=>request===token && owner===engine && readingProfile===window.DNStoredArtifacts?.collectionKey() && !!latestCanvas && !job.discarded && (!speculative || context===readContext())});
      timing('ocr-end');
      serviceCalls=parsed.ocrCalls || 0;serviceInferences=(parsed.rows || []).filter(row=>row.inferred || row.assumed).length;
      if(speculative){
        if(!await job.validation)return;
        if(context!==readContext() || !liveCapture || document.hidden || editing || !(el.auto.checked || window.DNScannerCollection?.isEnabled()))return;
        temporal=job.approvedTemporal;artwork=job.artwork;
      }
      if(request!==token || owner!==engine || readingProfile!==window.DNStoredArtifacts?.collectionKey()){if(storage && latestCanvas && !editing)say(readingProfile!==window.DNStoredArtifacts?.collectionKey()?'Profile changed while reading. Read the current artifact again.':'Read cancelled because the watched fields changed. Check Field calibration and try Read Artifact again.');return;}
      if(storage && el.layout.value==='storage' && ![5,6].includes(parsed.expectedRows) && parsed.artifact?.type)parsed.expectedRows=window.DNStorageRecognition.rowsForType(parsed.artifact.type);
      if(storage && el.layout.value==='storage' && [5,6].includes(parsed.expectedRows)) {
        if(rowCount()!==parsed.expectedRows){el.rows.value=String(parsed.expectedRows);best=null;result=null;confirmed=false;}
        if(previous?.rows?.length!==parsed.expectedRows)previous=null;
      }
      if(rerollObservations)parsed.rows=parsed.rows.map((row,i)=>({...row,...rerollObservations[rowCount()]?.[i]}));
      parsed.rows=parsed.rows.map((row,i)=>{
        const prior=previous?.rows[i];
        return prior?.rerollSource==='manual' && prior.name===row.name && prior.value===row.value?{
          ...row,rerollEligible:prior.rerollEligible,rerollSource:'manual',rerollConfidence:prior.rerollConfidence}:row;
      });
      if(window.DNStoredArtifacts)parsed.rows=window.DNStoredArtifacts.backfillItem({hall:parsed.hall || el.hall.value,type:parsed.artifact?.type,freshCraft:!storage,rows:parsed.rows}).rows;
      if(window.DNArtifactStatContext)parsed.rows=window.DNArtifactStatContext.annotate(parsed,{freshCraft:!storage}).rows;
      window.DNScannerCalibration?.report(parsed.recognitionPath,parsed.calibrationReason);
      parsed.temporal=temporal;
      const useful=recognition.coverage(parsed.rows,rowCount()).total;
      if(!storage)best=recognition.retainCraftRead(previous,parsed,rowCount(),{sameEncounter:true});
      else if(!best)best=parsed;
      else if(best.hall && parsed.hall && best.hall!==parsed.hall)best=parsed;
      else if(!best.valid)best=recognition.combineReads(best,parsed,rowCount());
      if(best!==parsed)best={...best,rows:best.rows.map((row,i)=>row.name===parsed.rows[i]?.name?{
        ...row,rerollEligible:parsed.rows[i].rerollEligible,rerollSource:parsed.rows[i].rerollSource,
        rerollConfidence:parsed.rows[i].rerollConfidence,rerollEvidence:parsed.rows[i].rerollEvidence,
        rerollConflict:parsed.rows[i].rerollConflict}:row)};
      if(useful===0 && !parsed.rows.some(row=>row.known) && !best?.rows.some(row=>row.known))best=null;
      if(parsed.unlocked?.count===3)best={...(best || parsed),unlocked:parsed.unlocked};
      result=best;resultProfile=readingProfile;confirmed=!!result?.valid;resultCurrent=true;editing=false;
      if(!storage && result?.hall && result.hall!==el.hall.value){el.hall.value=result.hall;window.DNPrimaryFilters?.setHall(result.hall);}
      if(storage && result){result=applyStorageName(result);best=result;}
      if(!storage && result){
        itemArtwork=artwork;
        const incoming=parsed.artifact?.nameEvidence,held=result.artifact?.nameEvidence;
        result.artifact={...result.artifact,image:artwork,...(!result.artifact?.name && parsed.artifact?.name?{name:parsed.artifact.name}:{}),
          ...(incoming && (!held || (incoming.confidence ?? -1)>=(held.confidence ?? -1))?{nameEvidence:incoming}:{})};
        const logged=window.DNScannerCollection?.itemForEncounter?.(JSON.stringify([session,itemId]),resultProfile);
        if(logged?.nameSource==='manual')result.artifact={...result.artifact,name:logged.name,nameSource:'manual'};
        result.artifact.name=recognition.cleanArtifactName(result.artifact.name) || null;
      }
      el.warnings.textContent=(result?.warnings || parsed.warnings).join(" ");
      if(!confirmed && result)el.warnings.textContent+=' Verify inferred values and unclear names in Correct Recognition.';
      const recognized=result?.rows?.some(row=>row.known && !row.assumed);
      settled=confirmed || (storage?attempts>=2 || useful===0:!recognized) || (!el.auto.checked && !window.DNScannerCollection?.isEnabled());
      parsed.presentation={attempt:attempts,finished:settled,coverage:recognition.coverage(result?.rows || [],rowCount()),rows:result?.rows || [],temporal:result?.temporal || temporal};
      const logOptions={scannerSource:storage?'storage':'crafting',expectedRows:rowCount(),continuous:true,newEncounter:itemBoundary,steadyState:!storage,profileKey:readingProfile,encounterId:JSON.stringify([session,itemId]),captureMethod:liveCapture?'live-capture':'local-image',identityEvidence:liveCapture && itemBoundary && observedPanel?'observed-transition':'ambiguous'};
      const publish=()=>{
        if(result?.rows?.length){itemBoundary=false;observedPanel=true;}
        progress(settled?'finished':'reading',settled?'Finished · '+recognition.coverage(result?.rows || [],rowCount()).total+'/'+rowCount()+' · '+(confirmed?'ready to move on':result?'best read · review or move on':'nothing useful in view'):'Improving the read · keeping these rows visible');
        say(confirmed?"Visible perks read. Check the values before making a game decision.":"Recognition needs correction; no rating confirmed.");
        // The score and comparison take the first paint. Building editable
        // controls can follow, without delaying log persistence or Keep data.
        score();
        const publishedResult=result;
        const details=()=>{
          if(request!==token || owner!==engine || result!==publishedResult || !resultCurrent || editing)return;
          showCorrection();timing('details-published');
        };
        const raf=!storage && window.requestAnimationFrame?.bind(window);
        if(raf && !document.hidden){el.correct.textContent='';if(el.accept)el.accept.disabled=true;raf(()=>raf(details));}
        else details();
        timing('published');
      };
      const collection=window.DNScannerCollection;
      const artworkResult=result,artworkImage=result?.artifact?.image;
      if(artworkImage && window.DNArtwork)window.DNArtwork.match(artworkImage).then(match=>{
        if(!match.artworkId || request!==token || result!==artworkResult || !resultCurrent || session!==readingSession || itemId!==readingItemId || readingProfile!==window.DNStoredArtifacts?.collectionKey() || inlineEditing || editing || result.artifact?.image!==artworkImage)return;
        result.artifact={...result.artifact,artworkId:match.artworkId};
        window.DNScannerCollection?.recordItem(result,readingItemId,{...logOptions,newEncounter:false});
        score();
      }).catch(()=>{});
      if(collection?.recordResult)collection.recordResult(parsed,result,itemId,logOptions,publish);
      else {
        collection?.record(parsed);
        collection?.recordItem(result,itemId,logOptions);
        publish();
      }
      serviceOutcome=confirmed?'complete':'partial';
      const startingSource=speculative?job.startingSource:input.startingSource;
      if(startingSource && request===token && owner===engine) {
        const logged=collection?.itemForEncounter?.(logOptions.encounterId,readingProfile);
        if(logged && logged.startingContextSource!=='craft-result-controls-v1')window.DNCraftingResultContext?.observe(startingSource,logged.id,logged.revision);
      }
      observeServices(result || {rows:[]},{original:parsed});
    } catch (error) {
      if(request!==token || owner!==engine)return;
      if(speculative && !job.approved){
        // An early failure is not a failed settled read. Preserve the warm
        // worker on input rejection; actual worker errors get a clean retry.
        if(!job.discarded && context===readContext()){engine=null;owner.close().catch(()=>{});}
        discardSpeculation('early read failed');return;
      }
      serviceOutcome='failed';
      try{window.DNTelemetry?.exception(error,'scanner-read-failed');}catch{}
      if(request===token && owner===engine){confirmed=false;resultCurrent=false;settled=true;progress('finished','Finished · read failed · retained last capture');say('Could not read this artifact: '+(error?.message || 'unknown recognition error')+'. Check the crop or Field calibration and retry.');score();showCorrection();}
      if(owner===engine){engine=null;owner.close().catch(()=>{});}
    } finally {
      try{window.DNTelemetry?.scannerFinished({source:serviceSource,outcome:serviceOutcome,time:performance.now(),session:readingSession,itemId:readingItemId,request,workerCalls:serviceCalls,inferredCount:serviceInferences});}catch{}
      input.release();job.witness=null;
      if(job.startingSource)job.startingSource.width=job.startingSource.height=0;
      if(busy===job){
        if(speculative && !job.approved && request===token){attempts=0;readHash=null;settled=false;}
        busy=null;el.read.disabled=!ready || !latestCanvas;
        if(storageTypeReread && latestCanvas && !editing){storageTypeReread=false;startRead();}
        else if(!settled && !editing && latestCanvas && !speculate())schedule(storage?350:request!==token || speculative && !job.approved?Math.max(0,settleDelay-(performance.now()-stableSince)):attempts<2?150:500);
      }
    }
  }
  function startRead(options) {
    return read(options).catch(error=>{
      try{window.DNTelemetry?.event('capture_failed',{reason:'read-setup-failed'});}catch{}
      confirmed=false;resultCurrent=false;settled=true;busy=null;el.read.disabled=!ready || !latestCanvas;
      progress('finished','Read failed · check the message below');
      say('Could not start reading: '+(error?.message || 'unknown capture error')+'. Check the selected dialog and Field calibration.');
      window.DNStorageScanner?.update(null,false);
    });
  }
  el.read.addEventListener("click",()=>{if(inlineEditing)return;editing=false;attempts=0;settled=false;if(storage)best=null;return startRead();});
  function autofillCraftingRow(target) {
    if(storage)return;
    const field=target?.closest?.('.scanner-edit-row');
    if(!field)return;
    if(target.dataset)delete target.dataset.autoInferred;
    const tier=field.querySelector('.scanner-perk-tier'),value=field.querySelector('.scanner-perk-value'),name=field.querySelector('.scanner-perk-name');
    if(!tier || !value || !name)return;
    const bases=window.DNStoredArtifacts?.tierBases({hall:result?.hall || el.hall.value,type:result?.artifact?.type,crafting:true});
    if(!bases)return;
    const tiers=['white','green','blue'],sign=names.includes(canonPerk(name.value.trim()))?DN.expectedPerkSign(canonPerk(name.value.trim())):null;
    if(target!==value && (value.value.trim()==='' || value.dataset?.autoInferred==='true') && tiers.includes(tier.value) && (sign===1 || sign===-1)) {
      value.value=String(sign*bases[tiers.indexOf(tier.value)]);
      if(value.dataset)value.dataset.autoInferred='true';
      value.title='Inferred from tier at level 1. Verify before applying.';
    }else if(target!==tier && (tier.value==='' || tier.dataset?.autoInferred==='true') && value.value.trim()!=='' && bases.includes(Math.abs(Number(value.value)))) {
      tier.value=tiers[bases.indexOf(Math.abs(Number(value.value)))];
      if(tier.dataset)tier.dataset.autoInferred='true';
    }
  }
  function autofillEditedRow(target) {
    const field=target?.closest?.('.scanner-edit-row');
    if(!storage || !field || !window.DNStoredArtifacts)return;
    if(target.dataset)delete target.dataset.autoInferred;
    target.title='';
    const inputs=Object.fromEntries(['tier','value','level','name','base','max'].map(key=>[key,field.querySelector('.scanner-perk-'+key)]));
    if(!inputs.tier || !inputs.value || !inputs.level)return;
    const context={hall:el.hall.value,type:document.getElementById('storage-type')?.value || result?.artifact?.type};
    const bases=window.DNStoredArtifacts.tierBases(context) || [];
    const tiers=['white','green','blue'];
    const number=input=>input.value.trim()===''?null:Number(input.value);
    const name=canonPerk(inputs.name.value.trim()),sign=names.includes(name)?DN.expectedPerkSign(name):null;
    const candidates=['value','level','tier'].filter(key=>inputs[key]!==target &&
      (inputs[key].value.trim()==='' || inputs[key].dataset?.autoInferred==='true'));
    candidates.sort((a,b)=>Number(inputs[a].value!=='')-Number(inputs[b].value!==''));
    for(const key of candidates) {
      const value=number(inputs.value),level=number(inputs.level),base=bases[tiers.indexOf(inputs.tier.value)];
      let inferred=null;
      if(key==='value' && base!=null && Number.isInteger(level) && level>=1 && level<=10 && (sign===1 || sign===-1))inferred=sign*(base+level-1);
      if(key==='level' && base!=null && Number.isFinite(value)) {
        const next=Math.abs(value)-base+1;
        if(Number.isInteger(next) && next>=1 && next<=10)inferred=next;
      }
      if(key==='tier' && Number.isFinite(value) && Number.isInteger(level) && level>=1 && level<=10) {
        inferred=tiers[bases.indexOf(Math.abs(value)-(level-1))] || null;
      }
      if(inferred!=null) {
        inputs[key].value=String(inferred);
        if(inputs[key].dataset)inputs[key].dataset.autoInferred='true';
        inputs[key].title='Inferred from the other two fields.';
        break;
      }
    }
    const range=window.DNStoredArtifacts.impliedRange({value:number(inputs.value),level:number(inputs.level)});
    const index=[...el.correct.querySelectorAll('.scanner-edit-row')].indexOf(field),prior=result?.rows[index];
    const automatic=inputs.base && inputs.max && (inputs.base.value==='' && inputs.max.value==='' ||
      inputs.base.dataset?.autoInferred==='true' && inputs.max.dataset?.autoInferred==='true' ||
      ['inferred-level','inferred-tier'].includes(prior?.rangeSource) &&
      number(inputs.base)===prior.base && number(inputs.max)===prior.max);
    if(automatic) {
      for(const key of ['base','max']) {
        inputs[key].value=range?String(range[key]):'';
        if(inputs[key].dataset)inputs[key].dataset.autoInferred='true';
      }
    }
  }
  el.correct.addEventListener("input",event=>{
    if(!storage && event?.target?.dataset)event.target.dataset.manual='true';
    autofillCraftingRow(event?.target);
    autofillEditedRow(event?.target);
    autofillLockedLevels();
    highlightUnknownFields();
    if(storage) {
      if(!latestCanvas || !ready || !resultCurrent)return;
      const field=event?.target?.closest?.('.scanner-edit-row'),index=[...el.correct.querySelectorAll('.scanner-edit-row')].indexOf(field);
      if(index>=0) {
        if(!storageEdits.has(index))storageEdits.set(index,new Set());
        const key=['name','value','level','tier','base','max','unlocked','reroll'].find(key=>event.target.classList?.contains('scanner-perk-'+key));
        storageEdits.get(index).add(key);
      } else if(!event?.target || event.target===el.correct)for(let i=0;i<rowCount();i++)storageEdits.set(i,new Set(['name','value','level','tier','base','max','unlocked','reroll']));
      applyCorrections(true);return;
    }
    token++;editing=true;confirmed=false;progress('finished','Finished · your corrections are pending');score();say("Corrections pending; rating is unconfirmed.");
  });
  el.correct.addEventListener('click',event=>{
    const dice=event.target.closest?.('.scanner-perk-reroll');
    if(dice) {cycleReroll(dice);dice.dispatchEvent(new Event('input',{bubbles:true}));return;}
    const button=event.target.closest?.('.scanner-perk-unlocked');
    if(!button)return;
    const index=[...el.correct.querySelectorAll('.scanner-edit-row')].indexOf(button.closest('.scanner-edit-row'));
    syncStar(button,button.value!=='true',index);
    button.dispatchEvent(new Event('input',{bubbles:true}));
  });
  el.result.addEventListener('click',event=>{
    if(storage)return;
    const dice=event.target.closest?.('.scanner-perk-reroll');
    if(dice && resultCurrent && latestCanvas) {
      const edit=el.correct.querySelectorAll('.scanner-edit-row')[Number(dice.dataset.rowIndex)]?.querySelector('.scanner-perk-reroll');
      cycleReroll(edit);edit?.dispatchEvent(new Event('input',{bubbles:true}));applyCorrections(true);if(!inlineEditing){editing=false;score();}return;
    }
    const button=event.target.closest?.('.scanner-perk-unlocked');
    if(!button || !resultCurrent || !latestCanvas)return;
    const edit=el.correct.querySelectorAll('.scanner-edit-row')[Number(button.dataset.rowIndex)]?.querySelector('.scanner-perk-unlocked');
    if(!edit)return;
    syncStar(edit,button.value!=='true',Number(button.dataset.rowIndex));
    edit.dispatchEvent(new Event('input',{bubbles:true}));
    applyCorrections(true);if(!inlineEditing){editing=false;score();}
    el.result.querySelector?.('.scanner-perk-unlocked[data-row-index="'+button.dataset.rowIndex+'"]')?.focus();
  });
  el.result.addEventListener('keydown',event=>{
    if(event.key==='Enter' && event.target.closest?.('[data-inline-field]'))event.preventDefault();
  });
  el.result.addEventListener('input',event=>{
    const field=event.target.closest?.('[data-inline-field]');if(!inlineEditing || !field)return;
    if(field.dataset.inlineField==='artifact'){
      const name=recognition.cleanArtifactName(field.textContent).slice(0,160);
      result={...result,artifact:{...result.artifact,name:name || null,nameSource:'manual'}};best=result;
      const logged=window.DNScannerCollection?.itemForEncounter?.(JSON.stringify([session,itemId]),resultProfile);
      if(logged)window.DNScannerCollection.setName?.(logged.id,name);
      score();observeServices(result,{corrected:true});return;
    }
    const index=Number(field.dataset.inlineRow),kind=field.dataset.inlineField;
    const input=el.correct.querySelectorAll('.scanner-edit-row')[index]?.querySelector('.scanner-perk-'+kind);if(!input)return;
    const text=field.textContent.replace(kind==='value'?/%/g:/\s+/g,kind==='value'?'':' ').trim();
    input.value=kind==='value' && text!=='' && Number.isFinite(Number(text))?String(Number(text)):text;
    if(kind==='value' && input.value===''){
      const tier=el.correct.querySelectorAll('.scanner-edit-row')[index]?.querySelector('.scanner-perk-tier');if(tier)tier.value='';
    }
    input.dataset.manual='true';delete input.dataset.autoInferred;
    input.dispatchEvent(new Event('input',{bubbles:true}));applyCorrections(true);
    const valid=kind==='name'?names.includes(canonPerk(input.value)):input.value!=='' && Number.isFinite(Number(input.value)) && Math.abs(Number(input.value))<=40 && !result?.rows[index]?.tierConflict && !recognition.signIssues([result?.rows[index] || {}]).length;
    field.setAttribute('aria-invalid',String(!valid));field.title=valid?'':el.warnings.textContent;
  });
  function setInlineEditing(enabled) {
    if(storage)return false;
    if(enabled){
      if(!resultCurrent && displayedCapture && itemId===displayedItemId){result=displayedCapture;resultCurrent=true;confirmed=!!result.valid;}
      if(!result || !resultCurrent || !latestCanvas)return false;
      inlineEditing=true;editing=true;token++;clearTimeout(stableTimer);stableTimer=null;discardSpeculation('manual editing');showCorrection();score();
    } else {
      inlineEditing=false;editing=false;best=result;settled=confirmed;readHash=confirmed?readHash:null;
      const pending=deferredFrame;deferredFrame=null;score();
      if(pending)update(pending.canvas,pending.state);
      if(!settled && latestCanvas)schedule();
    }
    return true;
  }
  function corrections(automatic=false) {
    let rows=[...el.correct.querySelectorAll(".scanner-edit-row")].map((row,rowsIndex)=>{
      const name=canonPerk(row.querySelector(".scanner-perk-name").value.trim());
      const raw=row.querySelector(".scanner-perk-value").value.trim();
      const level=storage?row.querySelector('.scanner-perk-level').value.trim():'';
      const starInput=row.querySelector('.scanner-perk-unlocked');
      const star=starInput?.value || '';
      const base=storage?row.querySelector('.scanner-perk-base')?.value.trim() || '':'';
      const max=storage?row.querySelector('.scanner-perk-max')?.value.trim() || '':'';
      const next={...result?.rows[rowsIndex],name,value:raw===''?null:Number(raw),known:names.includes(name),
        ...(storage?{level:level===''?null:Number(level),unlocked:star===''?null:star==='true',base:base===''?null:Number(base),max:max===''?null:Number(max)}:{unlocked:starInput?.tagName==='BUTTON'?star===''?null:star==='true':result?.rows[rowsIndex]?.unlocked}),
        raw:result?.rows[rowsIndex]?.raw || '',hasPercent:true,assumed:false,inferred:false,conflict:false};
      const original=result?.rows[rowsIndex];
      next.nameSource=name!==original?.name || row.querySelector('.scanner-perk-name')?.dataset?.manual==='true' || storageEdits.get(rowsIndex)?.has('name')?'manual':original?.nameSource;
      if(!storage) {
        const prior=result?.rows[rowsIndex];
        const manual=key=>row.querySelector('.scanner-perk-'+key)?.dataset?.manual==='true';
        next.nameSource=manual('name') || name!==prior?.name || prior?.assumed?'manual':prior?.nameSource;
        next.unlockedSource=manual('unlocked') || next.unlocked!==prior?.unlocked?'manual':prior?.unlockedSource;
        const inferred=row.querySelector('.scanner-perk-value')?.dataset?.autoInferred==='true' || !manual('value') && next.value===prior?.value && prior?.inferred;
        next.inferred=!!inferred;
        next.inferredFields=inferred?['value']:[];
        next.valueSource=inferred?'tier-level':manual('value') || next.value!==prior?.value || prior?.conflict?'manual':prior?.valueSource;
        if(automatic) {
          next.assumed=!!prior?.assumed && !manual('name') && name===prior?.name;
          next.conflict=!!prior?.conflict && !manual('name') && !manual('value') && name===prior?.name && next.value===prior?.value;
        }
      }
      if(storage && automatic) {
        const touched=storageEdits.get(rowsIndex),prior=result?.rows[rowsIndex];
        if(!touched)return {...prior};
        next.assumed=!!prior?.assumed && !touched.has('name');
        next.conflict=!!prior?.conflict && !touched.has('name') && !touched.has('value');
      }
      const dice=row.querySelector('.scanner-perk-reroll');
      if(dice?.tagName==='BUTTON') {
        next.rerollEligible=dice.value===''?null:dice.value==='true';
        if(dice.dataset.manual==='true'){next.rerollCaptureExpected=next.rerollCaptureExpected || next.rerollSource==='dice-background';next.rerollSource='manual';next.rerollConfidence=next.rerollEligible==null?'unknown':'high';next.rerollConflict=false;}
      }
      if(storage) {
        next.inferredFields=['value','level','tier'].filter(key=>row.querySelector('.scanner-perk-'+key)?.dataset?.autoInferred==='true');
        next.inferred=next.inferredFields.includes('value');
        next.valueSource=next.inferred?'tier-level':null;
      }
      if(storage)next.levelSource=next.level!=null?next.unlocked===false?'locked-star':next.inferredFields.includes('level')?'tier-percentage':'manual':null;
      if(storage) {
        next.tier=null;next.tierSource=null;next.tierConflict=false;
        const tier=row.querySelector('.scanner-perk-tier')?.value;
        if(['white','green','blue'].includes(tier)) {
          const prior=result?.rows[rowsIndex];
          const changed=tier!==(prior?.tier || prior?.tierEvidence);
          next.tier=tier;next.tierSource=changed?'manual':prior?.tierSource || null;
          next.tierEvidence=changed || prior?.tierSource==='manual'?tier:prior?.tierEvidence || null;
          if(row.querySelector('.scanner-perk-tier')?.dataset?.autoInferred==='true') {
            next.tierSource='percentage-level';next.tierEvidence=null;
          }
        }else next.tierEvidence=null;
        const prior=result?.rows[rowsIndex],range=window.DNStoredArtifacts?.impliedRange(next);
        const endpointsUnchanged=next.base===prior?.base && next.max===prior?.max;
        const valueOrLevelChanged=next.value!==prior?.value || next.level!==prior?.level;
        const liveRange=row.querySelector('.scanner-perk-base')?.dataset?.autoInferred==='true' && row.querySelector('.scanner-perk-max')?.dataset?.autoInferred==='true';
        const automatic=liveRange || next.base==null && next.max==null || endpointsUnchanged &&
          (['inferred-level','inferred-tier'].includes(prior?.rangeSource) || valueOrLevelChanged);
        if(automatic)return {...next,base:range?.base ?? null,max:range?.max ?? null,rangeSource:range?'inferred-level':null};
        if(next.base!==prior?.base || next.max!==prior?.max)next.rangeSource='manual';
      }else if(window.DNStoredArtifacts) {
        const tierInput=row.querySelector('.scanner-perk-tier'),tier=tierInput?.value;
        const context={hall:result?.hall || el.hall.value,type:result?.artifact?.type,crafting:true};
        const bases=window.DNStoredArtifacts.tierBases(context),tiers=['white','green','blue'];
        const selected=tiers.includes(tier),inferred=next.inferred || next.value==null && selected;
        if(selected || next.value!==result?.rows[rowsIndex]?.value || result?.rows[rowsIndex]?.tierConflict)next.tierSource='manual';
        if(next.value==null && selected && bases && next.known) {
          const sign=DN.expectedPerkSign(next.name);
          if(sign===1 || sign===-1)next.value=sign*bases[tiers.indexOf(tier)];
        }
        const resolved=window.DNStoredArtifacts.craftingTier(next,context);
        if(selected && bases && Number.isFinite(next.value) && Math.abs(next.value)!==bases[tiers.indexOf(tier)])return {...resolved,tierConflict:true};
        return {...resolved,...(inferred?{inferred:true,valueSource:'tier-level',inferredFields:['value']}:{} )};
      }
      return next;
    });
    const fields=[...el.correct.querySelectorAll('.scanner-edit-row')];
    if(storage && window.DNStoredArtifacts)rows=window.DNStoredArtifacts.backfillItem({hall:el.hall.value,type:document.getElementById('storage-type')?.value || result?.artifact?.type,rows}).rows;
    fields.forEach((field,index)=>field.querySelector('.scanner-perk-name')?.setAttribute?.('aria-invalid',String(!rows[index].known)));
    const unknown=rows.findIndex(row=>!row.known || automatic && row.assumed),missing=rows.findIndex(row=>row.value===null || !Number.isFinite(row.value));
    const outOfRange=rows.findIndex(row=>Number.isFinite(row.value) && Math.abs(row.value)>40);
    if(outOfRange>=0)return {rows,error:'Row '+(outOfRange+1)+': percentage must be between -40% and +40%.'};
    if(storage && unknown>=0)return {rows,error:'Row '+(unknown+1)+': "'+rows[unknown].name+'" is not a known perk. Choose a name from the suggestions.'};
    if(storage && missing>=0)return {rows,error:'Row '+(missing+1)+': enter a numeric percentage.'};
    if(storage && rows.some(row=>row.conflict))return {rows,error:'Resolve the conflicting stat readings before saving.'};
    if(rows.length!==Number(el.rows.value) || unknown>=0 || missing>=0)return {rows,error:"Each visible row needs a known perk and a numeric value. Expected row count must match."};
    if(storage && rows.some(row=>row.level!=null && (!Number.isInteger(row.level) || row.level<1 || row.level>10)))return {rows,error:'Levels must be whole numbers from 1 to 10, or blank if unclear.'};
    if(storage && rows.some(row=>[row.base,row.max].some(value=>value!=null && !Number.isFinite(value)) ||
      (row.base!=null && row.max!=null && (row.value<Math.min(row.base,row.max) || row.value>Math.max(row.base,row.max)))))return {rows,error:'Base and max must be numeric, and the current value must be within their range. Leave unclear endpoints blank.'};
    const signWarnings=recognition.signIssues(rows);
    if(storage && window.DNStoredArtifacts) {
      rows=window.DNStoredArtifacts.backfillItem({hall:el.hall.value,type:document.getElementById('storage-type')?.value || result?.artifact?.type,rows}).rows;
      if(rows.some(row=>row.tierConflict))return {rows,error:'Percentage and upgrade level conflict with this tier. Correct or clear the unclear level.'};
    }
    if(!storage && rows.some(row=>row.tierConflict))return {rows,error:'Tier and starting percentage conflict. Check the tier or percentage.'};
    return {rows,error:signWarnings.join(' ')};
  }
  function applyCorrections(automatic=false) {
    if(!latestCanvas || !ready || automatic && !resultCurrent)return;
    const {rows,error}=corrections(automatic);
    if(error){
      if(automatic){token++;result={...result,rows,valid:false};editing=true;confirmed=false;progress('finished','Finished · complete the remaining fields');score();}
      el.warnings.textContent=error;const status=get('correction-status');if(status)status.textContent=error;return;
    }
    const warnings=automatic?(result?.warnings || []).filter(w=>{const row=/^Row (\d+):/.exec(w);return row?!storageEdits.has(Number(row[1])-1):/conflict|disagree/i.test(w) && storageEdits.size<rowCount();}):[];
    const correctedFields=rows.reduce((count,row,index)=>count+['name','value','tier','level','unlocked','rerollEligible'].filter(key=>row[key]!==result?.rows[index]?.[key]).length,0);
    token++;result={...result,rows,warnings,valid:true,colours:result?.colours,hall:result?.hall,unlocked:result?.unlocked};confirmed=true;resultCurrent=true;editing=true;
    const states=rows.map(r=>r.unlocked);result.unlocked={states,count:states.every(s=>s!==null)?states.filter(Boolean).length:null,method:'verified'};if(!automatic)showCorrection();
    settled=true;progress('finished','Finished · using your verified corrections');
    window.DNScannerCollection?.recordItem({...result,hall:result.hall || el.hall.value},itemId,{corrected:true,expectedRows:rowCount(),continuous:true,steadyState:!storage,profileKey:resultProfile,encounterId:JSON.stringify([session,itemId])});
    el.warnings.textContent=warnings.join(' ');say(storage?"Edits applied. Complete items save automatically.":"Using your verified values. The current item log is updated when logging is enabled.");highlightUnknownFields();score();
    observeServices(result,{corrected:true});
    if(correctedFields)try{window.DNTelemetry?.event('scanner_fields_corrected',{source:serviceSource,count:correctedFields},true);}catch{}
  }
  el.accept?.addEventListener("click",()=>applyCorrections());
  function setStorageName(name) {
    if(!storage || !result || !latestCanvas || resultProfile!==window.DNStoredArtifacts?.collectionKey())return false;
    storageNameOverride={name:String(name ?? ''),session,itemId,profileKey:resultProfile};
    result=applyStorageName(result);if(best)best=applyStorageName(best);score();return true;
  }
  function setStorageType(type) {
    if(!storage || !window.DNStorageRecognition.types.includes(type))return false;
    storageTypeOverride={type,session,itemId,profileKey:window.DNStoredArtifacts?.collectionKey()};
    token++;clearTimeout(stableTimer);stableTimer=null;readHash=null;attempts=0;settled=false;editing=false;confirmed=false;
    const count=window.DNStorageRecognition.rowsForType(type),hall=/^War /i.test(type)?'war':'main';
    el.rows.value=String(count);el.hall.value=hall;
    if(result && resultProfile===window.DNStoredArtifacts?.collectionKey()) {
      // A different layout invalidates every crop, not only the last row.
      // Never merge or save five-row observations as a six-row read.
      result={rows:[],warnings:[],expectedRows:count,hall,artifact:{...result.artifact,type,hall,typeSource:'manual'},valid:false};resultCurrent=false;
      best=null;showCorrection();score();
    }else showCorrection();
    storageTypeReread=!!latestCanvas;
    if(storageTypeReread && !busy){storageTypeReread=false;startRead();}
    return true;
  }
  get('correct-hall')?.addEventListener('change',()=>{
    const hall=get('correct-hall').value;
    if(!resultCurrent || !result)return;
    const selected=['main','war'].includes(hall);
    token++;result={...result,hall:selected?hall:result.hall,hallSource:selected?'manual':'selected-hall',artifact:{...result.artifact,...(selected?{hall}:{})}};
    if(selected){el.hall.value=hall;window.DNPrimaryFilters?.setHall(hall);}score();
    observeServices(result);
  });
  get('capture-review')?.addEventListener('click',()=>{
    const details=get('corrections');if(!details)return;
    details.open=true;
    const missing=window.DNScannerComparison?.identification().missing[0];
    const match=/^Row (\d+) (name|percentage|star|reroll)$/.exec(missing || '');
    const selector={name:'name',percentage:'value',star:'unlocked',reroll:'reroll'};
    const target=match?el.correct.querySelectorAll('.scanner-edit-row')[Number(match[1])-1]?.querySelector('.scanner-perk-'+selector[match[2]]):get(missing==='Hall'?'correct-hall':'compare-type');
    target?.focus();details.scrollIntoView({block:'nearest'});
  });
  for(const input of [el.layout,el.rows,el.hall,el.infer])input.addEventListener("change",()=>{editing=false;readHash=null;invalidate("Recognition settings changed. Read the artifact again.");showCorrection();});
  for(const input of [el.off,el.def])input.addEventListener("change",score);
  get('compare-type')?.addEventListener('change',()=>{
    highlightUnknownFields();
    if(resultCurrent && result)observeServices({...result,artifact:{...result.artifact,type:get('compare-type').value || result.artifact?.type}});
  });
  for(const event of ['focus','storage','dn-strategies-changed'])window.addEventListener(event,()=>{ratingContext=null;if(ready)score();});
  window.addEventListener('dn-scanner-target-focus-changed',()=>{if(ready)score();});
  window.addEventListener('dn-scanner-target-edit-changed',()=>{if(ready)score();});
  window.DNScannerReading={update,reset,invalidate,setInlineEditing,setStorageType,setStorageName};
  score();
  (async()=>{
    try {
      const [mapping,defaults]=await Promise.all([fetch("./data/perk_name_mapping.csv"),fetch("./data/perk_rating_defaults.json")]);
      if(!mapping.ok || !defaults.ok)throw new Error("ratings unavailable");
      canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await mapping.text()));factory=await defaults.json();names=Object.keys(factory);
      window.DNCraftingPurposes?.setDefaults(factory, canonPerk);
      el.names.innerHTML=names.map(name=>'<option value="'+DN.esc(name)+'"></option>').join('');
      options();ready=true;el.read.disabled=!latestCanvas;showCorrection();say("Select a region to read all visible perks.");
      score();
      if(latestCanvas)update(latestCanvas,{session,current:true});
    } catch {say("Could not load perk ratings. Reload this page through the local server.");}
  })();
})();
