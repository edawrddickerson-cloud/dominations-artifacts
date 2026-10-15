(async()=>{
  const checks={},check=(name,value)=>{checks[name]=!!value;if(!value)throw new Error(name);};
  const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Calibration reload timed out');};
  const blob=await(await fetch('../tests/scanner/pic1.png')).blob();
  const get=(doc,id)=>doc.getElementById('scanner-'+id);
  async function open(win) {
    const doc=win.document;
    await wait(()=>win.DNScannerCalibration && win.DNScannerRegions && get(doc,'names').children.length);
    get(doc,'auto').checked=false;get(doc,'collect').checked=false;
    get(doc,'setup').open=true;
    const transfer=new win.DataTransfer();transfer.items.add(new win.File([blob],'calibration.png',{type:'image/png'}));
    get(doc,'file').files=transfer.files;get(doc,'file').dispatchEvent(new win.Event('change'));
    await wait(()=>!get(doc,'fields-edit').disabled);
    get(doc,'fields-edit').click();
  }
  await open(window);
  const G=DNScannerRegions,full=await createImageBitmap(blob),panel=DNScannerRecognition.detectPanel(full);
  const boxes={category:{x:320/full.width,y:94/full.height,width:150/full.width,height:49/full.height},hall:{x:530/full.width,y:160/full.height,width:35/full.width,height:15/full.height}};
  for(const [id,box] of Object.entries(boxes)) {
    get(document,'fields-field').value=id;get(document,'fields-field').dispatchEvent(new Event('change'));
    const relative=G.fromSource(box,panel);
    for(const key of ['x','y','width','height']){get(document,'fields-'+key).value=String(relative[key]*100);get(document,'fields-'+key).dispatchEvent(new Event('input'));}
  }
  check('custom metadata boxes can be saved',!get(document,'fields-save').disabled);
  get(document,'fields-save').click();
  const saved=G.load(),resolved=G.resolve(saved,panel,full);
  check('saved category is above and left of panel',saved.category.x<0 && saved.category.y<0);
  const frame=document.createElement('iframe');frame.width=1400;frame.height=1000;frame.src='scanner.html';document.body.append(frame);
  await wait(()=>frame.contentWindow?.DNScannerCalibration);
  await open(frame.contentWindow);
  const other=frame.contentWindow;
  check('reload preserves saved coordinates exactly',JSON.stringify(other.DNScannerRegions.load())===JSON.stringify(saved));
  const restored=other.DNScannerRegions.resolve(other.DNScannerRegions.load(),panel,full);
  for(const id of ['category','hall']) {
    check(id+' resolves to identical pixels after reload',JSON.stringify(restored.boxes[id])===JSON.stringify(resolved.boxes[id]));
    get(other.document,'fields-field').value=id;get(other.document,'fields-field').dispatchEvent(new other.Event('change'));
    check(id+' editor restores its saved horizontal position',Math.abs(Number(get(other.document,'fields-x').value)/100-saved[id].x)<.00001);
  }
  full.close();
  return {passed:true,ui:checks};
})();
