/* Real screenshots, production controller and warm local OCR. Capture permissions,
 * cold model startup and live game animation are outside this timing probe. */
(async()=>{
  const R=window.DNScannerRecognition,reader=window.DNScannerReading,get=id=>document.getElementById('scanner-'+id);
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function wait(test){const end=performance.now()+15000;while(!test()){if(performance.now()>end)throw Error('Latency probe timed out: '+get('progress').textContent);await pause(10);}}
  await wait(()=>get('names').children.length>0);
  const names=Array.from(get('names').children,option=>option.value);
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const fixtures=[];
  for(const name of ['pic1','greenissue','invaders-cyan','invaders-green']){
    const labels=await(await fetch('../tests/scanner/'+name+'.labels.json')).json();
    const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+name+'.png')).blob());
    const full=document.createElement('canvas');full.width=bitmap.width;full.height=bitmap.height;full.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    const panel=R.detectPanel(full),rect=DNScannerCore.cropPixels(panel,full.width,full.height);
    const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,crop.width,crop.height);
    const fields={template:DNScannerRegions.defaults(rect.width/rect.height,!!labels.category),panel,source:full};
    fixtures.push({name,labels,full,panel,crop,fields});
  }
  const engine=R.create({names,canonPerk}),first=fixtures[0];
  await engine.warm({fast:true});await engine.recognize(first.crop,{fields:first.fields,layout:'panel',inferColours:true});
  const create=R.create;R.create=()=>engine;
  const collection=window.DNScannerCollection;let captured=null;
  window.DNScannerCollection={isEnabled:()=>false,record:result=>{captured=result;},recordItem:()=>{}};
  get('auto').checked=true;get('layout').value='panel';get('infer').checked=true;
  const runs=[];
  try{
    for(const fixture of fixtures){
      captured=null;
      const sample=()=>reader.update(fixture.crop,{session:1,current:true,fields:fixture.fields,panelRegion:fixture.panel,categorySource:fixture.full});
      const start=performance.now();sample();const timer=setInterval(sample,100);
      try{await wait(()=>captured!==null);}finally{clearInterval(timer);}
      const elapsedMs=performance.now()-start;
      const exact=fixture.labels.rows.every((expected,i)=>captured.rows[i]?.name.toLowerCase()===canonPerk(expected.name).toLowerCase() && captured.rows[i]?.value===expected.value);
      runs.push({fixture:fixture.name,elapsedMs,ocrCalls:captured.ocrCalls,exact,valid:captured.valid});
    }
  }finally{reader.reset();R.create=create;window.DNScannerCollection=collection;}
  return {passed:runs.every(run=>run.exact && run.elapsedMs<2000),runs,limitations:'Warm local OCR, four static repository screenshots, production auto-read controller sampled every 100 ms. Live game transitions and cold startup were not measured.'};
})()
