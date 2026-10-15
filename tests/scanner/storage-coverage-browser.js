/* Authority: User's eleven category/hall screenshots, independently transcribed.
 * Ownership: Actual local OCR coverage, including real six-row Mythical dialogs. */
(async()=>{
  const deadline=performance.now()+20000;while(!window.DNStorageRecognition){if(performance.now()>deadline)throw new Error('Storage module missing');await new Promise(r=>setTimeout(r,50));}
  const labels=await(await fetch('../tests/scanner/storage-coverage.labels.json')).json();
  const defaults=await(await fetch('data/perk_rating_defaults.json')).json(),names=Object.keys(defaults),canonPerk=window.DN.makeCanonPerk(window.DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const normalize=text=>text.replace(/[’']/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const engine=window.DNScannerRecognition.create({names,canonPerk}),runs=[];
  try{
    for(const label of labels)for(const variant of window.DNStorageFixtureVariants || ['native']){
      const image=await createImageBitmap(await(await fetch('../tests/scanner/storage-'+label.stamp+'.png')).blob());
      const source=document.createElement('canvas');source.width=image.width;source.height=image.height;source.getContext('2d').drawImage(image,0,0);image.close();
      if(variant==='video') {
        const video=document.createElement('video'),stream=source.captureStream(15);video.srcObject=stream;video.muted=true;
        const pump=setInterval(()=>source.getContext('2d').drawImage(source,0,0),50);
        try {
          await video.play();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Video frame timed out')),5000);video.requestVideoFrameCallback(()=>{clearTimeout(timeout);resolve();});});
          source.getContext('2d').drawImage(video,0,0);
        }finally{clearInterval(pump);video.pause();stream.getTracks().forEach(track=>track.stop());video.srcObject=null;}
      }
      const panel=window.DNStorageRecognition.detectPanel(source),rect=panel&&window.DNScannerCore.cropPixels(panel,source.width,source.height),crop=document.createElement('canvas');
      if(!rect){runs.push({stamp:label.stamp,passed:false,error:'No panel detected'});continue;}
      crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      if(variant==='muted') {
        const ctx=crop.getContext('2d'),pixels=ctx.getImageData(0,0,crop.width,crop.height);
        for(let y=Math.round(crop.height*.151);y<crop.height*.81;y++)for(let x=Math.round(crop.width*.78);x<crop.width*.88;x++){
          const p=(y*crop.width+x)*4,r=pixels.data[p],g=pixels.data[p+1],b=pixels.data[p+2],luma=.299*r+.587*g+.114*b;
          for(let channel=0;channel<3;channel++)pixels.data[p+channel]=Math.round(pixels.data[p+channel]*.55+luma*.45);
        }
        ctx.putImageData(pixels,0,0);
      }
      const info=window.DNStorageRecognition.inspect(crop);
      const result=await engine.recognize(crop,{layout:'storage',expectedRows:info.expectedRows});
      const expected=label.rows.map(r=>({...r,name:canonPerk(r.name)}));
      const exact=result.rows.length===expected.length&&result.rows.every((r,i)=>r.name===expected[i].name&&r.value===expected[i].value);
      const hallCorrect=info.hall===label.hall&&result.hall===label.hall,rowCountCorrect=info.expectedRows===label.rows.length,category=result.artifact.type===label.type,title=normalize(result.artifact.name)===normalize(label.name),stars=result.unlocked.count===label.unlocked;
      const picture=await createImageBitmap(await(await fetch(result.artifact.image)).blob()),artwork=picture.width===192&&picture.height>100;picture.close();
      const review=result.valid||result.warnings.every(w=>w.includes('OCR evidence is weak') || w.includes('Assumed OCR spelling'));
      runs.push({stamp:label.stamp,variant,expected:label,info,exact,hallCorrect,rowCountCorrect,category,title,stars,artwork,passed:exact&&hallCorrect&&rowCountCorrect&&category&&title&&stars&&artwork&&review,...result});
      crop.width=crop.height=source.width=source.height=0;
    }
  }finally{await engine.close();}
  return {runs,passed:runs.every(r=>r.passed),limitations:'Eleven supplied English screenshots cover every shown Main/War category except Hermitage; two are genuine six-row Mythical artifacts. No live screen-sharing trial.'};
})()
