/* Seven labelled snippets of actual War gameplay: production Connect/capture,
 * temporal filtering, recognition, retention and scoring. No simulated OCR. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,timeout=15000)=>{const until=performance.now()+timeout;while(!fn()){if(performance.now()>until)throw Error('War video wait timed out');await pause(15);}};
  await wait(()=>get('names').children.length);
  const labels=await(await fetch('../tests/scanner/video/war-2026-10-28.json')).json();
  if(window.DNWarVideoTimes)labels.cases=labels.cases.filter(label=>window.DNWarVideoTimes.includes(label.time));
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const inputs=[],workerFactory=window.Tesseract.createWorker;
  if(window.DNWarVideoInputs)window.Tesseract.createWorker=async(...args)=>{const worker=await workerFactory(...args),recognize=worker.recognize.bind(worker);worker.recognize=async(input,...rest)=>{if(input?.toDataURL && inputs.length<24)inputs.push(input.toDataURL('image/png').split(',')[1]);return recognize(input,...rest);};return worker;};
  const names=Array.from(get('names').children,option=>option.value),create=DNScannerRecognition.create,engine=create({names,canonPerk});
  await engine.warm({fast:true});await engine.warm({fast:false});
  const source=document.createElement('canvas');source.width=labels.roi.width;source.height=labels.roi.height;const ctx=source.getContext('2d');
  const video=document.createElement('video');video.muted=true;video.preload='auto';video.src='/__war_recording';
  await wait(()=>video.readyState>=2);
  const runs=[],staticRuns=[];let pending=null,lastResult=null,recognized=null;
  const summarize=result=>result?{valid:result.valid,hall:result.hall,type:result.artifact?.type,title:result.artifact?.name,unlocked:result.unlocked?.count,path:result.recognitionPath,colours:result.colours,
    rows:result.rows?.map(row=>({name:row.name,value:row.value,confidence:row.confidence,inferred:row.inferred,assumed:row.assumed,conflict:row.conflict,tierConflict:row.tierConflict})),warnings:result.warnings}:null;
  const recognize=engine.recognize.bind(engine);
  engine.recognize=async(...args)=>{const item=pending;if(item){item.jobs++;item.geometry={width:args[0].width,height:args[0].height,panel:args[1]?.fields?.panel};}try{const result=await recognize(...args);if(pending===item)recognized={...summarize(result),observations:result.valid?undefined:result.observations};return result;}catch(error){if(item?.cancellations?.length<12)item.cancellations.push(error.message);throw error;}};
  const invalidate=DNScannerReading.invalidate,update=DNScannerReading.update;
  DNScannerReading.invalidate=function(message,...args){if(pending?.invalidations?.length<12)pending.invalidations.push(message);return invalidate.call(this,message,...args);};
  DNScannerReading.update=function(canvas,state){if(pending){const key=JSON.stringify(state.fields?.panel);if(pending.lastGeometry && pending.lastGeometry!==key)pending.geometryChanges++;pending.lastGeometry=key;
    const sig=DNScannerFieldRecognition.warSignature?.(canvas,state.fields);if(sig && pending.signatureDeltas.length<40){const compare=other=>other?.length===sig.length?sig.filter((value,i)=>Math.abs(value-other[i])>1).length/sig.length:1;pending.signatureDeltas.push({adjacent:compare(pending.lastSignature),anchor:compare(pending.firstSignature),hall:DNScannerRecognition.hallColour(canvas,{banner:true})});pending.firstSignature ||=sig;pending.lastSignature=sig;}}
    return update.call(this,canvas,state);};
  DNScannerRecognition.create=()=>engine;
  const compare=DNScannerComparison.update;
  DNScannerComparison.update=function(...args){const answer=compare.apply(this,args),result=args[3]?.captureResult || args[0];
    if(pending && result?.rows?.length){
      lastResult=summarize(result);
      const exact=result.rows.length===5 && result.rows.every((row,i)=>row.name===canonPerk(pending.label.rows[i][0]) && row.value===pending.label.rows[i][1]);
      if(exact){const item=pending;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(pending===item){item.statsMs ??=performance.now()-item.start;item.exactResult ??=summarize(result);}}));}
      if(exact && result.valid && result.rows.every(row=>!row.inferred && !row.assumed && !row.conflict && !row.tierConflict)){
        const item=pending;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(pending===item)item.completeMs ??=performance.now()-item.start;}));
      }
    }
    return answer;
  };
  const draw=()=>{const p=labels.roi;if(video.readyState>=2)ctx.drawImage(video,p.x,p.y,p.width,p.height,0,0,source.width,source.height);};
  for(const label of labels.cases){
    video.currentTime=label.time;await wait(()=>!video.seeking && Math.abs(video.currentTime-label.time)<.1);draw();
    const panel=DNScannerPanel.detect(source),rect=panel && DNScannerCore.cropPixels(panel,source.width,source.height);
    if(!rect){staticRuns.push({time:label.time,passed:false,reason:'no-panel'});continue;}
    const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
    const fields=DNScannerPanel.automaticFields(source,panel);
    if(window.DNWarVideoInputs && inputs.length===0){const frozen=DNScannerFieldRecognition.snapshot({...fields,panelSource:crop}),atlas=document.createElement('canvas');try{atlas.width=800;atlas.height=5*90;const c=atlas.getContext('2d');for(let i=0;i<5;i++)c.drawImage(frozen.crops[i+'-name'],0,i*90,800,90);inputs.push(atlas.toDataURL('image/png').split(',')[1]);}finally{frozen.release();}}
    const frozen=DNScannerFieldRecognition.snapshot({...fields,panelSource:crop}),hallProbe=DNScannerRecognition.hallColour(frozen.crops.hall || frozen.crops['hall-banner']);frozen.release();
    const result=await engine.recognize(crop,{layout:'panel',hall:'war',inferColours:true,fields:{...fields,panelSource:crop}});
    const exact=result.rows.length===5 && result.rows.every((row,i)=>row.name===canonPerk(label.rows[i][0]) && row.value===label.rows[i][1]);
    staticRuns.push({time:label.time,passed:exact && result.valid,exact,geometry:rect,hallProbe,hallSource:result.hallSource,result:{...summarize(result),observations:result.valid?undefined:result.observations}});crop.width=crop.height=0;
  }
  video.currentTime=0;await wait(()=>!video.seeking);draw();
  if(window.DNWarVideoStatic){video.removeAttribute('src');video.load();await engine.close();DNScannerRecognition.create=create;window.Tesseract.createWorker=workerFactory;DNScannerComparison.update=compare;DNScannerReading.invalidate=invalidate;DNScannerReading.update=update;return {passed:staticRuns.every(run=>run.passed),metrics:{runs:[],staticRuns},inputs};}
  const stream=source.captureStream(20),timer=setInterval(draw,50);
  Object.defineProperty(window.parent.navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  get('auto').checked=true;get('connect').click();await wait(()=>get('video').readyState>=2);
  try {
    for(const label of labels.cases){
      const start=label.start ?? label.time,budget=Math.min(6000,((label.end ?? label.time+6.1)-start)*1000-100);
      video.pause();video.currentTime=start;await wait(()=>!video.seeking && Math.abs(video.currentTime-start)<.1);
      lastResult=null;recognized=null;pending={label,start:performance.now(),completeMs:null,statsMs:null,jobs:0,invalidations:[],cancellations:[],geometryChanges:0,signatureDeltas:[]};draw();await video.play();
      try{await wait(()=>pending.completeMs!==null,budget);}catch{}
      video.pause();runs.push({time:label.time,start,budgetMs:budget,title:label.title,passed:pending.statsMs!==null,confirmed:pending.completeMs!==null,statsMs:pending.statsMs,completeMs:pending.completeMs,jobs:pending.jobs,geometry:pending.geometry,geometryChanges:pending.geometryChanges,invalidations:pending.invalidations,cancellations:pending.cancellations,signatureDeltas:pending.signatureDeltas,exactResult:pending.exactResult,fieldStatus:get('fields-status').textContent,status:get('result-status').textContent,lastResult,recognized});
      pending=null;
    }
    return {passed:runs.every(run=>run.passed),metrics:{runs,staticRuns},inputs,limitations:'Seven targeted snippets from one original War recording, each with at most six seconds of real playback, bounded by its visible artifact interval, through a locally captured 20Hz game-browser canvas, plus raw single-frame engine reads. Correct displayed stats and full direct confirmation are reported separately. Default factory profile and no user collection. Correctness uses independently transcribed signed stats; this is not a broad live accuracy or hardware latency estimate. The recorded production page is historical evidence only.'};
  }finally{pending=null;clearInterval(timer);video.pause();video.removeAttribute('src');video.load();get('stop').click();DNScannerComparison.update=compare;DNScannerRecognition.create=create;DNScannerReading.invalidate=invalidate;DNScannerReading.update=update;window.Tesseract.createWorker=workerFactory;source.width=source.height=0;}
})();
