/* Local experiment only: exactly two independent fast workers. The production
 * engine remains unchanged. Compare the same field code, views and OCR params;
 * only category scheduling changes. Model startup is recorded separately. */
(async()=>{
  const R=window.DNScannerRecognition,F=window.DNScannerFieldRecognition,C=window.DNScannerCore;
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json());
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  let source=await(await fetch('scanner-field-recognition.js')).text();
  function replace(before,after){if(!source.includes(before))throw Error('Worker experiment source marker changed: '+before.slice(0,80));source=source.replace(before,after);}
  replace('snapshot,{worker,readView,names','snapshot,{worker,readView,categoryReader,names');
  const readStart=source.indexOf('    async function read(source,'),readEnd=source.indexOf('    // Only an explicitly scoped encounter',readStart);
  if(readStart<0 || readEnd<0)throw Error('Worker experiment read boundaries changed');
  let read=source.slice(readStart,readEnd);
  read=read.replace("      check();let focused=null;","      const selected=kind==='category'?categoryReader:{worker,readView};\n      check();let focused=null;")
    .replaceAll('await worker.setParameters','await selected.worker.setParameters').replaceAll('await readView(','await selected.readView(');
  source=source.slice(0,readStart)+read+source.slice(readEnd);
  const categoryStart=source.indexOf('    let artifact=null;'),categoryEnd=source.indexOf('    const observations=',categoryStart);
  if(categoryStart<0 || categoryEnd<0)throw Error('Worker experiment category boundaries changed');
  const category=source.slice(categoryStart,categoryEnd)
    .replace("    const colourHall=R().hallColour(snapshot.crops.hall || snapshot.crops['hall-banner']);\n",'')
    .replaceAll('await worker.setParameters','await categoryReader.worker.setParameters').replaceAll('await readView(','await categoryReader.readView(');
  source=source.slice(0,categoryStart)+"    const colourHall=R().hallColour(snapshot.crops.hall || snapshot.crops['hall-banner']);\n    const categoryResult=await categoryTask;\n    if(categoryResult.error)throw categoryResult.error;\n    let artifact=categoryResult.value;\n"+source.slice(categoryEnd);
  replace("    const batchNames=await batch('name');",'    const categoryTask=(async()=>{\n'+category+'      return artifact;\n    })().then(value=>({value}),error=>({error}));\n    categoryReader.tasks.push(categoryTask);\n    const batchNames=await batch(\'name\');');
  let parallel;
  try{new Function('window','document',source)(window,document);parallel=window.DNScannerFieldRecognition.recognize;}
  finally{window.DNScannerFieldRecognition=F;}
  const base=new URL('./vendor/tesseract/',document.baseURI).href,workers=[],startupMs=[],runs=[];
  async function worker(){const start=performance.now(),created=await Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+'lang-fast/',workerBlobURL:false,cachePath:'dn-eng-fast-7d4322bd',logger:()=>{}});workers.push(created);await created.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});startupMs.push(performance.now()-start);return created;}
  try{
    const rowWorker=await worker(),categoryWorker=await worker();
    const fixtures=[];
    for(const name of ['pic1','greenissue','invaders-cyan','invaders-green','review-215133','review-215714','review-225540','review-225703']){
      const labels=await(await fetch('../tests/scanner/'+name+'.labels.json')).json(),bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+name+'.png')).blob());
      const full=document.createElement('canvas');full.width=bitmap.width;full.height=bitmap.height;full.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      const panel=R.detectPanel(full),rect=C.cropPixels(panel,full.width,full.height);
      const fields={template:DNScannerRegions.defaults(rect.width/rect.height,!!labels.category),panel,source:full};
      fixtures.push({name,labels,full,fields});
    }
    async function inspect(fixture,concurrent){
      const frozen=F.snapshot(fixture.fields);let calls=0,categoryCalls=0;const tasks=[];
      const categoryReader={worker:categoryWorker,tasks,readView:async(...args)=>{calls++;categoryCalls++;return categoryWorker.recognize(...args);}};
      const options={worker:rowWorker,readView:async(...args)=>{calls++;return rowWorker.recognize(...args);},names,canonPerk,hall:'main',inferColours:true,isClosed:()=>false,ocrCalls:()=>calls,categoryReader};
      const start=performance.now();let result;
      try{result=await(concurrent?parallel:F.recognize)(frozen,options);}
      finally{await Promise.allSettled(tasks);frozen.release();await Promise.all([rowWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''}),categoryWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''})]);}
      const elapsedMs=performance.now()-start;
      const signature=JSON.stringify({rows:result.rows,valid:result.valid,warnings:result.warnings,artifact:result.artifact,hall:result.hall,unlocked:result.unlocked,observations:result.observations});
      const exact=fixture.labels.rows.every((row,i)=>result.rows[i]?.name.toLowerCase()===canonPerk(row.name).toLowerCase() && result.rows[i]?.value===row.value && !result.rows[i]?.inferred);
      return {elapsedMs,ocrCalls:calls,categoryCalls,valid:result.valid,exact,signature};
    }
    // Warm both actual OCR engines before the timed alternating pairs.
    for(const fixture of fixtures){await inspect(fixture,false);await inspect(fixture,true);}
    for(let repeat=0;repeat<5;repeat++)for(const fixture of fixtures){
      const before=repeat%2?await inspect(fixture,true):await inspect(fixture,false);
      const after=repeat%2?await inspect(fixture,false):await inspect(fixture,true);
      const sequential=repeat%2?after:before,concurrent=repeat%2?before:after;
      runs.push({fixture:fixture.name,repeat,sequentialMs:sequential.elapsedMs,concurrentMs:concurrent.elapsedMs,sequentialCalls:sequential.ocrCalls,concurrentCalls:concurrent.ocrCalls,categoryCalls:concurrent.categoryCalls,equivalent:sequential.signature===concurrent.signature,exact:sequential.exact && concurrent.exact,valid:concurrent.valid});
    }
    for(const fixture of fixtures)fixture.full.width=fixture.full.height=0;
    const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
    const sequential=runs.map(run=>run.sequentialMs),concurrent=runs.map(run=>run.concurrentMs);
    return {passed:runs.every(run=>run.equivalent && run.exact && run.sequentialCalls===run.concurrentCalls),startupMs,workers:workers.length,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory || null,
      sequential:{p50Ms:percentile(sequential,.5),p95Ms:percentile(sequential,.95),totalMs:sequential.reduce((a,b)=>a+b,0)},
      concurrent:{p50Ms:percentile(concurrent,.5),p95Ms:percentile(concurrent,.95),totalMs:concurrent.reduce((a,b)=>a+b,0)},runs,
      limitations:'Warm static screenshot field OCR only. Uses exactly two independent fast workers with disjoint parameter state. Direct field calls exclude standard fallback/controller. Memory is not measured; cold startup, low-memory behavior and cancellation lifecycle are not qualified for production.'};
  }finally{await Promise.allSettled(workers.map(worker=>worker.terminate()));}
})()
