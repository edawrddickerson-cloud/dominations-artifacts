/* Warm real OCR through Connect, canvas capture, controller and target renderer. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const titleKey=value=>String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const wait=async(fn,timeout=15000)=>{const until=performance.now()+timeout;while(!fn()){if(performance.now()>until)throw Error('Live latency timed out: '+get('result-status').textContent);await pause(10);}};
  await wait(()=>get('names').children.length);
  const labels=await(await fetch('../tests/scanner/war-crafting-colours.json')).json();
  const savedBoxesBefore=localStorage.getItem(DNScannerRegions.KEY);
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const fixtures=[];
  for(const label of labels)fixtures.push({...label,image:await createImageBitmap(await(await fetch('../tests/scanner/'+label.fixture+'.png')).blob())});
  const api=DNCraftingPurposes;
  const target=api.saveCustom({label:'Latency collection target',category:'defensive',selections:['general-defensive'],addOns:{attacking:{source:'profile'}}});
  const owned=Array.from({length:100},(_,i)=>{const label=fixtures[i%2];return {id:'live-owned-'+i,name:'Owned '+i,hall:'war',type:label.category,reviewed:true,rows:label.rows.map(row=>({...row,name:canonPerk(row.name),known:true,hasPercent:true,level:1,unlocked:false,rerollEligible:false,rerollSource:'manual'}))};});
  await DNStoredArtifacts.write(DNStoredArtifacts.collectionKey(),owned);
  window.dispatchEvent(new Event('focus'));await pause(150);
  const stages=[],jobs=[],factory=window.Tesseract.createWorker,performanceHook=window.DNScannerPerformance;
  if(window.DNTraceLatency)window.Tesseract.createWorker=async(...args)=>{
    const worker=await factory(...args),recognize=worker.recognize.bind(worker),setParameters=worker.setParameters.bind(worker),parameters={};
    worker.setParameters=async values=>{Object.assign(parameters,values);return setParameters(values);};
    worker.recognize=async(input,...rest)=>{
      const start=performance.now(),item=pending,job={fixture:item?.label.fixture,atMs:item?start-item.start:null,width:input.width,height:input.height,psm:parameters.tessedit_pageseg_mode};
      try{const result=await recognize(input,...rest);job.text=String(result.data.text).slice(0,100);return result;}
      finally{job.ms=performance.now()-start;jobs.push(job);}
    };return worker;
  };
  window.DNScannerPerformance=event=>{if(pending)stages.push({fixture:pending.label.fixture,stage:event.stage,atMs:performance.now()-pending.start});performanceHook?.(event);};
  const names=Array.from(get('names').children,option=>option.value),create=DNScannerRecognition.create,engine=create({names,canonPerk});
  await engine.warm({fast:true});await engine.warm({fast:false});
  DNScannerRecognition.create=()=>engine;
  const source=document.createElement('canvas');source.width=1718;source.height=1390;const ctx=source.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,source.width,source.height);
  let current=null,pending=null,lastResult=null,exposure=1;
  const draw=()=>{
    if(current){
      ctx.drawImage(current.image,0,0,source.width,source.height);
      if(exposure<1){ctx.fillStyle='rgba(0,0,0,'+(1-exposure)+')';ctx.fillRect(0,0,source.width,source.height);}
      if(window.DNWarCalibrationDimming){
        const p=current.panel,sx=source.width/current.image.width,sy=source.height/current.image.height;
        // Bounded synthetic edge particles, outside the stat text. A short
        // initial flash also forces the normal settling/input validation path.
        ctx.fillStyle='#0c6edc';
        for(const fraction of [.27,.58])ctx.fillRect((p.x+p.width*fraction)*sx,(p.y-p.height*.04)*sy,p.width*.035*sx,p.height*.10*sy);
        if(pending && performance.now()-pending.start<180){ctx.fillStyle='#9ad5ef';ctx.fillRect((p.x+p.width*.82)*sx,(p.y+p.height*.5)*sy,8,8);}
      }
    }else{ctx.fillStyle='#000';ctx.fillRect(0,0,source.width,source.height);}
  };
  const stream=source.captureStream(10),timer=setInterval(draw,100);
  Object.defineProperty(window.parent.navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  const compare=DNScannerComparison.update;
  DNScannerComparison.update=function(...args){const answer=compare.apply(this,args),result=args[3]?.captureResult || args[0];
    if(pending && result?.rows?.length===5 && result.rows.every((row,i)=>row.name===canonPerk(pending.label.rows[i].name) && row.value===pending.label.rows[i].value)) {
      lastResult=result;
      const item=pending,node=get('purpose-results').querySelector('[data-purpose-result="'+target+'"] .scanner-focus-target');
      const targetReady=node && /^>/.test(node.textContent);
      const complete=result.valid && DNScannerComparisonCore.captureCompleteness(result).percent===100 && result.hall===item.label.hall && result.artifact?.type===item.label.category &&
        result.unlocked?.states?.every((value,index)=>value===(index===0)) && result.unlocked?.states?.length===5 && titleKey(result.artifact?.name)===titleKey(item.label.artifactName);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(pending!==item)return;
        item.statsMs ??= performance.now()-item.start;
        if(targetReady)item.targetMs ??=performance.now()-item.start;
        if(targetReady && complete)item.completeMs ??=performance.now()-item.start;
      }));
    }
    return answer;
  };
  get('auto').checked=true;get('connect').click();await wait(()=>get('video').readyState>=2);
  const runs=[];
  try {
    for(let repeat=0;repeat<3;repeat++)for(const label of fixtures) {
      exposure=window.DNWarCalibrationDimming?[1,.9,.75][repeat]:1;
      pending={label,start:performance.now(),statsMs:null,targetMs:null,completeMs:null};current=label;draw();
      await wait(()=>pending.statsMs!==null && pending.targetMs!==null && pending.completeMs!==null,12000);
      const targetRow=get('purpose-results').querySelector('[data-purpose-result="'+target+'"]');
      const threshold=Number(targetRow.querySelector('.scanner-focus-target').textContent.replace(/^>\s*/,'')),score=Number(targetRow.querySelector('.scanner-focus-score').textContent.replace(/^~/,''));
      const decisionCorrect=threshold===score && get('decision-state').textContent==='Discard';
      runs.push({fixture:label.fixture,repeat,exposure,statsMs:pending.statsMs,targetMs:pending.targetMs,completeMs:pending.completeMs,valid:lastResult.valid,inferred:lastResult.rows.filter(row=>row.inferred).length,automatic:get('fields-status').textContent==='Automatic fields',savedBoxesUnchanged:localStorage.getItem(DNScannerRegions.KEY)===savedBoxesBefore,path:lastResult.recognitionPath,name:lastResult.artifact?.name,fields:DNScannerComparisonCore.captureCompleteness(lastResult).percent,decisionCorrect});
      pending=null;await pause(100);
    }
    return {passed:runs.every(run=>run.valid && run.inferred===0 && run.fields===100 && run.decisionCorrect && run.savedBoxesUnchanged && (!window.DNWarCalibrationDimming || !run.automatic)),metrics:{runs,...(window.DNTraceLatency?{stages,jobs}:{})},limitations:'Six warm reads of two original War screenshots through a local 10Hz canvas stream at 1718x1390, real OCR and 100 synthetic owned items. Complete time requires exact direct stats, category, hall, five star states, 100% field coverage, a title match with punctuation normalized, and a painted target. Saved coordinates must remain unchanged. Identical owned items must produce the correct tied Discard decision. The saved-calibration variant adds controlled dimming, edge particles and an initial transient flash. Screen-sharing permission and actual live game motion are excluded.'};
  } finally {clearInterval(timer);get('stop').click();window.Tesseract.createWorker=factory;window.DNScannerPerformance=performanceHook;DNScannerComparison.update=compare;DNScannerRecognition.create=create;for(const label of fixtures)label.image.close();source.width=source.height=0;}
})();
