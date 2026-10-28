/* Real OCR: identical War pixels with automatic, broad saved and tight saved
 * fields. Dimming/resizing are controlled probes, not new gameplay examples. */
(async()=>{
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  while(!document.getElementById('scanner-names').children.length)await pause(25);
  const labels=await(await fetch('../tests/scanner/war-crafting-colours.json')).json();
  const names=Array.from(document.getElementById('scanner-names').children,option=>option.value);
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=DNScannerRecognition.create({names,canonPerk}),runs=[];
  await engine.warm({fast:true});await engine.warm({fast:false});
  try {
    for(const label of labels) {
      const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+label.fixture+'.png')).blob());
      try {
        for(const scale of (window.DNWarCalibrationFull?[.75,1,1.5]:[1]))for(const exposure of [1,.9,.75]) {
          const source=document.createElement('canvas');source.width=Math.round(bitmap.width*scale);source.height=Math.round(bitmap.height*scale);
          const ctx=source.getContext('2d');ctx.drawImage(bitmap,0,0,source.width,source.height);
          if(exposure<1){ctx.fillStyle='rgba(0,0,0,'+(1-exposure)+')';ctx.fillRect(0,0,source.width,source.height);}
          const panel=DNScannerPanel.detect(source);
          if(!panel)throw Error('No panel: '+JSON.stringify({fixture:label.fixture,scale,exposure}));
          const automatic=DNScannerPanel.automaticFields(source,panel),rect=DNScannerCore.cropPixels(panel,source.width,source.height);
          if(!automatic)throw Error('No automatic War fields');
          const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;
          crop.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
          const categoryRect=DNScannerRecognition.categoryRect(source,panel),category=document.createElement('canvas');
          category.width=categoryRect.width*2;category.height=categoryRect.height*2;
          const categoryCtx=category.getContext('2d');categoryCtx.drawImage(source,categoryRect.x,categoryRect.y,categoryRect.width,categoryRect.height,0,0,category.width,category.height);
          const pixels=categoryCtx.getImageData(0,0,category.width,category.height);
          for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],value=g>90 && g>r*1.25 && g>b*.8?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
          categoryCtx.putImageData(pixels,0,0);
          try {
            for(const mode of ['automatic','saved-broad','saved-tight','saved-separate']) {
              const template=['saved-broad','saved-separate'].includes(mode)?DNScannerRegions.defaults(crop.width/crop.height):DNScannerRegions.copy(automatic.template);
              if(mode==='saved-separate')template.rows.forEach(row=>{row.percentage={...row.percentage,x:.13,width:.80};});
              const original=JSON.stringify(template),start=performance.now(),fields={template,panel,source,panelSource:crop,...(mode==='automatic'?{foregroundRows:true}:{})};
              const result=await engine.recognize(crop,{layout:'panel',hall:'main',inferColours:true,categorySource:category,fields});
              const exact=result.rows.length===5 && result.rows.every((row,i)=>row.name===canonPerk(label.rows[i].name) && row.value===label.rows[i].value);
              const direct=result.rows.length===5 && result.rows.every(row=>!row.inferred && !row.assumed && !row.conflict && !row.tierConflict && row.hasPercent && row.confidence>=80);
              const metadata=result.hall==='war' && result.hallSource==='hall-colour' && result.artifact?.type===label.category && result.unlocked?.states?.length===5 && result.unlocked.states.every((value,i)=>value===(i===0));
              const unchanged=JSON.stringify(template)===original;
              const passed=exact && direct && metadata && unchanged && result.valid;
              runs.push({fixture:label.fixture,scale,exposure,mode,ms:Math.round(performance.now()-start),calls:result.ocrCalls,passed,exact,direct,metadata,unchanged,valid:result.valid,path:result.recognitionPath,
                ...(!passed?{colours:result.colours,warnings:result.warnings,observations:result.observations,rows:result.rows.map(row=>({name:row.name,value:row.value,inferred:row.inferred,confidence:row.confidence,conflict:row.conflict,tierConflict:row.tierConflict}))}:{})});
            }
          }finally{source.width=source.height=crop.width=crop.height=category.width=category.height=0;}
        }
      }finally{bitmap.close();}
    }
    return {passed:runs.every(run=>run.passed),metrics:{cases:runs.length,confirmed:runs.filter(run=>run.passed).length,runs},limitations:'Two original War screenshots with controlled dimming and optional resizing. Exact direct signed percentages, confidence, Hall/category/stars and unchanged template coordinates are required. Live game motion and screen-sharing permissions are not covered.'};
  }finally{await engine.close();}
})();
