/* Real controllers and inline edits in both scanners; isolated provider only. */
(async()=>{
 const checks={},check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
 const wait=async(fn,label)=>{const end=performance.now()+15000;while(!await fn()){if(performance.now()>end)throw Error('OCR scanners timeout: '+label);await new Promise(r=>setTimeout(r,25));}};
 await DNServicesReady;const backend=window.top.DNTestBackend,owner='11111111-1111-4111-8111-111111111111';backend.switchOwner(owner);
 await wait(()=>DNCloud.user()?.id===owner,'sign-in');await DNOCRFeedback.setSharing(true);DNConsent.set({ocrFeedback:true});
 const sources=[{app:window,source:'crafting'}];
 const frame=document.createElement('iframe');frame.src='storage-scanner.html?ocr-feedback-fixture=1';document.body.append(frame);
 await wait(()=>frame.contentWindow.DNScannerReading && frame.contentWindow.DNOCRFeedback,'storage ready');await frame.contentWindow.DNServicesReady;
 sources.push({app:frame.contentWindow,source:'storage'});
 for(const {app,source} of sources){
  const doc=app.document,get=id=>doc.getElementById('scanner-'+id);
  await wait(()=>app.DNOCRFeedback.allowed() && get('names').children.length,source+' consent');
  const raw={valid:true,hall:'main',artifact:{name:'Wrong Watch',type:'Weapon',nameEvidence:{text:'Wrong Watch',confidence:90,accepted:true}},unlocked:{count:2,states:[true,true,false,false,false]},warnings:[],rows:Array.from({length:5},(_,i)=>({name:'Tower Damage',raw:'Tower Damage +6%',rawName:'Tower Damage',value:6,known:true,hasPercent:true,level:1,unlocked:i<2,rerollEligible:false,rerollSource:'visual',nameMatch:{name:'Tower Damage',method:'exact',automatic:true,confidence:1}}))};
  app.DNScannerRecognition.create=()=>({warm:async()=>{},close:async()=>{},recognize:async()=>structuredClone(raw)});
  if(source==='storage'){app.DNStorageRecognition.inspect=()=>({expectedRows:5,hall:'main'});app.DNScannerRerollRecognition.detectStorage=()=>raw.rows.map(()=>({rerollEligible:false,rerollSource:'visual'}));}
  get('auto').checked=false;const canvas=doc.createElement('canvas');canvas.width=640;canvas.height=360;canvas.getContext('2d').fillRect(0,0,640,360);
  app.DNScannerReading.update(canvas,{session:1,current:true,itemPresent:true});get('read').click();
  await wait(()=>!get('read').disabled && app.DNScannerCollection.historyItems().length===1,source+' read');
  const log=app.DNScannerCollection.ocrFeedbackItems()[0];check(source+' keeps exact OCR candidates locally for later corrections',log.ocrEvidence.some(e=>e.text==='Tower Damage'));
  if(source==='crafting'){
   get('result').querySelector('[data-target-edit]').click();
   const edit=(kind,text)=>{const node=kind==='artifact'?get('artifact-name'):get('result').querySelector('[data-inline-field="name"][data-inline-row="0"]');node.textContent=text;node.dispatchEvent(new app.InputEvent('input',{bubbles:true,inputType:'insertText'}));};
   edit('artifact','Corrected Watch');edit('name','Fighter Damage');
  }else{
   const title=doc.getElementById('storage-name');title.value='Corrected Watch';title.dispatchEvent(new app.Event('input',{bubbles:true}));
   const name=get('correct').querySelector('.scanner-perk-name');name.value='Fighter Damage';name.dispatchEvent(new app.Event('input',{bubbles:true}));
  }
  await wait(()=>app.DNScannerCollection.ocrFeedbackItems()[0].rows[0].name==='Fighter Damage',source+' inline correction');
  const fixed=app.DNScannerCollection.ocrFeedbackItems()[0];
  check(source+' inline correction preserves original OCR',fixed.rows[0].raw==='Tower Damage +6%' && fixed.nameSource==='manual');
  await wait(()=>Object.values(backend.ocrSamples?.[owner] || {}).filter(s=>s.scanner===source && s.resolution==='user-correction').length===2,source+' correction upload');
  const samples=Object.values(backend.ocrSamples[owner]).filter(s=>s.scanner===source);
  check(source+' recovers incorrect accepted exact match',samples.some(s=>s.observed_text==='Tower Damage' && s.matched_name==='Tower Damage' && s.match_method==='exact' && s.corrected_name==='Fighter Damage'));
  check(source+' recovers incorrect accepted title',samples.some(s=>s.observed_text==='Wrong Watch' && s.corrected_name==='Corrected Watch'));
 }
 const samples=Object.values(backend.ocrSamples[owner]);check('identical independently encountered artifacts have separate private encounter keys',new Set(samples.map(s=>s.encounter)).size===2);
 check('OCR feedback leaves other sharing choices off',!DNConsent.get().analytics && !DNConsent.get().diagnostics && !DNConsent.get().research && backend.telemetry.length===0);
 frame.remove();return {passed:true,ui:checks,limitations:['Mock OCR and provider; real SQL tested separately. Actual game captures need acceptance.']};
})();
