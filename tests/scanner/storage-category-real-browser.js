/* Real Mythical pixels/controller, following a deliberately wrong edition. */
(async()=>{
  const checks={},get=id=>document.getElementById('storage-'+id),scanner=id=>document.getElementById('scanner-'+id);
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  async function wait(fn){const until=performance.now()+60000;while(!await fn()){if(performance.now()>until)throw Error('Category correction timed out: '+scanner('result-status').textContent);await new Promise(resolve=>setTimeout(resolve,25));}}
  await wait(()=>window.DNScannerReading && scanner('names').children.length && !get('saved').textContent.startsWith('Loading'));
  window.DNConsent?.set({});scanner('auto').checked=false;scanner('collect').checked=false;scanner('layout').value='storage';
  const labels=await(await fetch('../tests/scanner/storage-coverage.labels.json')).json();
  const create=window.DNScannerRecognition.create,templates=localStorage.getItem(DNStorageRegions.KEY);
  const canon=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  let actual=null,seenOptions=null;
  try {
    for(const label of labels.filter(item=>/Mythical$/.test(item.type))) {
      const image=await createImageBitmap(await(await fetch('../tests/scanner/storage-'+label.stamp+'.png')).blob());
      const full=document.createElement('canvas');full.width=image.width;full.height=image.height;full.getContext('2d').drawImage(image,0,0);image.close();
      const panel=DNStorageRecognition.detectPanel(full),rect=DNScannerCore.cropPixels(panel,full.width,full.height),crop=document.createElement('canvas');
      crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,crop.width,crop.height);
      const wrongType=label.type.replace('Mythical','Legendary');
      let first=true;
      window.DNScannerRecognition.create=options=>{
        const engine=create(options);
        return {warm:async()=>{},close:()=>engine.close(),recognize:async(source,options)=>{
          if(first){first=false;return {expectedRows:5,valid:false,warnings:['Initial wrong edition'],hall:label.hall,
            artifact:{name:label.name,type:wrongType,hall:label.hall},rows:label.rows.slice(0,5).map(row=>({...row,known:true,hasPercent:true,level:null,unlocked:null}))};}
          seenOptions=options;actual=await engine.recognize(source,options);return actual;
        }};
      };
      DNScannerReading.reset();
      const template=DNStorageRegions.defaults(crop.width/crop.height,5),before=JSON.stringify(template);
      DNScannerReading.update(crop,{session:label.stamp,current:true,fields:{template,source:crop,panel:{x:0,y:0,width:1,height:1}}});scanner('read').click();
      await wait(()=>scanner('progress').textContent==='Finished' && get('type').value===wrongType);
      get('type').value=label.type;get('type').dispatchEvent(new Event('input',{bubbles:true}));
      check(label.type+' immediately selects six fields',scanner('rows').value==='6' && scanner('correct').querySelectorAll('.scanner-edit-row').length===6);
      check(label.type+' discards wrong-layout stats',Array.from(scanner('correct').querySelectorAll('.scanner-perk-value')).every(input=>input.value===''));
      await wait(()=>scanner('progress').textContent==='Finished' && get('type').value===label.type);
      check(label.type+' correction reaches real OCR',seenOptions.manualType===label.type && seenOptions.expectedRows===6);
      check(label.type+' rereads all six signed stats',actual.rows.length===6 && actual.rows.every((row,index)=>row.name===canon(label.rows[index].name) && row.value===label.rows[index].value));
      check(label.type+' preserves category and Hall',actual.artifact.type===label.type && actual.artifact.typeSource==='manual' && actual.hall===label.hall);
      check(label.type+' preserves saved calibration',JSON.stringify(template)===before && localStorage.getItem(DNStorageRegions.KEY)===templates);
      check(label.type+' has an editable sixth stat',scanner('correct').querySelectorAll('.scanner-perk-name')[5].value===actual.rows[5].name);
      // Live capture reloads the six-row calibration after the selector changes.
      // That geometry change belongs to the same corrected artifact.
      const six=DNStorageRegions.defaults(crop.width/crop.height,6);actual=null;
      DNScannerReading.update(crop,{session:label.stamp,current:true,fields:{template:six,source:crop,panel:{x:0,y:0,width:1,height:1}}});scanner('read').click();
      await wait(()=>actual && scanner('progress').textContent==='Finished');
      check(label.type+' correction survives calibration layout refresh',seenOptions.manualType===label.type && actual.rows.length===6);
      crop.width=crop.height=full.width=full.height=0;actual=null;
    }
    return {passed:true,ui:checks};
  } finally {DNScannerReading.reset();window.DNScannerRecognition.create=create;}
})()
