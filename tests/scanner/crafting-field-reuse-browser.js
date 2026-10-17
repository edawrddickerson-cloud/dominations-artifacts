/* Same real screenshot and OCR profile, explicit encounter-scoped replay.
 * A changed RGBA byte must miss even if preprocessing produces the same glyphs.
 * Category/stars/dice and standard fallback continue through production code. */
(async()=>{
  const R=DNScannerRecognition,F=DNScannerFieldRecognition,G=DNScannerRegions,C=DNScannerCore;
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json());
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=R.create({names,canonPerk}),runs=[],fixtures=[];
  const modelStart=performance.now();await engine.warm({fast:true});const workerStartupMs=performance.now()-modelStart;
  try{
    for(const name of ['pic1','greenissue','invaders-cyan','invaders-green']) {
      const labels=await(await fetch('../tests/scanner/'+name+'.labels.json')).json(),bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+name+'.png')).blob());
      const full=document.createElement('canvas');full.width=bitmap.width;full.height=bitmap.height;full.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      const panel=R.detectPanel(full),rect=C.cropPixels(panel,full.width,full.height),crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;
      const template=G.defaults(rect.width/rect.height,!!labels.category);
      fixtures.push({name,labels,full,panel,rect,crop,template});
      if(name==='pic1') {
        const tight=G.copy(template),manual=await(await fetch('../tests/scanner/pic1.regions.json')).json();
        const relative=box=>G.fromSource({x:box.x/full.width,y:box.y/full.height,width:box.width/full.width,height:box.height/full.height},panel);
        manual.rows.forEach((row,i)=>{tight.rows[i].name=relative(row.name);tight.rows[i].percentage=relative(row.percentage);});tight.category=relative(manual.category);
        fixtures.push({name:name+'-tight',labels,full,panel,rect,crop,template:tight});
      }
    }
    const exact=(fixture,result)=>fixture.labels.rows.every((row,i)=>result.rows[i]?.name.toLowerCase()===canonPerk(row.name).toLowerCase() && result.rows[i]?.value===row.value && !result.rows[i]?.inferred);
    const metadata=result=>JSON.stringify({artifact:result.artifact,hall:result.hall,unlocked:result.unlocked?.states,rerolls:result.rows.map(row=>[row.rerollEligible,row.rerollSource,row.rerollConfidence])});
    async function read(fixture,fieldReuse){
      const {crop,full,rect,panel,template}=fixture;
      crop.getContext('2d').drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,crop.width,crop.height);
      const start=performance.now(),result=await engine.recognize(crop,{fields:{template,panel,source:full},layout:'panel',inferColours:true,fieldReuse});
      return {elapsedMs:performance.now()-start,result};
    }
    // Warm OCR execution separately from model creation.
    await read(fixtures[0],null);
    for(let repeat=0;repeat<3;repeat++)for(const fixture of fixtures) {
      const scope={epoch:fixture.name+'-'+repeat,profile:'crafting-fast'};
      const baseline=await read(fixture,null),prime=await read(fixture,scope),cached=await read(fixture,scope);
      const fieldReads=[...cached.result.observations].reverse().find(observation=>observation.fieldReads)?.fieldReads || [];
      const separate=fixture.name.endsWith('-tight'),kind=separate?'percentage':'name';
      const target=fieldReads.findIndex(reads=>reads.some(read=>read[kind]?.reused));
      if(target<0)throw Error('No directly verified reusable '+kind+' for '+fixture.name);
      const box=G.resolve(fixture.template,fixture.panel,fixture.full).boxes[target+'-'+kind];
      const x=box.x+box.width-2,y=box.y+box.height-2,ctx=fixture.full.getContext('2d',{willReadFrequently:true});
      const original=ctx.getImageData(x,y,1,1),changed=ctx.getImageData(x,y,1,1);changed.data[0]^=1;ctx.putImageData(changed,x,y);
      let mutation;
      try{mutation=await read(fixture,scope);}finally{ctx.putImageData(original,x,y);}
      const newEncounter=await read(fixture,{...scope,epoch:scope.epoch+'-next'});
      const values=[baseline,prime,cached,mutation,newEncounter];
      runs.push({fixture:fixture.name,repeat,baselineMs:baseline.elapsedMs,primeMs:prime.elapsedMs,repeatedMs:cached.elapsedMs,changedByteMs:mutation.elapsedMs,newEncounterMs:newEncounter.elapsedMs,
        baselineCalls:baseline.result.ocrCalls,primeCalls:prime.result.ocrCalls,repeatedCalls:cached.result.ocrCalls,changedByteCalls:mutation.result.ocrCalls,newEncounterCalls:newEncounter.result.ocrCalls,
        reusedFields:cached.result.reusedFields,changedByteReusedFields:mutation.result.reusedFields,newEncounterReusedFields:newEncounter.result.reusedFields,changedField:target+'-'+kind,
        exact:values.every(value=>exact(fixture,value.result)),metadataEquivalent:values.every(value=>metadata(value.result)===metadata(baseline.result)),
        validEquivalent:values.every(value=>value.result.valid===baseline.result.valid),provenance:fieldReads[target].some(read=>read[kind]?.evidenceSource==='same-encounter-identical-pixels'),
        passed:values.every(value=>exact(fixture,value.result)) && cached.result.reusedFields>0 && cached.result.ocrCalls<=baseline.result.ocrCalls &&
          mutation.result.reusedFields===cached.result.reusedFields-1 && newEncounter.result.reusedFields===0 && values.every(value=>metadata(value.result)===metadata(baseline.result)) && values.every(value=>value.result.valid===baseline.result.valid)});
    }
    const sum=key=>runs.reduce((total,run)=>total+run[key],0);
    return {passed:runs.every(run=>run.passed) && sum('repeatedCalls')<sum('baselineCalls'),workerStartupMs,cases:runs.length,baselineMs:sum('baselineMs'),repeatedMs:sum('repeatedMs'),baselineCalls:sum('baselineCalls'),repeatedCalls:sum('repeatedCalls'),runs,
      limitations:'Warm static exact screenshot repetition and a single changed source byte; explicit same encounter/profile. The speedup applies to repeated identical directly verified fields, not new artifacts or moving text.'};
  }finally{await engine.close();for(const fixture of fixtures)fixture.full.width=fixture.full.height=fixture.crop.width=fixture.crop.height=0;}
})()
