/* Authority: Actual user screenshot benchmark. Ownership: Local fixture harness only.
 * Invariants: Uses production detector/OCR; labels transcribed independently; no uploads.
 * Constraints: Timings are this machine/browser only; one fixture proves no general accuracy.
 */
(async () => {
  const load = src => new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('Failed to load '+src));document.head.append(script);});
  for(const src of ['data/army_catalog.js','shared.js','scanner-core.js','scanner-frames.js','artifact-scoring.js','vendor/tesseract/tesseract.min.js','scanner-name-catalog.js','scanner-recognition.js']) await load(src);
  const labels=await(await fetch('../tests/scanner/pic1.labels.json')).json();
  const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/pic1.png')).blob());
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;source.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const defaults=await(await fetch('data/perk_rating_defaults.json')).json();
  const names=Object.keys(defaults);
  const canonPerk=window.DN.makeCanonPerk(window.DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  for(const row of labels.rows)row.name=names.find(name=>name.toLowerCase()===canonPerk(row.name).toLowerCase()) || canonPerk(row.name);
  const detectorStart=performance.now();
  const panel=window.DNScannerRecognition.detectPanel(source);
  const detectorMs=performance.now()-detectorStart;
  const engine=window.DNScannerRecognition.create({names,canonPerk});
  const runs=[];
  const variants=[];
  for(const scale of [.75,1.5]) {const canvas=document.createElement('canvas');canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);variants.push({canvas,scale});}
  const cases=[['detected',panel && window.DNScannerCore.cropPixels(panel,source.width,source.height),source],['manual-text',labels.textRegion || {x:570,y:270,width:532,height:213},source],...variants.map(({canvas,scale})=>['detected-scale-'+scale,window.DNScannerCore.cropPixels(window.DNScannerRecognition.detectPanel(canvas),canvas.width,canvas.height),canvas]),['forced-first-pass-failure',panel && window.DNScannerCore.cropPixels(panel,source.width,source.height),source]];
  const panelRect=window.DNScannerCore.cropPixels(panel,source.width,source.height);
  let temporalEvidence;
  if(labels.temporalProbe) {
    const frames=window.DNScannerFrames.create();
    for(let sample=0;sample<3;sample++) {
      const view=document.createElement('canvas');view.width=source.width;view.height=source.height;
      const ctx=view.getContext('2d');ctx.drawImage(source,0,0);
      // Synthetic moving white/yellow stars over real text, at disjoint positions.
      for(const row of [1,4]) {
        const x=panelRect.x+panelRect.width*(.18+sample*.23),y=panelRect.y+panelRect.height*(.275+.657*(row+.5)/5);
        ctx.fillStyle=row===1?'#fff':'#ffd84d';ctx.beginPath();
        for(let vertex=0;vertex<10;vertex++) {
          const angle=-Math.PI/2+vertex*Math.PI/5,radius=vertex%2?5:12;
          const px=x+Math.cos(angle)*radius,py=y+Math.sin(angle)*radius;
          if(vertex)ctx.lineTo(px,py);else ctx.moveTo(px,py);
        }
        ctx.closePath();ctx.fill();
      }
      frames.push(view);view.width=view.height=0;
    }
    const clean=document.createElement('canvas'),info=frames.snapshot(clean,source);frames.clear();
    const actual=clean.getContext('2d').getImageData(0,0,clean.width,clean.height).data;
    const expected=source.getContext('2d').getImageData(0,0,source.width,source.height).data;
    temporalEvidence={...info,pixelExact:actual.every((value,index)=>value===expected[index]),description:'Synthetic transient overlays on a frozen game panel, not a recorded game sequence.'};
    variants.push({canvas:clean,scale:1});cases.push(['synthetic-moving-stars',panelRect,clean]);
  }
  if(labels.reviewPair) {
    const padded=document.createElement('canvas');padded.width=source.width+46;padded.height=source.height+28;
    const ctx=padded.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(source,23,14);
    variants.push({canvas:padded,scale:1});cases.push(['calibration-margin',{x:0,y:0,width:padded.width,height:padded.height},padded]);
  }
  cases.push(['forced-sign-failure',panelRect,source]);
  for(const count of [2,3]) {
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
    const x=panelRect.x+panelRect.width*.025,y=panelRect.y+panelRect.height*.275,w=panelRect.width*.085,h=panelRect.height*.657/5;
    for(let row=1;row<count;row++)ctx.drawImage(source,x,y,w,h,x,y+row*h,w,h);
    variants.push({canvas,scale:1});cases.push(['synthetic-unlocked-'+count,panelRect,canvas]);
  }
  if(labels.rows.some(row=>row.name==='Redoubt Hitpoints')) {
    // Synthetic colour robustness probe, not an independent game screenshot.
    const blue=document.createElement('canvas');blue.width=source.width;blue.height=source.height;
    const ctx=blue.getContext('2d');ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,blue.width,blue.height);
    for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i+1]>Math.max(pixels.data[i],pixels.data[i+2])*1.5) {
      const green=pixels.data[i+1];pixels.data[i+1]=pixels.data[i+2];pixels.data[i+2]=green;
    }
    ctx.putImageData(pixels,0,0);variants.push({canvas:blue,scale:1});
    cases.push(['synthetic-blue-text',window.DNScannerCore.cropPixels(panel,blue.width,blue.height),blue]);
  }
  try {
    for (const [kind,rect,input] of (labels.reviewPair?cases.filter(item=>['detected','detected-scale-0.75','calibration-margin','synthetic-moving-stars'].includes(item[0])):cases)) {
      if(!rect){runs.push({kind,passed:false,error:'No panel candidate'});continue;}
      const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(input,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      const forced=kind==='forced-first-pass-failure' || kind==='forced-sign-failure';
      const originalFactory=window.Tesseract.createWorker;
      let forcedEngine=null,actualWorkerCalls=0;
      if(forced) {
        window.Tesseract.createWorker=async(...args)=>{
          const worker=await originalFactory(...args),originalRecognize=worker.recognize.bind(worker);
          worker.recognize=async(...recognizeArgs)=>{
            const output=await originalRecognize(...recognizeArgs);actualWorkerCalls++;
            // Deliberate injection after real full-panel OCR. The five fallback
            // row passes below continue to analyse genuine fixture pixels.
            if(actualWorkerCalls===1)return {...output,data:{...output.data,text:'',blocks:[]}};
            if(kind==='forced-sign-failure' && window.DNScannerRecognition.parseText(output.data.text,names,canonPerk).rows[0]?.known)return {...output,data:{...output.data,text:output.data.text.replace(/([+-])\s*(\d+(?:[.,]\d+)?)\s*%/g,'«$2%')}};
            return output;
          };
          return worker;
        };
        forcedEngine=window.DNScannerRecognition.create({names,canonPerk});
      }
      let result,elapsedMs;
      const started=performance.now();
      try {result=await(forcedEngine||engine).recognize(crop,{expectedRows:5,layout:kind==='manual-text'?'text':'panel',inferColours:labels.reviewPair || kind==='forced-sign-failure'});elapsedMs=performance.now()-started;}
      finally {if(forced){window.Tesseract.createWorker=originalFactory;await forcedEngine.close();}}
      const exact=result.rows.length===labels.rows.length && result.rows.every((row,index)=>row.name===labels.rows[index].name && row.value===labels.rows[index].value);
      const toArtifact=rows=>Object.fromEntries(rows.flatMap((row,index)=>[[`perk_${index+1}_name`,row.name],[`perk_${index+1}_base`,String(row.value)],[`perk_${index+1}_max`,'']]));
      let parity=true;
      for(const scoreMode of ['sum','maxrow']) for(const prefSortAxes of [{offensive:true,defensive:true},{offensive:true,defensive:false},{offensive:false,defensive:true}]) {
        const options={canonPerk,ratingOf:(name,axis)=>defaults[name]?.[axis]||0,scoreMode,prefSortAxes};
        parity &&= JSON.stringify(window.DNArtifactScoring.score(toArtifact(result.rows),options))===JSON.stringify(window.DNArtifactScoring.score(toArtifact(labels.rows),options));
      }
      const injection=forced?{description:'Synthetic robustness test: real first-pass output replaced with blank text/no line evidence; bounded row, colour, percentage and automatic crop retries use real OCR pixels.',actualWorkerCalls,fallbackExecuted:actualWorkerCalls>=6&&actualWorkerCalls<=45}:undefined;
      const expectedKnown=labels.rows.every(row=>names.includes(row.name));
      const complete=window.DNScannerRecognition.coverage(result.rows).light==='green';
      const appropriateValidation=labels.reviewPair?complete && (!result.valid || expectedKnown):kind==='forced-sign-failure'?!result.valid && complete && result.rows.some(row=>row.inferred):expectedKnown?result.valid:!result.valid && complete && result.warnings.every(warning=>warning.startsWith('Unknown or ambiguous perk:'));
      const expectedStars=kind==='manual-text'?null:kind.startsWith('synthetic-unlocked-')?Number(kind.slice(-1)):labels.unlocked || 1;
      const starsCorrect=result.unlocked.count===expectedStars;
      const percentageRecovery=kind!=='forced-sign-failure' || result.percentageReads?.some(read=>read.reads.length===2);
      runs.push({kind,rect,elapsedMs,exact,complete,starsCorrect,percentageRecovery,expectedKnown,scoringParity:parity,...(injection?{injection}:{}),...(kind==='synthetic-moving-stars'?{temporalEvidence}:{}),passed:exact&&starsCorrect&&percentageRecovery&&appropriateValidation&&parity&&(!forced||injection.fallbackExecuted)&&(kind!=='synthetic-moving-stars'||temporalEvidence.pixelExact),...result});crop.width=crop.height=0;
    }
  } finally {await engine.close();source.width=source.height=0;for(const {canvas} of variants)canvas.width=canvas.height=0;}
  return {fixture:'pic1.png',browser:navigator.userAgent,panel,detectorMs,runs,passed:runs.every(run=>run.passed),limitations:'One screenshot plus Canvas-derived scale probes and a deliberately injected first-pass failure only. First native and forced-failure OCR include worker initialization; other runs are warm. Scoring parity uses repository rating defaults for all modes/axes. No representative accuracy or continuous capture claim.'};
})()
