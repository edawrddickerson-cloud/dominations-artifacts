/* Authority: User-supplied calibration screenshot, 14 October 2026, 20:33:30.
 * Ownership: Local browser verification of category OCR and ribbon colour only.
 * Invariants: Real screenshot pixels and production OCR; no uploads or persisted pixels.
 * Constraints: Calibration overlays are part of the screenshot. Blue patch is synthetic. */
(async()=>{
  const until=performance.now()+20000;
  while(!window.DNScannerRecognition || !window.DNScannerRegions || !window.DNScannerFieldRecognition || !window.DN || !window.Tesseract) {
    if(performance.now()>until)throw new Error('Scanner scripts did not finish loading');
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  const R=DNScannerRecognition,G=DNScannerRegions,checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw new Error(name);};
  const defaults=await(await fetch('data/perk_rating_defaults.json')).json(),names=Object.keys(defaults);
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/calibration-203330.png')).blob());
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;
  source.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const rect={x:481,y:389,width:521,height:269};
  const panel={x:rect.x/source.width,y:rect.y/source.height,width:rect.width/source.width,height:rect.height/source.height};
  const relative=box=>G.fromSource({x:box.x/source.width,y:box.y/source.height,width:box.width/source.width,height:box.height/source.height},panel);
  const template=G.defaults(rect.width/rect.height);
  template.category=relative({x:326,y:312,width:554,height:55});
  template.hall=relative({x:713,y:417,width:14,height:14});
  template.rows.forEach((row,i)=>{
    const y=466+i*36;
    row.name=relative({x:542,y,width:434,height:26});row.percentage={...row.name};
    row.star=relative({x:511,y:y+5,width:16,height:18});
  });
  const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;
  crop.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  check('user category and hall boxes fit the captured frame',G.resolve(template,panel,source).valid);
  const engine=R.create({names,canonPerk});let observed;
  try {
    observed=await engine.recognize(crop,{hall:'war',fields:{template,panel,source,panelSource:crop}});
    check('wide category crop recognises Pottery beside its icon',observed.artifact?.type==='Pottery');
    check('small red hall crop overrides selected War',observed.hall==='main' && observed.hallSource==='hall-colour');
    const withoutHall=G.copy(template);withoutHall.hall=null;
    const frozen=DNScannerFieldRecognition.snapshot({template:withoutHall,panel,source,panelSource:crop});
    check('missing hall box uses the red benefits ribbon',R.hallColour(frozen.crops['hall-banner'])==='main');frozen.release();
    const blue=document.createElement('canvas');blue.width=14;blue.height=14;
    blue.getContext('2d').fillStyle='#183a96';blue.getContext('2d').fillRect(0,0,14,14);
    check('same-sized blue patch identifies War',R.hallColour(blue)==='war');blue.width=blue.height=0;
  }finally {await engine.close();source.width=source.height=crop.width=crop.height=0;}
  return {fixture:'calibration-203330.png',checks,ui:checks,artifact:observed.artifact,hall:observed.hall,hallSource:observed.hallSource,
    recognitionPath:observed.recognitionPath,warnings:observed.warnings,passed:Object.values(checks).every(Boolean),
    limitations:'One real calibration screenshot verifies Main colour and Pottery OCR. The blue patch checks the stated mapping; live War capture remains untested.'};
})()
