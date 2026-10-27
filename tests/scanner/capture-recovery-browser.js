/* Real capture controller/calibration UI with a local canvas stream and synthetic
 * War OCR results. Verifies recovery, not recognition accuracy or permissions. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const wait=async predicate=>{const until=performance.now()+15000;while(!predicate()){if(performance.now()>until)throw Error('Recovery timed out: '+get('result-status').textContent);await new Promise(resolve=>setTimeout(resolve,30));}};
  const change=element=>element.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>get('names').children.length);
  get('auto').checked=false;DNScannerCollection.isEnabled=()=>false;
  get('setup').open=true;
  let calls=0,seenFields=null;
  DNScannerRecognition.create=()=>({warm:async()=>{},isWarm:()=>false,close:async()=>{},recognize:async(source,options)=>{
    calls++;seenFields=options.fields;
    return {valid:true,artifact:{type:'Equipment'},hall:'war',hallSource:'manual',warnings:[],
      unlocked:{count:2,states:[true,true,false,false,false]},rows:Array.from({length:5},(_,i)=>({
        name:'Heavy Tank Damage',value:11,base:11,max:20,known:true,hasPercent:true,level:1,
        levelSource:'crafting',unlocked:i<2,rerollEligible:false,rerollSource:'manual'}))};
  }});
  const blob=await(await fetch('../tests/scanner/pic1.png')).blob(),bitmap=await createImageBitmap(blob);
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;
  const ctx=source.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,source.width,source.height);
  const stream=source.captureStream(10);
  Object.defineProperty(window.parent.navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  get('connect').click();
  await wait(()=>get('video').srcObject && !get('stop').disabled);
  await new Promise(resolve=>setTimeout(resolve,300));
  check('connection without a panel leaves calibration disabled',get('fields-edit').disabled);
  ctx.drawImage(bitmap,0,0);
  await wait(()=>!get('fields-edit').disabled);
  check('later panel automatically creates the preview',get('crop').width>500 && get('crop').width<bitmap.width && get('select').getAttribute('aria-pressed')==='false');
  const panel=DNScannerRecognition.detectPanel(source);
  get('fields-edit').click();
  check('automatically located panel opens calibration',!get('fields-editor').hidden && get('read').disabled);
  get('fields-save').click();
  check('field coordinates save',DNScannerCalibration.hasTemplate);
  get('stop').click();
  check('stop clears calibration source',get('fields-edit').disabled && get('read').disabled);
  DNScannerRecognition.detectPanel=()=>null;
  get('auto').checked=true;
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'manual-panel.png',{type:'image/png'}));
  get('file').files=transfer.files;change(get('file'));
  await wait(()=>get('status').textContent==='Local screenshot' && !get('file').disabled);
  check('missing automatic anchor still pauses saved-field reads',get('read').disabled && get('fields-edit').disabled && calls===0);
  for(const key of ['x','y','width','height'])get(key).value=String(panel[key]*100);
  get('apply').click();
  check('explicit region enables calibration',!get('fields-edit').disabled);
  await wait(()=>calls>0 && get('result').querySelectorAll('.scanner-perk').length===5 && get('progress').textContent.startsWith('Finished'));
  check('manual selection automatically starts a read with saved fields',!!seenFields && seenFields.panel.x===panel.x);
  check('War result reaches the five stat rows',get('hall').value==='war' && [...get('result').querySelectorAll('.scanner-perk')].every(row=>row.textContent.includes('Heavy Tank Damage')));
  get('fields-edit').click();
  check('manual selection opens calibration on a frozen source',!get('fields-editor').hidden && get('read').disabled);
  get('stop').click();
  check('stop discards the manual calibration draft',get('fields-editor').hidden && get('fields-edit').disabled);
  bitmap.close();source.width=source.height=0;
  return {passed:true,ui:checks,limitations:'Local canvas stream, real panel pixels and calibration controls; synthetic War OCR verifies controller delivery only. Live sharing permissions and War recognition accuracy are untested.'};
})();
