/* Authority: Stored-item screenshot supplied by user, independently transcribed.
 * Ownership: Actual local OCR and page lifecycle regression evidence.
 * Constraints: Local-file capture only; six-row checks use the real Ruyi fixture. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),storage=id=>document.getElementById('storage-'+id);
  const wait=async fn=>{const deadline=performance.now()+30000;while(!fn()){if(performance.now()>deadline)throw new Error('Timed out: '+get('result-status').textContent+' '+get('warnings').textContent);await new Promise(r=>setTimeout(r,50));}};
  await wait(()=>get('names').children.length);
  get('auto').checked=false;
  const blob=await(await fetch('../tests/scanner/storage-kusarigama.png')).blob();
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const expected=[{name:'Enemy Defender Spawn Time',value:13},{name:'MRL Hitpoints',value:6},{name:"Generals' Hitpoints",value:11},{name:'Heavy Infantry Hitpoints',value:1},{name:'Tactical Helicopter Hitpoints',value:1}];
  const factory=await(await fetch('data/perk_rating_defaults.json')).json(),names=Object.keys(factory),canonPerk=window.DN.makeCanonPerk(window.DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  expected.forEach(row=>row.name=canonPerk(row.name));
  const engine=window.DNScannerRecognition.create({names,canonPerk}),runs=[];
  const candidate=window.DNStorageRecognition.detectPanel(canvas);
  try {
    for(const kind of ['full','detected','scaled','real-six-rows']) {
      let input=canvas;
      if(kind==='detected' && candidate) {
        const rect=window.DNScannerCore.cropPixels(candidate,canvas.width,canvas.height);input=document.createElement('canvas');input.width=rect.width;input.height=rect.height;input.getContext('2d').drawImage(canvas,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      }
      if(kind==='scaled') {input=document.createElement('canvas');input.width=Math.round(canvas.width*.75);input.height=Math.round(canvas.height*.75);input.getContext('2d').drawImage(canvas,0,0,input.width,input.height);}
      if(kind==='real-six-rows') {
        const image=await createImageBitmap(await(await fetch('../tests/scanner/storage-231706.png')).blob());
        input=document.createElement('canvas');input.width=image.width;input.height=image.height;input.getContext('2d').drawImage(image,0,0);image.close();
        const region=window.DNScannerCore.cropPixels(window.DNStorageRecognition.detectPanel(input),input.width,input.height),cropped=document.createElement('canvas');
        cropped.width=region.width;cropped.height=region.height;cropped.getContext('2d').drawImage(input,region.x,region.y,region.width,region.height,0,0,region.width,region.height);input.width=input.height=0;input=cropped;
      }
      const count=kind==='real-six-rows'?6:5,labels=count===6?(await(await fetch('../tests/scanner/storage-coverage.labels.json')).json()).find(l=>l.stamp==='231706').rows.map(r=>({...r,name:canonPerk(r.name)})):expected;
      const result=await engine.recognize(input,{layout:'storage',expectedRows:count,inferColours:true});
      const exact=JSON.stringify(result.rows.map(({name,value})=>({name,value})))===JSON.stringify(labels);
      const expectedLevels=count===6?[10,10,8,8,10,10]:[3,1,1,1,1];
      const levels=result.rows.every((r,i)=>r.level===expectedLevels[i]);
      const ranges=result.rows.every(r=>r.level==null?r.base==null && r.max==null:
        r.base===Math.sign(r.value)*(Math.abs(r.value)-(r.level-1)) && r.max===r.base+Math.sign(r.value)*9);
      const safeLevels=result.rows.every((r,i)=>r.level===null || r.level===expectedLevels[i]);
      const stars=result.unlocked.count===(count===6?6:1) && result.rows.every((r,i)=>r.unlocked===(count===6||i===0));
      const metadata=result.artifact.name===(count===6?'Ruyi Scepter':'Kusarigama') && result.artifact.type===(count===6?'Mythical':'Weapon') && result.artifact.image.startsWith('data:image/jpeg;base64,');
      const tiers=count===6?result.rows.every(row=>row.tier===null && row.tierSource===null):result.rows.every((row,i)=>row.level===null?row.tier===null:row.tier===['blue','green','blue','white','white'][i] && row.tierSource==='percentage-level');
      runs.push({kind,exact,levels,ranges,safeLevels,stars,metadata,tiers,passed:exact&&safeLevels&&ranges&&tiers&&(kind==='scaled'||levels)&&stars&&metadata&&(result.valid || result.warnings.every(w=>w.includes('OCR evidence is weak') || w.includes('Assumed OCR spelling')))&&(kind!=='detected'||!!candidate),...result});
      if(input!==canvas)input.width=input.height=0;
    }
  }finally{await engine.close();}
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'storage.png',{type:'image/png'}));get('file').files=transfer.files;get('file').dispatchEvent(new Event('change'));
  await wait(()=>get('crop').width!==640);
  get('read').click();await wait(()=>get('progress').textContent.startsWith('Finished'));
  await wait(()=>!storage('saved').textContent.startsWith('Loading'));
  const ui={metadata:storage('name').value==='Kusarigama'&&storage('type').value==='Weapon',automaticRating:!storage('keep').disabled,status:get('result-status').textContent,warnings:get('warnings').textContent};
  ui.picture=!storage('picture').hidden&&storage('picture').src.startsWith('data:image/jpeg;base64,');
  const edits=[...get('correct').querySelectorAll('.scanner-edit-row')];
  ui.automaticRanges=edits.every((row,i)=>Number(row.querySelector('.scanner-perk-base').value)===expected[i].value-(i===0?2:0) && Number(row.querySelector('.scanner-perk-max').value)===expected[i].value-(i===0?2:0)+9);
  for(let i=0;i<edits.length;i++){
    edits[i].querySelector('.scanner-perk-name').value=expected[i].name;
    edits[i].querySelector('.scanner-perk-value').value=expected[i].value;
    edits[i].querySelector('.scanner-perk-level').value=i===0?3:1;
    edits[i].querySelector('.scanner-perk-unlocked').value=i===0?'true':'false';
  }
  edits[4].querySelector('.scanner-perk-name').value='Uncatalogued Unit Hitpoints';
  get('correct').dispatchEvent(new Event('input'));get('accept').click();
  ui.unknownCorrectionVisible=storage('keep').disabled&&get('correction-status').textContent.includes('Row 5: "Uncatalogued Unit Hitpoints"')&&storage('keep-status').textContent.includes('not a known perk')&&edits[4].querySelector('.scanner-perk-name').getAttribute('aria-invalid')==='true';
  edits[4].querySelector('.scanner-perk-name').value=expected[4].name;
  get('correct').dispatchEvent(new Event('input'));get('accept').click();
  ui.ready=!storage('keep').disabled;
  ui.correctedLevels=[...get('correct').querySelectorAll('.scanner-perk-level')].every((input,i)=>Number(input.value)===(i===0?3:1));
  storage('keep').click();ui.kept=storage('items').children.length===1&&!storage('export').disabled;
  ui.thumbnail=storage('items').querySelector('img').src===storage('picture').src;
  storage('keep').click();ui.duplicates=storage('items').children.length===2;
  storage('items').querySelector('[data-remove]').click();ui.removed=storage('items').children.length===1;
  const createURL=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let exportBlob=null,download='';
  URL.createObjectURL=blob=>{exportBlob=blob;return createURL(blob);};HTMLAnchorElement.prototype.click=function(){download=this.download;};
  try{storage('export').click();}finally{URL.createObjectURL=createURL;HTMLAnchorElement.prototype.click=click;}
  const exported=exportBlob?JSON.parse(await exportBlob.text()):null;
  ui.exported=download.startsWith('stored-artifacts-')&&exported?.items.length===1&&exported.items[0].type==='Weapon'&&exported.items[0].rows.every((r,i)=>r.name===expected[i].name&&r.value===expected[i].value&&r.level===(i===0?3:1));
  ui.exportedPicture=exported?.version===3&&exported.items[0].image===storage('picture').src;
  ui.exportedTiers=exported.items[0].rows.every((row,i)=>row.tier===['blue','green','blue','white','white'][i] && row.tierSource==='percentage-level');
  // A complete low-confidence read can be explicitly reviewed with Keep.
  // Structural errors, disagreements, pending edits and stale reads still block it.
  const weak=structuredClone(runs.find(r=>r.kind==='detected'));
  weak.valid=false;weak.warnings=['Row 1: OCR evidence is weak. Verify the name and percentage.'];
  const review={reviewable:true,expectedRows:5};
  window.DNStorageScanner.update(weak,false,review);
  ui.weakCanKeep=!storage('keep').disabled&&storage('keep-status').textContent.includes('confirms');
  storage('keep').click();ui.weakKept=storage('items').children.length===2;
  storage('items').querySelector('[data-remove="1"]').click();
  const invalids=[
    {rows:weak.rows.slice(0,4)},
    {rows:weak.rows.map((row,i)=>i===0?{...row,known:false,name:'Unknown perk'}:row)},
    {rows:weak.rows.map((row,i)=>i===0?{...row,value:null}:row)},
    {rows:weak.rows.map((row,i)=>i===0?{...row,value:-13}:row)},
    {rows:weak.rows.map((row,i)=>i===0?{...row,conflict:true}:row)},
    {warnings:['OCR reads disagree about perk names or values. Verify the conflicting rows.']}
  ];
  ui.invalidBlocked=invalids.every(change=>{
    window.DNStorageScanner.update({...weak,...change},false,review);
    const blocked=storage('keep').disabled&&!!storage('keep-status').textContent;storage('keep').click();
    return blocked&&storage('items').children.length===1;
  });
  ui.greyed=getComputedStyle(storage('keep')).opacity==='0.5'&&getComputedStyle(storage('keep')).cursor==='not-allowed';
  window.DNStorageScanner.update(weak,false,{...review,reviewable:false,pending:true});
  ui.pendingBlocked=storage('keep').disabled&&storage('keep-status').textContent.includes('Use Corrected Values');
  window.DNStorageScanner.update(weak,false,{...review,reviewable:false});ui.staleBlocked=storage('keep').disabled;
  window.DNStorageScanner.update(weak,false,review);storage('type').value='';storage('type').dispatchEvent(new Event('input'));
  ui.categoryBlocked=storage('keep').disabled&&storage('keep-status').textContent.includes('category');
  const mythical=await(await fetch('../tests/scanner/storage-231751.png')).blob(),nextFile=new DataTransfer();nextFile.items.add(new File([mythical],'mythical.png',{type:'image/png'}));get('file').files=nextFile.files;get('file').dispatchEvent(new Event('change'));
  await wait(()=>get('message').textContent.includes('All visible perk rows'));
  await wait(()=>!get('read').disabled&&storage('name').value==='');
  get('read').click();await wait(()=>get('progress').textContent.startsWith('Finished')&&storage('name').value==='Maori War Club');
  ui.switchedItem=get('rows').value==='6'&&get('hall').value==='war'&&get('correct').querySelectorAll('.storage-read-stat').length===6&&storage('picture').src!==exported.items[0].image;
  get('rows').value='5';get('rows').dispatchEvent(new Event('change'));
  ui.changedSettingsDisabledKeep=storage('keep').disabled;
  get('stop').click();ui.stopCleared=get('read').disabled&&storage('keep').disabled&&storage('name').value==='';ui.retained=storage('items').children.length===1&&!storage('export').disabled;
  const restored=document.createElement('iframe');restored.src='storage-scanner.html';document.body.appendChild(restored);
  await wait(()=>restored.contentDocument?.getElementById('storage-items')?.children.length===1);
  const savedItem=restored.contentDocument.getElementById('storage-items').firstElementChild;
  ui.restored=savedItem.textContent.includes('Kusarigama')&&savedItem.textContent.includes('Enemy Defender Spawn Time +13%')&&savedItem.querySelector('img').src===exported.items[0].image;
  const persisted=(await restored.contentWindow.DNStoredArtifacts.read('items'))[0];
  ui.restoredTiers=persisted.rows.every((row,i)=>row.tier===exported.items[0].rows[i].tier && row.tierSource===exported.items[0].rows[i].tierSource) && savedItem.textContent.includes('Blue tier');
  restored.remove();
  const imported=window.DNStoredArtifacts.merge([],exported.items);
  ui.collectionTiers=imported.added===1 && imported.collection[0].rows.every((row,i)=>row.tier===exported.items[0].rows[i].tier && row.tierSource===exported.items[0].rows[i].tierSource);
  if(!ui.exportedTiers || !ui.restoredTiers || !ui.collectionTiers)throw new Error('Storage tier metadata was lost on export, reload or collection import');
  return {candidate,runs,ui,passed:runs.every(r=>r.passed)&&ui.automaticRanges&&ui.metadata&&ui.ready&&ui.correctedLevels&&ui.kept&&ui.duplicates&&ui.removed&&ui.exported&&ui.picture&&ui.thumbnail&&ui.exportedPicture&&ui.restored&&ui.switchedItem&&ui.changedSettingsDisabledKeep&&ui.stopCleared&&ui.retained&&ui.weakCanKeep&&ui.weakKept&&ui.invalidBlocked&&ui.greyed&&ui.pendingBlocked&&ui.staleBlocked&&ui.categoryBlocked&&ui.unknownCorrectionVisible,limitations:'Real five-row and six-row English storage screenshots; scaled five-row probe is synthetic. Inventory is restored in a second page on the same origin. No live capture trial. Upgrade levels are best effort; unreadable levels remain null until manually corrected.'};
})()
