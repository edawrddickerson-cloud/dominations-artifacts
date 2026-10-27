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
  const gold=await createImageBitmap(await(await fetch('../tests/scanner/pic1.png')).blob());
  const goldSource=document.createElement('canvas');goldSource.width=gold.width;goldSource.height=gold.height;goldSource.getContext('2d').drawImage(gold,0,0);
  check('existing gold-frame coordinates remain identical',JSON.stringify(DNScannerPanel.detect(goldSource))===JSON.stringify(DNScannerRecognition.detectPanel(goldSource)));
  gold.close();goldSource.width=goldSource.height=0;
  const blank=document.createElement('canvas');blank.width=824;blank.height=667;
  const b=blank.getContext('2d');b.fillStyle='#111';b.fillRect(0,0,824,667);
  check('blank capture has no candidate',DNScannerPanel.detect(blank)===null);
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
  const detector=DNScannerPanel.detect;let locate=false;
  DNScannerPanel.detect=input=>locate?detector(input):null;
  source.width=1718;source.height=1390;ctx.drawImage(bitmap,0,0,source.width,source.height);
  const stream=source.captureStream(10);
  const drawTimer=setInterval(()=>ctx.drawImage(bitmap,0,0,source.width,source.height),100);
  Object.defineProperty(window.parent.navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  get('setup').open=true;get('auto').checked=true;get('connect').click();
  await wait(()=>get('video').readyState>=2 && get('meta').textContent.includes('select the complete'));
  check('connected screenshot initially has an empty crop',get('fields-edit').disabled && reads===0);
  locate=true;get('find').click();
  check('Refresh Image Detection fills the artifact region preview at 1718x1390',get('crop').width>600 && get('crop').width<660 && get('crop').height>290 && get('crop').height<350 && get('meta').textContent.includes('Source 1718x1390') && get('meta').textContent.includes('crop'));
  check('Refresh Image Detection enables field calibration',!get('fields-edit').disabled);
  const crop=get('crop').getContext('2d').getImageData(0,0,get('crop').width,get('crop').height).data;
  check('preview contains game pixels',crop.some((value,index)=>index%4!==3 && value>120));
  await wait(()=>reads>0);
  check('the detected War panel starts automatic reading',reads>0);
  get('fields-edit').click();check('detected War panel opens the calibration editor',!get('fields-editor').hidden && get('read').disabled);
  get('stop').click();check('Stop clears War panel and frozen editor',get('fields-editor').hidden && get('fields-edit').disabled);
  clearInterval(drawTimer);DNScannerPanel.detect=detector;bitmap.close();source.width=source.height=0;
  // Leave the recovered real-pixel preview available for the screenshot review.
  get('auto').checked=false;
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'war-panel.png',{type:'image/png'}));
  get('file').files=transfer.files;get('file').dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>!get('fields-edit').disabled && !get('file').disabled);
  get('layout').focus();get('frame').scrollIntoView({block:'center'});
  return {passed:true,ui:checks,cases,limitations:'One supplied screenshot of the scaled capture preview plus derived size probes. OCR is simulated; live permissions and original-resolution War text accuracy are untested.'};
})();
