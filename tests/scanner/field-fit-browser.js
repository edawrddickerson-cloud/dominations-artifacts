/* Local screenshot OCR and isolated worker failure/cancellation checks. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),field=id=>get('fields-'+id),G=DNScannerRegions,checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const wait=async fn=>{const until=performance.now()+20000;while(!fn()){if(performance.now()>until)throw Error('Timed out: '+field('feedback').textContent);await new Promise(r=>setTimeout(r,25));}};
  const fire=element=>element.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>get('names').children.length);
  get('auto').checked=false;get('setup').open=true;
  const blob=await(await fetch('../tests/scanner/pic1.png')).blob();
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'local.png',{type:'image/png'}));get('file').files=transfer.files;fire(get('file'));
  await wait(()=>!field('edit').disabled);field('edit').click();
  const full=await createImageBitmap(blob),panel=DNScannerRecognition.detectPanel(full);
  const manual=await(await fetch('../tests/scanner/pic1.regions.json')).json();
  function edit(id,rect){
    field('field').value=id;fire(field('field'));
    const box=G.fromSource({x:rect.x/full.width,y:rect.y/full.height,width:rect.width/full.width,height:rect.height/full.height},panel);
    for(const key of ['x','y','width','height']){field(key).value=String(box[key]*100);field(key).dispatchEvent(new Event('input'));}
  }
  manual.rows.forEach((row,i)=>{edit(i+'-name',row.name);edit(i+'-percentage',row.percentage);});
  const template=G.defaults(panel.width*full.width/(panel.height*full.height));
  for(const [i,row] of manual.rows.entries())for(const kind of ['name','percentage']) {
    const r=row[kind];G.assign(template,i+'-'+kind,G.fromSource({x:r.x/full.width,y:r.y/full.height,width:r.width/full.width,height:r.height/full.height},panel));
  }
  const names=Array.from(get('names').children,option=>option.value),engine=DNScannerRecognition.create({names,canonPerk:value=>value});
  try {
    const worker=await engine.warm();
    async function read(template,autoFit) {
      const frozen=DNScannerFieldRecognition.snapshot({template,panel,source:full});let calls=0;
      try{return await DNScannerFieldRecognition.recognize(frozen,{worker,names,canonPerk:value=>value,autoFit,isClosed:()=>false,ocrCalls:()=>calls,readView:async(...args)=>{calls++;return worker.recognize(...args);}});}
      finally {frozen.release();}
    }
    const clear=await read(template,true);
    check('clear scan skips automatic fitting',!clear.observations.some(o=>o.fieldReads?.some(row=>row.some(read=>read.pass.startsWith('auto-fit')))));
    for(const kind of ['name','percentage']) {
      const narrow=G.copy(template),b=narrow.rows[0][kind],fraction=kind==='name'?.8:.6;b.x+=b.width*(1-fraction)/2;b.width*=fraction;
      const before=JSON.stringify(narrow),baseline=await read(narrow,false),recovered=await read(narrow,true);
      check(kind+' undersized scan is initially poor',!baseline.valid);
      check(kind+' scan automatically recovers correct values',recovered.rows[0].name==='Air Defense Damage' && recovered.rows[0].value===1 && !recovered.rows[0].conflict);
      check(kind+' scan records expansion evidence',recovered.observations.some(o=>o.fieldReads?.[0]?.some(read=>read.pass==='auto-fit-'+kind)));
      check(kind+' scan never saves or mutates calibration',JSON.stringify(narrow)===before && G.load()===null);
      check(kind+' scan preserves other rows',recovered.rows.slice(1).every((row,i)=>row.name===clear.rows[i+1].name && row.value===clear.rows[i+1].value));
    }
  } finally {await engine.close();}
  // Shift the real text slightly inside its original gold frame. This tests
  // ordinary scanning without a saved field template, using original glyphs.
  const standard=DNScannerRecognition.create({names,canonPerk:value=>value});
  const panelRect=DNScannerCore.cropPixels(panel,full.width,full.height),shifted=document.createElement('canvas'),text=document.createElement('canvas');
  shifted.width=panelRect.width;shifted.height=panelRect.height;
  const ctx=shifted.getContext('2d');ctx.drawImage(full,panelRect.x,panelRect.y,panelRect.width,panelRect.height,0,0,shifted.width,shifted.height);
  text.width=Math.round(shifted.width*.84);text.height=Math.round(shifted.height*.657);
  text.getContext('2d').drawImage(shifted,shifted.width*.115,shifted.height*.275,shifted.width*.84,shifted.height*.657,0,0,text.width,text.height);
  ctx.fillStyle='#17191c';ctx.fillRect(shifted.width*.086,shifted.height*.275,shifted.width*.869,shifted.height*.657);
  ctx.drawImage(text,shifted.width*.086,shifted.height*.275);
  try {
    const before=await standard.recognize(shifted,{layout:'panel',autoFit:false});
    const after=await standard.recognize(shifted,{layout:'panel'});
    check('ordinary scan starts with clipped text',!before.valid);
    check('ordinary scan automatically fits without saved calibration',after.autoFitReads?.length>0 && after.rows.every((row,i)=>row.name===['Air Defense Damage','Sniper Tower Hitpoints','Catapult Hitpoints','Catapult Damage','Catapult Damage'][i] && row.value===1));
  } finally {await standard.close();shifted.width=shifted.height=text.width=text.height=0;}
  // Real OCR must recover undersized fields without saving or publishing a read.
  for(const kind of ['name','percentage']) {
    const rect=manual.rows[0][kind],width=rect.width*.8;
    edit('0-'+kind,{...rect,x:rect.x+(rect.width-width)/2,width});
    const before=Number(field('width').value);
    field('fit').click();
    check(kind+' auto fit disables save while reading',field('save').disabled);
    await wait(()=>!field('fit').disabled);
    check(kind+' auto fit finds a stable real OCR reading',field('feedback').textContent.startsWith('Fit found'));
    check(kind+' auto fit expands the box',Number(field('width').value)>before);
    check(kind+' auto fit leaves saving explicit',G.load()===null && !field('save').disabled);
    edit('0-'+kind,rect);
  }
  const create=DNScannerRecognition.create;
  try {
    let calls=0;
    DNScannerRecognition.create=()=>({warm:async()=>({setParameters:async()=>{},recognize:async()=>{calls++;return {data:{text:'unreadable',confidence:99}};}}),close:async()=>{}});
    edit('0-name',manual.rows[0].name);
    const before=['x','y','width','height'].map(key=>Number(field(key).value));
    field('fit').click();await wait(()=>!field('fit').disabled);
    check('failed auto fit is bounded and retains original box',calls<=9 && calls>0 && field('feedback').textContent.includes('Original box retained') && before.every((value,i)=>Math.abs(value-Number(field(['x','y','width','height'][i]).value))<.00051));
    let finish,started=false;
    DNScannerRecognition.create=()=>({warm:async()=>({setParameters:async()=>{},recognize:()=>{started=true;return new Promise(resolve=>{finish=resolve;});}}),close:async()=>{}});
    field('fit').click();await wait(()=>started);
    field('field').value='1-name';fire(field('field'));
    finish({data:{text:'Air Defense Damage',confidence:99}});
    await new Promise(resolve=>setTimeout(resolve,50));
    check('field change cancels stale fit and restores controls',!field('fit').disabled && !field('save').disabled && field('field').value==='1-name');
    field('field').value='category';fire(field('field'));
    check('auto fit is unavailable for non-text fields',field('fit').disabled);
  } finally {DNScannerRecognition.create=create;}

  // Saving remains explicit; Cancel must leave the browser template untouched.
  field('cancel').click();check('cancel retains unsaved template',G.load()===null && field('editor').hidden);
  field('edit').click();
  field('fit').focus();field('fit').scrollIntoView({block:'center'});
  check('auto fit control fits viewport',field('fit').getBoundingClientRect().right<=innerWidth && document.documentElement.scrollWidth<=innerWidth+1);
  full.close();
  return {passed:true,checks,limitations:'One real crafting screenshot; storage field geometry and other captures are not an accuracy audit.'};
})();
