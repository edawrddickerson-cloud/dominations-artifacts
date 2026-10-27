/* User's October 27 screenshot: extracted Shared source preview, not an original
 * capture. Real silver-frame pixels and the real Refresh Image Detection action;
 * OCR is simulated to verify read scheduling, not low-resolution text accuracy. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const wait=async predicate=>{const until=performance.now()+15000;while(!predicate()){if(performance.now()>until)throw Error('War panel timed out: '+get('message').textContent+' / '+get('result-status').textContent);await new Promise(resolve=>setTimeout(resolve,30));}};
  await wait(()=>get('names').children.length);
  const blob=await(await fetch('../tests/scanner/crafting-war-silver.png')).blob(),bitmap=await createImageBitmap(blob);
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;
  const ctx=source.getContext('2d');ctx.drawImage(bitmap,0,0);
  check('gold-only detector reproduces the reported failure',DNScannerRecognition.detectPanel(source)===null);
  const panel=DNScannerPanel.detect(source);
  check('silver War frame is located in the user screenshot',panel && Math.abs(panel.x*source.width-267)<10 && Math.abs(panel.y*source.height-190)<10 && Math.abs(panel.width*source.width-304)<12 && Math.abs(panel.height*source.height-158)<12);
  const cases=[];
  for(const [width,height] of [[1718,1390],[1236,1001],[618,500]]){
    const scaled=document.createElement('canvas');scaled.width=width;scaled.height=height;
    scaled.getContext('2d').drawImage(source,0,0,width,height);
    const detected=DNScannerPanel.detect(scaled);
    check('silver frame scales to '+width+'x'+height,detected && ['x','y','width','height'].every(key=>Math.abs(detected[key]-panel[key])<.015));
    cases.push({width,height,detected});scaled.width=scaled.height=0;
  }
  for(const fixture of ['crafting-war-silver','war-pistol','war-body-shield']) {
    const image=await createImageBitmap(await(await fetch('../tests/scanner/'+fixture+'.png')).blob());
    let anchor=null;
    for(const width of [image.width,1280,1718])for(const exposure of [1,.9,.75]) {
      const frame=document.createElement('canvas');frame.width=width;frame.height=Math.round(image.height*width/image.width);
      const c=frame.getContext('2d');c.drawImage(image,0,0,frame.width,frame.height);
      if(exposure<1){c.fillStyle='rgba(0,0,0,'+(1-exposure)+')';c.fillRect(0,0,frame.width,frame.height);}
      const detected=DNScannerPanel.detect(frame);
      check(fixture+' '+width+' '+exposure+' acquires a dim metal frame',!!detected);
      if(exposure===1)anchor=detected;
      const held=DNScannerPanel.detect(frame,{anchor});
      check(fixture+' '+width+' '+exposure+' validates the same frame bounds',JSON.stringify(held)===JSON.stringify(anchor));
      const x=anchor.x*frame.width,y=anchor.y*frame.height,pw=anchor.width*frame.width,ph=anchor.height*frame.height;
      c.fillStyle='#0c6edc';
      for(const fraction of [.27,.58]) {
        c.fillRect(x+pw*fraction,y-ph*.04,pw*.035,ph*.10);
        c.fillRect(x+pw*(1-fraction),y+ph*.94,pw*.035,ph*.10);
      }
      const obscured=DNScannerPanel.detect(frame);
      check(fixture+' '+width+' '+exposure+' acquires across transient edge particles',obscured && ['x','y','width','height'].every(key=>Math.abs(obscured[key]-anchor[key])<.025));
      check(fixture+' '+width+' '+exposure+' tracks across transient edge particles',JSON.stringify(DNScannerPanel.detect(frame,{anchor}))===JSON.stringify(anchor));
      frame.width=frame.height=0;
    }
    image.close();
  }
  const gold=await createImageBitmap(await(await fetch('../tests/scanner/pic1.png')).blob());
  const goldSource=document.createElement('canvas');goldSource.width=gold.width;goldSource.height=gold.height;goldSource.getContext('2d').drawImage(gold,0,0);
  check('existing gold-frame coordinates remain identical',JSON.stringify(DNScannerPanel.detect(goldSource))===JSON.stringify(DNScannerRecognition.detectPanel(goldSource)));
  gold.close();goldSource.width=goldSource.height=0;
  const blank=document.createElement('canvas');blank.width=824;blank.height=667;
  const b=blank.getContext('2d');b.fillStyle='#111';b.fillRect(0,0,824,667);
  check('blank capture has no candidate',DNScannerPanel.detect(blank)===null);
  check('a previous anchor cannot validate an empty frame',DNScannerPanel.detect(blank,{anchor:panel})===null);
  b.strokeStyle='#999';b.lineWidth=5;b.strokeRect(267,190,304,158);
  check('neutral rectangles without a War ribbon are rejected',DNScannerPanel.detect(blank)===null);
  b.fillStyle='#126b9b';b.fillRect(278,202,130,24);b.fillStyle='#111';b.fillRect(260,225,16,120);b.fillRect(561,225,16,120);
  check('paired bars and a blue ribbon require vertical frame sides',DNScannerPanel.detect(blank)===null);
  blank.width=blank.height=0;
  let reads=0;
  DNScannerCollection.isEnabled=()=>false;
  DNScannerRecognition.create=()=>({warm:async()=>{},isWarm:()=>false,close:async()=>{},recognize:async()=>{
    reads++;
    return {valid:false,rows:[],artifact:{type:''},hall:'war',hallSource:'hall-colour',unlocked:{count:null,states:[]},warnings:[]};
  }});
  // Hold automatic locating so the button must create the first crop.
  const detector=DNScannerPanel.detect;let locate=false,locateWidth=null;
  DNScannerPanel.detect=(input,options)=>{
    if(locate && !options?.anchor)locateWidth=input.width;
    return locate?detector(input,options):null;
  };
  source.width=1718;source.height=1390;ctx.drawImage(bitmap,0,0,source.width,source.height);
  const stream=source.captureStream(10);
  let exposure=1,empty=false,captureImage=bitmap;
  const captureItems=[{fixture:'trench knife',image:bitmap,panelWidth:304}];
  for(const [fixture,panelWidth] of [['war-pistol',632],['war-body-shield',632]]) {
    const image=await createImageBitmap(await(await fetch('../tests/scanner/'+fixture+'.png')).blob());
    captureItems.push({fixture,image,panelWidth});
  }
  const drawTimer=setInterval(()=>{
    ctx.drawImage(captureImage,0,0,source.width,source.height);
    if(empty || exposure<1){ctx.fillStyle='rgba(0,0,0,'+(empty?1:1-exposure)+')';ctx.fillRect(0,0,source.width,source.height);}
  },100);
  Object.defineProperty(window.parent.navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  get('setup').open=true;get('auto').checked=true;get('connect').click();
  await wait(()=>get('video').readyState>=2 && get('meta').textContent.includes('select the complete'));
  check('connected screenshot initially has an empty crop',get('fields-edit').disabled && reads===0);
  locate=true;get('find').click();
  check('Refresh Image Detection uses native capture pixels',locateWidth===1718);
  check('Refresh Image Detection fills the artifact region preview at 1718x1390',get('crop').width>600 && get('crop').width<660 && get('crop').height>290 && get('crop').height<350 && get('meta').textContent.includes('Source 1718x1390') && get('meta').textContent.includes('crop'));
  check('Refresh Image Detection enables field calibration',!get('fields-edit').disabled);
  const crop=get('crop').getContext('2d').getImageData(0,0,get('crop').width,get('crop').height).data;
  check('preview contains game pixels',crop.some((value,index)=>index%4!==3 && value>120));
  await wait(()=>reads>0);
  check('the detected War panel starts automatic reading',reads>0);
  async function nextItems(label) {
    for(const item of [captureItems[1],captureItems[2],captureItems[0]]) {
      const before=reads;captureImage=item.image;
      const expectedWidth=item.panelWidth/item.image.width*source.width;
      await wait(()=>reads>before && Math.abs(get('crop').width-expectedWidth)<expectedWidth*.03);
      check(label+' '+item.fixture+' relocates the crop and reads',!get('fields-edit').disabled);
    }
  }
  await nextItems('without saved fields');
  get('fields-edit').click();check('detected War panel opens the calibration editor',!get('fields-editor').hidden && get('read').disabled);
  get('fields-save').click();
  check('War field calibration can be saved',DNScannerCalibration.hasTemplate);
  const geometry=[get('crop').width,get('crop').height];
  let calibrationLosses=0;
  const monitor=setInterval(()=>{if(get('fields-edit').disabled)calibrationLosses++;},20);
  for(const dim of [.9,.75,1]) {
    const before=reads;exposure=dim;
    await wait(()=>reads>before);
    check('brightness '+dim+' keeps calibration enabled',!get('fields-edit').disabled);
    check('brightness '+dim+' retains the crop bounds',[get('crop').width,get('crop').height].every((value,i)=>value===geometry[i]));
  }
  clearInterval(monitor);
  check('calibration stays continuously enabled during the brightness sequence',calibrationLosses===0);
  await nextItems('with saved fields');
  empty=true;await wait(()=>get('fields-edit').disabled);
  check('an empty source still pauses calibration and saved-field reading',get('fields-edit').disabled && get('read').disabled);
  empty=false;await wait(()=>!get('fields-edit').disabled);
  check('returning War panel restores calibration',!get('fields-edit').disabled);
  get('fields-edit').click();
  get('stop').click();check('Stop clears War panel and frozen editor',get('fields-editor').hidden && get('fields-edit').disabled);
  clearInterval(drawTimer);DNScannerPanel.detect=detector;for(const item of captureItems)item.image.close();source.width=source.height=0;
  // Leave the recovered real-pixel preview available for the screenshot review.
  get('auto').checked=false;
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'war-panel.png',{type:'image/png'}));
  get('file').files=transfer.files;get('file').dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>!get('fields-edit').disabled && !get('file').disabled);
  get('layout').focus();get('frame').scrollIntoView({block:'center'});
  return {passed:true,ui:checks,cases,limitations:'Three supplied images, including a scaled capture preview, plus derived size/brightness/particle probes and repeated artifact transitions. OCR is simulated; live permissions and original-resolution War text accuracy are untested.'};
})();
