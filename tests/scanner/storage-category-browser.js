/* Category correction with the actual scanner controller and editor. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const wait=async fn=>{for(let i=0;i<600;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Category fixture timeout: '+get('result-status').textContent+' '+fn.toString());};
  await wait(()=>window.DNScannerReading && get('names').children.length && !document.getElementById('storage-saved').textContent.startsWith('Loading'));
  get('layout').value='storage';get('auto').checked=false;get('collect').checked=false;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  window.DNStorageRecognition.inspect=()=>({expectedRows:5,hall:'war'});
  const keepRows=Array.from({length:5},()=>({name:'Heavy Tank Damage',value:13,known:true,hasPercent:true,level:3,levelSource:'ocr',unlocked:true,rerollEligible:false,rerollSource:'visual'}));
  window.DNScannerReading.reset();get('auto').checked=false;get('rows').value='5';
  let lastOptions=null,releaseOld=null,readingOld=false,reads=0;
  const editionRead=(type,count)=>({valid:true,warnings:[],expectedRows:count,rows:Array.from({length:count},(_,i)=>({...keepRows[i%5],name:'Heavy Tank Damage',value:i+1,level:1})),artifact:{name:'Manual edition fixture',type,hall:'war',image:canvas.toDataURL('image/jpeg')}});
  window.DNScannerRecognition.create=()=>({close:async()=>{},recognize:async(source,options)=>{
    lastOptions=options;reads++;
    if(reads===2){readingOld=true;return new Promise(resolve=>releaseOld=()=>resolve(editionRead('War Legendary',5)));}
    const type=options.manualType || 'War Legendary';return editionRead(type,/Mythical$/.test(type)?6:5);
  }});
  window.DNScannerReading.update(canvas,{session:6,current:true});get('read').click();
  await wait(()=>get('progress').textContent.startsWith('Finished') && get('correct').querySelectorAll('.scanner-edit-row').length===5);
  check('incorrect Legendary read initially shows five rows',document.getElementById('storage-type').value==='War Legendary');
  get('read').click();await wait(()=>readingOld);
  const editionCategory=document.getElementById('storage-type');editionCategory.value='War Mythical';editionCategory.dispatchEvent(new Event('input',{bubbles:true}));
  check('manual War Mythical immediately opens six stat slots',get('rows').value==='6' && get('correct').querySelectorAll('.scanner-edit-row').length===6 && editionCategory.value==='War Mythical');
  const correctedFive=[...get('correct').querySelectorAll('.scanner-perk-value')].slice(0,5).map(input=>input.value);
  check('wrong-layout values are discarded before the corrected reread',correctedFive.every(value=>value===''));
  check('new sixth row stays unknown instead of inventing a stat',get('correct').querySelectorAll('.scanner-perk-name')[5].value==='' && get('correct').querySelectorAll('.scanner-perk-value')[5].value==='');
  releaseOld();await wait(()=>!get('read').disabled);
  check('in-flight Legendary retry cannot undo a manual Mythical choice',get('rows').value==='6' && editionCategory.value==='War Mythical' && get('correct').querySelectorAll('.scanner-edit-row').length===6);
  await wait(()=>reads===3 && get('progress').textContent.startsWith('Finished'));
  check('next OCR read receives the manual six-row category',lastOptions.manualType==='War Mythical' && lastOptions.expectedRows===6 && get('correct').querySelectorAll('.scanner-edit-row').length===6);
  editionCategory.value='War Legendary';editionCategory.dispatchEvent(new Event('input',{bubbles:true}));
  check('switching back to War Legendary immediately restores five slots',get('rows').value==='5' && get('correct').querySelectorAll('.scanner-edit-row').length===5 && editionCategory.value==='War Legendary');
  window.DNScannerReading.reset();window.DNScannerReading.update(canvas,{session:7,current:true});get('read').click();
  await wait(()=>get('progress').textContent.startsWith('Finished'));
  check('manual edition correction never leaks into the next artifact',lastOptions.manualType===null && get('rows').value==='5');
  return {passed:true,ui:checks};
})();
