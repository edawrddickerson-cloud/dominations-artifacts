/* Authority: User-approved field calibration benchmark, October 2026.
 * Ownership: Local development evidence only. No uploads or rating changes.
 * Invariants: Same original pixels/labels/options on both paths; no OCR ground truth.
 * Constraints: Cropped fixtures cannot establish category/hall accuracy. */
(async () => {
  const R=window.DNScannerRecognition, C=window.DNScannerCore;
  const fixtures=window.DNRegionsFixtures || (window.DNRegionsTight?['pic1']:['pic1','greenissue','invaders-cyan','invaders-green','review-215133','review-215714','review-225540','review-225703']);
  const scales=window.DNRegionsScales || [1];
  const defaults=await(await fetch('data/perk_rating_defaults.json')).json();
  const names=Object.keys(defaults),canonPerk=window.DN.makeCanonPerk(window.DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=R.create({names,canonPerk}),runs=[];
  try {
    // Exclude model startup from all per-image timings on both paths.
    const warm=document.createElement('canvas');warm.width=400;warm.height=200;
    warm.getContext('2d').fillRect(0,0,400,200);
    await engine.recognize(warm,{layout:'text'});warm.width=warm.height=0;
    for(const fixture of fixtures)for(const scale of scales) {
      const labels=await(await fetch('../tests/scanner/'+fixture+'.labels.json')).json();
      const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+fixture+'.png')).blob());
      const full=document.createElement('canvas');full.width=Math.round(bitmap.width*scale);full.height=Math.round(bitmap.height*scale);full.getContext('2d').drawImage(bitmap,0,0,full.width,full.height);bitmap.close();
      const panel=R.detectPanel(full),rect=C.cropPixels(panel,full.width,full.height);
      if(!rect)throw new Error('Missing panel: '+fixture);
      const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      let categorySource=null;
      if(labels.category) {
        const box=R.categoryRect(full,panel);categorySource=document.createElement('canvas');categorySource.width=box.width*2;categorySource.height=box.height*2;
        const ctx=categorySource.getContext('2d',{willReadFrequently:true});ctx.drawImage(full,box.x,box.y,box.width,box.height,0,0,categorySource.width,categorySource.height);
        const pixels=ctx.getImageData(0,0,categorySource.width,categorySource.height);
        for(let i=0;i<pixels.data.length;i+=4){const [r,g,b]=pixels.data.slice(i,i+3),v=g>90 && g>r*1.25 && g>b*.8?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
        ctx.putImageData(pixels,0,0);
      }
      const options={layout:'panel',hall:'main',inferColours:true,categorySource};
      if(!window.DNRegionsBaseline) {
        const template=window.DNScannerRegions.defaults(rect.width/rect.height,!!labels.category);
        if(window.DNRegionsTight) {
          const manual=await(await fetch('../tests/scanner/pic1.regions.json')).json();
          const relative=box=>window.DNScannerRegions.fromSource({x:box.x/full.width,y:box.y/full.height,width:box.width/full.width,height:box.height/full.height},panel);
          manual.rows.forEach((row,i)=>{template.rows[i].name=relative(row.name);template.rows[i].percentage=relative(row.percentage);});
          template.category=relative(manual.category);
        }
        options.fields={template,panel,source:full};
      }
      const start=performance.now(),result=await engine.recognize(crop,options),elapsedMs=performance.now()-start;
      const expected=labels.rows.map(row=>({...row,name:names.find(name=>name.toLowerCase()===canonPerk(row.name).toLowerCase()) || canonPerk(row.name)}));
      const inspect=rows=>({names:expected.filter((row,i)=>rows[i]?.name===row.name).length,percentages:expected.filter((row,i)=>rows[i]?.value===row.value).length,directPercentages:expected.filter((row,i)=>rows[i]?.value===row.value && !rows[i]?.inferred).length});
      const accuracy=inspect(result.rows),first=inspect(result.observations?.[0]?.rows || result.rows);
      const expectedCount=labels.unlocked || 1,stars=Array.from({length:5},(_,i)=>i<expectedCount);
      const starsCorrect=stars.filter((state,i)=>result.unlocked?.states[i]===state).length;
      const categoryCorrect=labels.category?result.artifact?.type===labels.category:null;
      const firstCategoryCorrect=labels.category?result.observations?.[0]?.artifact?result.observations[0].artifact.type===labels.category:window.DNRegionsBaseline?categoryCorrect:false:null;
      runs.push({fixture,scale,elapsedMs,accuracy,first,starsCorrect,categoryCorrect,firstCategoryCorrect,allStats:accuracy.names===5 && accuracy.percentages===5,complete:accuracy.names===5 && accuracy.percentages===5 && starsCorrect===5 && (categoryCorrect ?? true),fullArtifactAssessable:!!labels.category,confidentlyIncorrect:result.valid && (accuracy.names!==5 || accuracy.percentages!==5),missingRows:result.rows.filter(row=>!row.name).length,extraRows:Math.max(0,result.rows.length-5),retry:result.observations?.length>1,ocrCalls:result.ocrCalls,...result});
      full.width=full.height=crop.width=crop.height=0;if(categorySource)categorySource.width=categorySource.height=0;
    }
  } finally {await engine.close();}
  return {mode:window.DNRegionsBaseline?'baseline':window.DNRegionsTight?'manual-tight':'calibrated',browser:navigator.userAgent,runs,passed:runs.length===fixtures.length*scales.length && runs.every(run=>!run.confidentlyIncorrect && run.complete),limitations:'Repository screenshots and Canvas-derived scale probes, not a representative live-capture dataset. Most images omit category/hall pixels. Seeded overlapping name/value regions test one broad template; the separate tight run uses hand-selected pixel boxes on pic1 only. Timings exclude model startup.'};
})()
