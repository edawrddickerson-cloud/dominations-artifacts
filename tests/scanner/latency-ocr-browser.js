/* Paired real OCR timings on independently labelled original War images. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  while(!get('names').children.length)await pause(25);
  const labels=await(await fetch('../tests/scanner/war-crafting-colours.json')).json(),runs=[];
  const names=Array.from(get('names').children,option=>option.value),canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=DNScannerRecognition.create({names,canonPerk});await engine.warm({fast:true});await engine.warm({fast:false});
  try {
    for(const label of labels)for(const scale of [.75,1,1.5]) {
      const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+label.fixture+'.png')).blob());
      const full=document.createElement('canvas');full.width=Math.round(bitmap.width*scale);full.height=Math.round(bitmap.height*scale);full.getContext('2d').drawImage(bitmap,0,0,full.width,full.height);bitmap.close();
      const panel=DNScannerPanel.detect(full),rect=DNScannerCore.cropPixels(panel,full.width,full.height),crop=document.createElement('canvas');
      crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      const categoryRect=DNScannerRecognition.categoryRect(full,panel),category=document.createElement('canvas');
      category.width=categoryRect.width*2;category.height=categoryRect.height*2;
      const ctx=category.getContext('2d');ctx.drawImage(full,categoryRect.x,categoryRect.y,categoryRect.width,categoryRect.height,0,0,category.width,category.height);
      const pixels=ctx.getImageData(0,0,category.width,category.height);
      for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],value=g>90 && g>r*1.25 && g>b*.8?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
      const fields=DNScannerPanel.automaticFields(full,panel);
      if(!fields)throw Error('No automatic fields for the detected War frame');
      for(const mode of ['standard','automatic-fields']) {
        const start=performance.now();
        const result=await engine.recognize(crop,{layout:'panel',hall:'war',inferColours:true,categorySource:category,fields:mode==='standard'?null:{...fields,panelSource:crop}});
        const exact=result.rows.length===5 && result.rows.every((row,index)=>row.name===canonPerk(label.rows[index].name) && row.value===label.rows[index].value);
        runs.push({fixture:label.fixture,scale,mode,ms:performance.now()-start,calls:result.ocrCalls,exact,valid:result.valid,type:result.artifact?.type,path:result.recognitionPath,warnings:result.warnings,rows:result.rows.map(row=>({name:row.name,value:row.value,assumed:row.assumed,conflict:row.conflict,tierConflict:row.tierConflict,confidence:row.confidence}))});
      }
      full.width=full.height=crop.width=crop.height=category.width=category.height=0;
    }
    return {passed:runs.filter(run=>run.mode==='automatic-fields').every(run=>run.exact) && !runs.some(run=>run.valid && !run.exact),metrics:{runs},limitations:'Warm paired engine reads on two original War screenshots at three scales. Baseline partial/unverified misses are recorded; every automatic-field result must match all labelled stats. Title OCR, capture scheduling and UI publication are excluded.'};
  } finally {await engine.close();}
})();
