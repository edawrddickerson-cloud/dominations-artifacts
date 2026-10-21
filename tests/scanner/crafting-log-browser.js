/* Real screenshot title OCR through the production reading/log pipeline. */
(async()=>{
  const checks={},get=id=>document.getElementById('scanner-'+id);
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  async function wait(test){const end=performance.now()+60000;while(!await test()){if(performance.now()>end)throw Error('Log test timed out');await new Promise(resolve=>setTimeout(resolve,30));}}
  await wait(()=>get('names').children.length && window.DNScannerCollection);
  get('auto').checked=false;get('collect').checked=true;
  const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/pic1.png')).blob());
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;source.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const panel=DNScannerRecognition.detectPanel(source),rect=DNScannerCore.cropPixels(panel,source.width,source.height);
  const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;crop.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,crop.width,crop.height);
  DNScannerReading.update(crop,{session:1,current:true,categorySource:source,panelRegion:panel});get('read').click();
  await wait(()=>!get('read').disabled);await DNScannerCollection.flush();
  let data=JSON.parse(await DN.scannerLog.read()),item=data.items.at(-1);
  check('real screenshot title is saved automatically',/The Yongle Emperor.s Vase/.test(item.name));
  check('scanned name source is retained',item.nameSource==='scanned');
  const entry=get('item-log').querySelector('[data-log-item]'),details=entry.querySelector('details');
  check('entry starts compact with its scanned name',!details.open && details.querySelector('summary').textContent.includes(item.name));
  check('UTC timestamp has the requested second precision',/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(entry.querySelector('time').textContent) && entry.querySelector('time').textContent===item.firstSeen.slice(0,19));
  check('name prompt removed',!entry.querySelector('[placeholder="Name this artifact"]'));
  get('read').click();await wait(()=>!get('read').disabled);await DNScannerCollection.flush();
  data=JSON.parse(await DN.scannerLog.read());
  check('retry retains one entry and its original timestamp',data.items.length===1 && data.items[0].firstSeen===item.firstSeen && data.items[0].name===item.name);
  DNScannerCollection.recordItem({...item,valid:true,artifact:{name:item.name,type:item.type}},'another-craft',{newEncounter:true,profileKey:item.profileKey});
  await DNScannerCollection.flush();
  check('same names remain separate and both are flagged',get('item-log').children.length===2 && [...get('item-log').children].every(node=>node.querySelector('summary').textContent.includes('Same name ×2')));
  const current=[...get('item-log').children].find(node=>node.dataset.logItem===item.id).querySelector('details');current.open=true;
  const input=current.querySelector('[data-log-name]');input.value='Corrected name';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
  await DNScannerCollection.flush();
  check('name correction persists and clears repeated-name flag',JSON.parse(await DN.scannerLog.read()).items.find(saved=>saved.id===item.id).name==='Corrected name' && !get('item-log').textContent.includes('Same name ×2'));
  const keptEntry=[...get('item-log').children].find(node=>node.dataset.logItem===item.id);
  const nameInput=keptEntry.querySelector('[data-log-name]'),keep=keptEntry.querySelector('[data-keep-log]');
  nameInput.focus();nameInput.value='Corrected name';nameInput.dispatchEvent(new Event('input',{bubbles:true}));keep.focus();
  check('leaving name field for Keep preserves its button',keep.isConnected && !keep.disabled);keep.click();
  await wait(()=>[...get('item-log').children].find(node=>node.dataset.logItem===item.id).querySelector('[data-keep-log]').textContent==='Kept');
  check('Keep retains the scanned entry name',(await DNStoredArtifacts.read(item.profileKey)).find(saved=>saved.id===item.keepId)?.name==='Corrected name');
  const frame=document.createElement('iframe');frame.hidden=true;frame.src='scanner.html?log-reopen';document.body.append(frame);
  await wait(()=>frame.contentWindow?.DNScannerCollection);
  const restored=[...frame.contentDocument.getElementById('scanner-item-log').children].find(node=>node.dataset.logItem===item.id);
  check('names and timestamps survive reopening',restored.textContent.includes('Corrected name') && restored.querySelector('time').textContent===item.firstSeen.slice(0,19));
  frame.remove();return {passed:true,ui:checks,recognizedName:item.name};
})()
