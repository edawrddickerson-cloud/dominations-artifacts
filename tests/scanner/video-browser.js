/* Local recording evidence only. Decode original frames without changing them.
 * Detected panels/signatures are hypotheses, never OCR ground truth. */
(() => {
 'use strict';
 const video=()=>document.getElementById('recording');
 let roi,canvas,ctx,previous=null,sheets=[],sheet=null,tiles=0;
 const readers=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function ready(){
  const until=performance.now()+30000;
  while(!video() || !window.DNScannerRecognition || video().readyState<2){if(video()?.error)throw new Error(video().error.message);if(performance.now()>until)throw new Error('Video did not become decodable');await new Promise(resolve=>setTimeout(resolve,50));}
  return {duration:video().duration,width:video().videoWidth,height:video().videoHeight};
 }
 function configure(options){roi=options.roi;canvas=document.createElement('canvas');canvas.width=roi.width;canvas.height=roi.height;ctx=canvas.getContext('2d',{willReadFrequently:true});previous=null;sheets=[];sheet=null;tiles=0;}
 async function seek(time){
  const v=video();if(Math.abs(v.currentTime-time)>.00001 || v.readyState<2)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{v.removeEventListener('seeked',done);reject(new Error('Video seek timed out at '+time));},15000);function done(){clearTimeout(timeout);resolve();}v.addEventListener('seeked',done,{once:true});v.currentTime=time;});
  ctx.drawImage(v,roi.x,roi.y,roi.width,roi.height,0,0,canvas.width,canvas.height);
 }
 function signature(rect){
  const view=document.createElement('canvas');view.width=96;view.height=48;
  const context=view.getContext('2d',{willReadFrequently:true});
  const box=rect?DNScannerCore.cropPixels(rect,canvas.width,canvas.height):{x:0,y:0,width:canvas.width,height:canvas.height};
  context.drawImage(canvas,box.x,box.y,box.width,box.height,0,0,view.width,view.height);
  const pixels=context.getImageData(0,0,view.width,view.height).data,values=[];
  for(let i=0;i<pixels.length;i+=4)values.push(Math.round((pixels[i]+pixels[i+1]+pixels[i+2])/24));
  view.width=view.height=0;return values;
 }
 function difference(a,b){if(!a||!b||a.length!==b.length)return 1;let changed=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1)changed++;return changed/a.length;}
 function tile(time,kind){
  if(!sheet || tiles%40===0){sheet=document.createElement('canvas');sheet.width=1200;sheet.height=8*161;const c=sheet.getContext('2d');c.fillStyle='#10131b';c.fillRect(0,0,sheet.width,sheet.height);sheets.push(sheet);}
  const index=tiles%40,x=index%5*240,y=Math.floor(index/5)*161,c=sheet.getContext('2d');
  c.drawImage(canvas,0,0,canvas.width,canvas.height,x,y,240,137);c.fillStyle='#fff';c.font='12px sans-serif';c.fillText(time.toFixed(1)+'s '+kind,x+4,y+152);tiles++;
 }
 async function sample(time){
  await seek(time);
  const crafting=DNScannerRecognition.detectPanel(canvas),storage=window.DNStorageRecognition.detectPanel(canvas);
  const type=storage?'storage':crafting?'crafting':'other',rect=storage || crafting;
  const current=signature(rect),delta=difference(previous?.signature,current);
  // A coarse storyboard is useful even when a detector misses a dialog.
  if(!previous || type!==previous.type || delta>.035 || time-previous.tileTime>=5){tile(time,type);previous={signature:current,type,tileTime:time};}
  const hash=current.reduce((value,number)=>Math.imul(value^number,16777619)>>>0,2166136261).toString(16);
  return {time,crafting,storage,type,signature:hash,change:delta};
 }
 async function frame(time){await seek(time);return canvas.toDataURL('image/png').split(',')[1];}
 async function categoryFrame(time){await seek(time);const panel=DNScannerRecognition.detectPanel(canvas),preview=document.createElement('canvas');preview.width=1280;preview.height=Math.round(canvas.height*1280/canvas.width);preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);const box=DNScannerRecognition.categoryRect(preview,panel);if(!box)throw new Error('No category crop');const crop=document.createElement('canvas');crop.width=box.width*2;crop.height=box.height*2;crop.getContext('2d').drawImage(preview,box.x,box.y,box.width,box.height,0,0,crop.width,crop.height);return crop.toDataURL('image/png').split(',')[1];}
 async function percentageFrame(time){
  const state=await reader('crafting');await seek(time);const panel=DNScannerRecognition.detectPanel(canvas);feed(state,'crafting',panel);
  const {w,crop}=state,template=w.DNScannerRegions.defaults(crop.width/crop.height),snapshot=w.DNScannerFieldRecognition.snapshot({template,panel,source:canvas,panelSource:crop});
  const sheet=document.createElement('canvas');sheet.width=1150;sheet.height=5*150;const context=sheet.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,sheet.width,sheet.height);const regions=[];
  try{for(let i=0;i<5;i++){const row=snapshot.crops[i+'-percentage'],pixels=row.getContext('2d').getImageData(0,0,row.width,row.height).data,rect=w.DNScannerFieldRecognition.percentageRect(pixels,row.width,row.height);regions.push(rect);context.fillStyle='#000';context.font='14px sans-serif';context.fillText(time+'s row '+(i+1)+' '+JSON.stringify(rect),8,i*150+16);context.drawImage(row,8,i*150+25);if(rect)context.drawImage(row,rect.x,rect.y,rect.width,rect.height,760,i*150+25,rect.width*4,rect.height*4);}}
  finally{snapshot.release();await close();}return {image:sheet.toDataURL('image/png').split(',')[1],regions};
 }
 async function numericProbe(time){
  const state=await reader('crafting');await seek(time);const panel=DNScannerRecognition.detectPanel(canvas);feed(state,'crafting',panel);
  const {w,crop}=state,template=w.DNScannerRegions.defaults(crop.width/crop.height),snapshot=w.DNScannerFieldRecognition.snapshot({template,panel,source:canvas,panelSource:crop}),runs=[];
  try{for(const model of ['fast']){
   const base=new URL('vendor/tesseract/',w.document.baseURI).href,worker=await w.Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+(model==='fast'?'lang-fast/':'lang/'),workerBlobURL:false,cachePath:'dn-numeric-probe-'+model,logger:()=>{}});
   try{for(let i=0;i<5;i++){
    const row=snapshot.crops[i+'-percentage'],pixels=row.getContext('2d').getImageData(0,0,row.width,row.height).data,rect=w.DNScannerFieldRecognition.percentageRect(pixels,row.width,row.height);if(!rect)continue;
    for(const scale of [2,3,4,5])for(const treatment of ['chroma','normalised'])for(const gain of [6,8,12]){
     const view=w.document.createElement('canvas');view.width=rect.width*scale+32;view.height=rect.height*scale+24;const context=view.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,view.width,view.height);context.drawImage(row,rect.x,rect.y,rect.width,rect.height,16,12,rect.width*scale,rect.height*scale);
     const image=context.getImageData(16,12,rect.width*scale,rect.height*scale),strengths=[];
     for(let p=0;p<image.data.length;p+=4)strengths.push(Math.max(0,Math.max(image.data[p+1],image.data[p+2])-image.data[p]));strengths.sort((a,b)=>a-b);const background=treatment==='normalised'?strengths[Math.floor(strengths.length/2)]:0;
     for(let p=0;p<image.data.length;p+=4){const r=image.data[p],g=image.data[p+1],b=image.data[p+2],v=255-Math.min(255,Math.max(0,Math.max(g,b)-r-background)*gain);image.data[p]=image.data[p+1]=image.data[p+2]=v;image.data[p+3]=255;}context.putImageData(image,16,12);
     for(const segmentation of ['7']){await worker.setParameters({tessedit_pageseg_mode:segmentation,tessedit_char_whitelist:'+-0123456789.,%'});const start=performance.now(),output=await worker.recognize(view,{}, {text:true,blocks:true}),lines=(output.data.blocks || []).flatMap(b=>(b.paragraphs || []).flatMap(p=>p.lines || []));runs.push({time,row:i+1,model,treatment,gain,scale,segmentation,text:output.data.text.trim(),confidence:lines.length?Math.min(...lines.map(l=>l.confidence)):0,ms:Math.round(performance.now()-start)});}view.width=view.height=0;
    }
   }}finally{await worker.terminate();}
  }}finally{snapshot.release();await close();}return runs;
 }
 async function reader(mode){
  if(readers.has(mode))return readers.get(mode);
  const iframe=document.createElement('iframe');iframe.style.cssText='position:absolute;left:0;top:1500px;width:1440px;height:1100px';iframe.src='/ui/'+(mode==='storage'?'storage-scanner.html':'scanner.html');document.body.append(iframe);
  const w=iframe.contentWindow,until=performance.now()+30000;
  while(!w.DNScannerReading || !w.document.querySelector('#scanner-names option')){if(performance.now()>until)throw new Error('Production scanner did not load');await sleep(50);}
  const get=id=>w.document.getElementById('scanner-'+id);
  get('auto').checked=false;get('infer').checked=false;
  const collect=get('collect');if(collect){collect.checked=false;collect.dispatchEvent(new w.Event('change'));}
  const state={w,get,records:[],items:[],crop:w.document.createElement('canvas'),preview:w.document.createElement('canvas'),time:null};
  const create=w.DNScannerRecognition.create;
  w.DNScannerRecognition.create=options=>{const engine=create(options),recognize=engine.recognize;engine.recognize=async(...args)=>{state.activeRead={inputTime:state.time,started:performance.now()};return recognize.apply(engine,args);};return engine;};
  // Keep the real collector callable for replay diagnostics; observe without
  // writing items to the user's inventory or importing their actual profile.
  const collection=w.DNScannerCollection;
  if(collection){const record=collection.record,recordItem=collection.recordItem;collection.record=result=>{state.records.push({time:state.time,inputTime:state.activeRead?.inputTime,readMs:Math.round(performance.now()-(state.activeRead?.started || performance.now())),result:JSON.parse(JSON.stringify(result))});return record.call(collection,result);};collection.recordItem=(result,id,options)=>{if(state.records.length && result)state.records.at(-1).presented=JSON.parse(JSON.stringify(result));state.items.push({time:state.time,id,options});return recordItem.call(collection,result,id,options);};}
  readers.set(mode,state);return state;
 }
 function feed(state,mode,panel,{auto=false}={}){
  const {w,get,crop,preview}=state;
  get('auto').checked=auto;
  if(!panel){w.DNScannerReading.update(crop,{session:1,current:false});return;}
  const rect=w.DNScannerCore.cropPixels(panel,canvas.width,canvas.height);
  crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(canvas,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  let fields=null;
  if(mode==='storage'){get('layout').value='storage';get('rows').value=String(w.DNStorageRecognition.inspect(crop).expectedRows);}
  else {get('layout').value='panel';get('rows').value='5';fields={template:w.DNScannerRegions.defaults(rect.width/rect.height),panel,source:canvas};}
  preview.width=Math.round(canvas.width*Math.min(1,1280/canvas.width));preview.height=Math.round(canvas.height*Math.min(1,1280/canvas.width));preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
  w.DNScannerReading.update(crop,{session:1,current:true,fields,categorySource:preview,panelRegion:panel});
 }
 const {normalize,compare}=window.DNVideoMetrics;
 async function baseline(label){
  const state=await reader(label.mode);state.time=label.time;await seek(label.time);
  const detector=label.mode==='storage'?DNStorageRecognition:DNScannerRecognition,panel=detector.detectPanel(canvas);
  const full=document.createElement('canvas');full.width=video().videoWidth;full.height=video().videoHeight;full.getContext('2d').drawImage(video(),0,0);
  const fullPanel=detector.detectPanel(full);full.width=2560;full.height=video().videoHeight;full.getContext('2d').drawImage(video(),0,0);
  const activePanel=detector.detectPanel(full);full.width=full.height=0;
  const catalog=[...state.get('names').querySelectorAll('option')].map(o=>normalize(o.value));
  const missingCatalog=label.rows.map(r=>r[0]).filter(name=>!catalog.includes(normalize(name)));
  state.w.DNScannerReading.invalidate('Independent video frame baseline');const before=state.records.length,start=performance.now();
  feed(state,label.mode,panel);
  if(panel){const until=performance.now()+85000;while(state.get('read').disabled){if(performance.now()>until)throw new Error('Reader unavailable');await sleep(25);}state.get('read').click();
   while(state.get('read').disabled){if(performance.now()>until)throw new Error('Video OCR timed out');await sleep(25);}}
  const capture=state.records.slice(before).at(-1),recorded=capture?.presented || capture?.result || null;
  // Artwork and pixel data remain ignored local evidence, not JSON reports.
  const result=recorded?{valid:recorded.valid,artifact:recorded.artifact && {name:recorded.artifact.name,type:recorded.artifact.type,hall:recorded.artifact.hall,rawType:recorded.artifact.rawType,categoryConfidence:recorded.artifact.categoryConfidence,metadataWarnings:recorded.artifact.metadataWarnings},hall:recorded.hall,hallSource:recorded.hallSource,rows:recorded.presentation?.rows || recorded.rows,unlocked:recorded.unlocked,warnings:recorded.warnings,recognitionPath:recorded.recognitionPath,ocrCalls:recorded.ocrCalls,fieldReads:recorded.observations?.filter(o=>o.fieldReads).map(({pass,fieldReads})=>({pass,fieldReads}))}:null;
  return {time:label.time,mode:label.mode,title:label.title,panel,fullRecordingPanel:fullPanel,activeDesktopPanel:activePanel,elapsedMs:Math.round(performance.now()-start),missingCatalog,accuracy:compare(label,recorded),result,
   rendered:{status:state.get('result-status').textContent,total:state.get('item-total')?.textContent,comparison:state.get('comparison')?.textContent,warnings:state.get('warnings').textContent}};
 }
 async function negative(label){await seek(label.time);return {...label,crafting:DNScannerRecognition.detectPanel(canvas),storage:DNStorageRecognition.detectPanel(canvas)};}
 async function replayStart(){
  const state=await reader('crafting');state.w.DNScannerReading.reset();state.records=[];state.items=[];state.time=null;
  const collect=state.get('collect');if(collect){collect.checked=true;collect.dispatchEvent(new state.w.Event('change'));}
  state.get('infer').checked=true;return true;
 }
 async function replayTick(time){const state=await reader('crafting');state.time=time;await seek(time);const panel=DNScannerRecognition.detectPanel(canvas);feed(state,'crafting',panel,{auto:true});return {time,panel:!!panel,records:state.records.length,status:state.get('progress').textContent};}
 async function replayFinish(labels){
  const state=await reader('crafting');feed(state,'crafting',null);state.get('auto').checked=false;
  const records=state.records.map(record=>{
   // Timestamp association is only an encounter proposal. Exact-field matches
   // are checked separately and never used to create the expected labels.
   const label=labels.reduce((best,item)=>Math.abs(item.time-record.inputTime)<Math.abs(best.time-record.inputTime)?item:best,labels[0]);
   const result=record.presented || record.result;
   return {inputTime:record.inputTime,finishVideoTime:record.time,readMs:record.readMs,nearestLabelTime:label.time,withinTwoSeconds:Math.abs(label.time-record.inputTime)<=2,accuracy:compare(label,result),result:{valid:result.valid,rows:result.presentation?.rows || result.rows,artifact:result.artifact,hall:result.hall,unlocked:result.unlocked,warnings:result.warnings,recognitionPath:result.recognitionPath}};
  });
  return {records,recordItemCalls:state.items,renderedTotal:state.get('item-total')?.textContent,renderedFreshness:state.get('score-freshness')?.textContent};
 }
 async function close(){for(const {w} of readers.values())w.DNScannerReading.reset();readers.clear();}
 window.DNVideoReplay={ready,configure,sample,frame,categoryFrame,percentageFrame,numericProbe,baseline,negative,replayStart,replayTick,replayFinish,close,sheets:()=>sheets.map(c=>c.toDataURL('image/png').split(',')[1])};
})();
