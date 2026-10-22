/* Local evidence only: original screenshot pixels, production controller,
 * collector, persistence and comparison. Labels never enter recognition. */
(() => {
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const get=id=>document.getElementById('scanner-'+id);
  async function ready(){const end=performance.now()+30000;while(!get('names')?.children.length || !window.DNScannerCollection || !window.DNStoredArtifacts){if(performance.now()>end)throw Error('Scanner loading timed out');await pause(25);}}
  async function load(name){
    let labels,url;
    if(name.startsWith('video')){
      const time=Number(name.slice(5)),manifest=await(await fetch('/tests/scanner/video/2026-10-16.json')).json();
      labels=manifest.cases.find(item=>item.mode==='crafting' && item.time===time);if(!labels)throw Error('No crafting video label '+name);
      labels={...labels,rows:labels.rows.map(([name,value])=>({name,value}))};
      url='/data/temp/scanner-video-2026-10-16/game-'+time+'-000.png';
    }else{labels=await(await fetch('/tests/scanner/'+name+'.labels.json')).json();url='/tests/scanner/'+name+'.png';}
    const response=await fetch(url);if(!response.ok)throw Error('Fixture missing '+url);
    const bitmap=await createImageBitmap(await response.blob()),full=document.createElement('canvas');
    full.width=bitmap.width;full.height=bitmap.height;full.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    return {name,labels,full};
  }
  async function seed(config){
    await ready();const fixture=await load(config.fixture),rows=fixture.labels.rows.map((row,i)=>({...row,known:true,hasPercent:true,unlocked:i===0,rerollEligible:false,rerollSource:'fresh-craft',level:1,levelSource:'crafting'}));
    const artwork=document.createElement('canvas');artwork.width=240;artwork.height=160;artwork.getContext('2d').drawImage(fixture.full,0,0,240,160);const image=artwork.toDataURL('image/jpeg',.88);
    const types=['Weapon','Armor','Jewelry','Pottery'],profile=DNStoredArtifacts.collectionKey();
    await DNStoredArtifacts.write(profile,Array.from({length:config.owned},(_,i)=>({id:'speed-owned-'+i,name:'Owned item '+i,hall:'main',type:types[i%4],reviewed:true,rows:rows.map((row,j)=>({...row,value:Math.sign(row.value)*(1+(i+j)%3*5)}))})));
    const items=Array.from({length:config.logs},(_,i)=>({id:'speed-log-'+i,name:'Craft '+i,hall:'main',type:types[i%4],expectedRows:5,validated:true,profileKey:profile,rows,image,firstSeen:new Date(1700000000000+i*1000).toISOString(),lastUpdated:new Date(1700000000000+i*1000).toISOString()}));
    const scans=items.map((item,i)=>({timestamp:item.firstSeen,validated:true,hall:'main',type:item.type,observations:[{pass:'field',rows:rows.map(row=>({...row,raw:row.name+' '+row.value+'%',confidence:95}))}]}));
    const json=JSON.stringify({version:2,items,scans,labels:[]});await DN.scannerLog.write(json);
    return {seededItems:items.length,seededScans:scans.length,owned:config.owned,logBytes:json.length};
  }
  async function run(config){
    await ready();const fixture=await load(config.fixture),R=DNScannerRecognition,reader=DNScannerReading;
    const panel=R.detectPanel(fixture.full),rect=DNScannerCore.cropPixels(panel,fixture.full.width,fixture.full.height);if(!rect)throw Error('No panel '+config.fixture);
    const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(fixture.full,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
    const fields={template:DNScannerRegions.defaults(rect.width/rect.height,!!fixture.labels.category),panel,source:fixture.full};
    const canon=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('/ui/data/perk_name_mapping.csv')).text()));
    const normalized=value=>canon(value).toLowerCase().replace(/\s+/g,' ').trim();
    const exact=result=>fixture.labels.rows.every((row,i)=>normalized(result?.rows?.[i]?.name || '')===normalized(row.name) && result.rows[i].value===row.value) && result?.rows?.length===5;
    const metadata=result=>({category:fixture.labels.category?result?.artifact?.type?.toLowerCase()===fixture.labels.category.toLowerCase():null,hall:fixture.labels.hall?result?.hall===fixture.labels.hall && result?.hallSource==='hall-colour':null,stars:typeof fixture.labels.unlocked==='number'?Array.from({length:5},(_,i)=>result?.unlocked?.states?.[i]=== (i<fixture.labels.unlocked)).every(Boolean):null,dice:typeof fixture.labels.dice==='boolean'?result?.rows?.every(row=>row.rerollEligible===fixture.labels.dice):null});
    get('auto').checked=true;get('layout').value='panel';get('infer').checked=true;
    let started=0,lastResult=null,lastParsed=null,firstStatsPaintedMs=null,firstScorePaintedMs=null,fullCapturePaintedMs=null,lastRecordAt=0,expectedScore=null;
    const fullAssessable=!!fixture.labels.category && !!fixture.labels.hall && typeof fixture.labels.unlocked==='number';
    const scoreRows=fixture.labels.rows.map(row=>({...row,name:Array.from(get('names').children,option=>option.value).find(name=>normalized(name)===normalized(row.name)) || canon(row.name),known:true,hasPercent:true,rerollEligible:true}));
    const stages=[],reads=[],collectionCalls=[],comparisonCalls=[],longTasks=[],ocrJobs=[];
    const workerFactory=window.Tesseract.createWorker;
    if(config.traceOcr)window.Tesseract.createWorker=async(...args)=>{
      const worker=await workerFactory(...args),recognize=worker.recognize.bind(worker),setParameters=worker.setParameters.bind(worker),parameters={};
      worker.setParameters=async values=>{Object.assign(parameters,values);return setParameters(values);};
      worker.recognize=async(input,...rest)=>{
        const begin=performance.now(),job={startMs:started?begin-started:null,model:args[2]?.langPath,parameters:{...parameters},width:input.width,height:input.height};
        ocrJobs.push(job);
        try{const output=await recognize(input,...rest);job.text=output.data.text;job.confidence=output.data.confidence;return output;}
        finally{job.durationMs=performance.now()-begin;}
      };
      return worker;
    };
    const observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>{for(const item of list.getEntries())if(started && item.startTime>=started)longTasks.push({startMs:item.startTime-started,durationMs:item.duration});}):null;
    try{observer?.observe({entryTypes:['longtask']});}catch{}
    const create=R.create,engines=[];let warmEngine=null;
    if(config.temperature==='warm'){
      const names=Array.from(get('names').children,option=>option.value);warmEngine=create({names,canonPerk:canon});
      for(const fast of [true,false]){const warmStart=performance.now();await warmEngine.warm?.({fast});stages.push({stage:fast?'prewarm-fast':'prewarm-standard',durationMs:performance.now()-warmStart});}
    }
    R.create=options=>{
      const engine=warmEngine || create(options);engines.push(engine);const recognize=engine.recognize;
      engine.recognize=async(...args)=>{const begin=performance.now(),read={startMs:begin-started};reads.push(read);try{const result=await recognize.apply(engine,args);read.durationMs=performance.now()-begin;read.ocrCalls=result.ocrCalls;read.recognitionPath=result.recognitionPath;return result;}catch(error){read.error=String(error);throw error;}};return engine;
    };
    const collection=DNScannerCollection,record=collection.record,recordItem=collection.recordItem,recordResult=collection.recordResult,comparison=DNScannerComparison.update;
    collection.record=function(result){lastParsed=result;const begin=performance.now();try{return record.call(this,result);}finally{collectionCalls.push({kind:'record',startMs:begin-started,durationMs:performance.now()-begin});}};
    collection.recordItem=function(result,...args){lastResult=result;lastRecordAt=performance.now();const begin=performance.now();try{return recordItem.call(this,result,...args);}finally{collectionCalls.push({kind:'recordItem',startMs:begin-started,durationMs:performance.now()-begin});}};
    if(recordResult)collection.recordResult=function(observation,result,...args){lastParsed=observation;lastResult=result;lastRecordAt=performance.now();const begin=performance.now();try{return recordResult.call(this,observation,result,...args);}finally{collectionCalls.push({kind:'recordResult',startMs:begin-started,durationMs:performance.now()-begin});}};
    DNScannerComparison.update=function(...args){const begin=performance.now();const answer=comparison.apply(this,args);comparisonCalls.push({startMs:begin-started,durationMs:performance.now()-begin});
      if(!started && fullAssessable && args[2])expectedScore=DNScannerComparisonCore.craftPotential({valid:true,rows:scoreRows,hall:fixture.labels.hall,artifact:{type:fixture.labels.category}},args[2]).potentialPreference;
      const visible=args[0],observed=args[3]?.captureResult || lastResult || visible;
      if(started && observed && exact(observed)){
        const captured=DNScannerComparisonCore.captureCompleteness(observed),groundTruth=metadata(observed);
        const displayed=Number(get('item-total').textContent.replace(/^~/,'')),scoreReady=Number.isFinite(expectedScore) && exact(visible) && displayed===expectedScore;
        const full=fullAssessable && Object.values(groundTruth).every(value=>value!==false) && captured.percent===100 && !/Waiting|Loading|needs review|unavailable/i.test(get('comparison').textContent) && /\d|Open/.test(get('benchmark-value').textContent);
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(firstStatsPaintedMs===null)firstStatsPaintedMs=performance.now()-started;if(scoreReady && firstScorePaintedMs===null)firstScorePaintedMs=performance.now()-started;if(full && fullCapturePaintedMs===null)fullCapturePaintedMs=performance.now()-started;}));
      }return answer;
    };
    // Prepare an independent labelled score before timing. Ground truth is
    // used only by this observer and never enters recognition or the controller.
    get('off').dispatchEvent(new Event('change'));
    const previousHook=window.DNScannerPerformance;window.DNScannerPerformance=event=>{if(started)stages.push({...event,atMs:performance.now()-started});previousHook?.(event);};
    let timer;try{
      let samples=0;
      const original=crop.getContext('2d').getImageData(4,4,1,1);
      const sample=()=>{
        if(config.motion==='pixel-change' && samples===1){const changed=crop.getContext('2d').getImageData(4,4,1,1);changed.data[0]^=1;crop.getContext('2d').putImageData(changed,4,4);}
        if(config.motion==='flicker' && samples<3){const image=crop.getContext('2d').getImageData(4,4,1,1);image.data.set(original.data);if(samples===1)image.data[0]^=1;crop.getContext('2d').putImageData(image,4,4);}
        samples++;reader.update(crop,{session:1,live:true,current:true,fields,panelRegion:panel,categorySource:fixture.full});
      };
      started=performance.now();sample();timer=setInterval(sample,100);
      while(performance.now()-started<config.timeoutMs){
        if(fullCapturePaintedMs!==null || !fullAssessable && firstStatsPaintedMs!==null)break;
        if(lastRecordAt && !get('read').disabled && /Finished/.test(get('progress').textContent) && performance.now()-lastRecordAt>250)break;
        await pause(15);
      }
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const assessment=metadata(lastResult),coverage=DNScannerComparisonCore.captureCompleteness(lastResult);
      return {fixture:config.fixture,temperature:config.temperature,logs:config.logs,owned:config.owned,firstStatsPaintedMs,firstScorePaintedMs,expectedScore,motion:config.motion || "steady",fullCapturePaintedMs,elapsedMs:performance.now()-started,exactStats:exact(lastResult),metadata:assessment,fullArtifactAssessable:fullAssessable,complete:fullCapturePaintedMs!==null,coverage,reads,collectionCalls,comparisonCalls,stages,longTasks,...(config.traceOcr?{ocrJobs}:{}),rendered:{capture:get('capture-detail').textContent,comparison:get('comparison').textContent,itemTotal:get('item-total').textContent,benchmark:get('benchmark-value').textContent,progress:get('progress').textContent,logRows:get('item-log').children.length},result:lastResult?{valid:lastResult.valid,rows:lastResult.rows.map(({name,value,known,assumed,inferred,conflict,tierConflict,estimated,outOfRange,unlocked,rerollEligible,rerollSource})=>({name,value,known,assumed,inferred,conflict,tierConflict,estimated,outOfRange,unlocked,rerollEligible,rerollSource})),artifact:{type:lastResult.artifact?.type},hall:lastResult.hall,hallSource:lastResult.hallSource,unlocked:lastResult.unlocked,warnings:lastResult.warnings}:null,lastParsedCalls:lastParsed?.ocrCalls};
    }finally{clearInterval(timer);observer?.disconnect();window.Tesseract.createWorker=workerFactory;collection.record=record;collection.recordItem=recordItem;if(recordResult)collection.recordResult=recordResult;DNScannerComparison.update=comparison;window.DNScannerPerformance=previousHook;R.create=create;reader.reset();}
  }
  window.DNCraftingSpeed={seed,run};
})();
