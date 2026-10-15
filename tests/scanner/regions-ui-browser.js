/* Authority: User-approved field calibration UI verification, October 2026.
 * Ownership: Local Chrome/CDP test, production DOM and worker assets.
 * Invariants: Real pointer input; field coordinates alone persist; no uploads.
 * Constraints: Canvas transforms probe geometry, not independent game captures. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),field=id=>get('fields-'+id),G=DNScannerRegions,checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw new Error(name);};
  const wait=async predicate=>{const until=performance.now()+20000;while(!predicate()){if(performance.now()>until)throw new Error('Timed out: '+field('status').textContent+' / '+get('result-status').textContent+' / '+get('warnings').textContent);await new Promise(resolve=>setTimeout(resolve,30));}};
  const fire=element=>element.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>get('names').children.length);
  get('auto').checked=false;get('collect').checked=false;fire(get('collect'));
  get('setup').open=true;
  check('calibration unavailable before capture',field('edit').disabled);
  const blob=await(await fetch('../tests/scanner/pic1.png')).blob();
  async function open(input=blob) {
    const transfer=new DataTransfer();transfer.items.add(new File([input],'local.png',{type:'image/png'}));get('file').files=transfer.files;fire(get('file'));
    await wait(()=>get('status').textContent==='Local screenshot' && get('file').disabled===false);
  }
  await open();await wait(()=>!field('edit').disabled);
  field('edit').click();
  check('editor opens and pauses reads',!field('editor').hidden && get('read').disabled);
  field('field').value='category';fire(field('field'));field('canvas').scrollIntoView({block:'center'});
  function pointer(x0,y0,x1,y1) {
    return new Promise(resolve=>{window.DNRegionPointerRequest={x0,y0,x1,y1};window.DNRegionPointerDone=()=>{window.DNRegionPointerRequest=null;resolve();};});
  }
  const canvasRect=field('canvas').getBoundingClientRect();
  const screen=(x,y)=>({x:canvasRect.left+x/1316*canvasRect.width,y:canvasRect.top+y/746*canvasRect.height});
  let a=screen(320,94),b=screen(470,143);await pointer(a.x,a.y,b.x,b.y);
  check('trusted pointer draws optional category box',field('optional').checked && !field('save').disabled);
  const beforeMove=Number(field('x').value);a=screen(395,118);
  await pointer(a.x,a.y,a.x+4,a.y+2);
  check('trusted pointer moves selected box',Number(field('x').value)>beforeMove);
  b={x:b.x+4,y:b.y+2};const beforeResize=Number(field('width').value);
  await pointer(b.x,b.y,b.x+4,b.y+3);
  check('trusted pointer resizes selected box',Number(field('width').value)>beforeResize);
  const manual=await(await fetch('../tests/scanner/pic1.regions.json')).json();
  const full=document.createElement('canvas'),bitmap=await createImageBitmap(blob);full.width=bitmap.width;full.height=bitmap.height;full.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const panel=DNScannerRecognition.detectPanel(full);
  function edit(id,rect) {
    field('field').value=id;fire(field('field'));
    if(['category','hall'].includes(id) && !field('optional').checked){field('optional').checked=true;fire(field('optional'));}
    const box=G.fromSource({x:rect.x/full.width,y:rect.y/full.height,width:rect.width/full.width,height:rect.height/full.height},panel);
    for(const key of ['x','y','width','height']){field(key).value=String(box[key]*100);field(key).dispatchEvent(new Event('input',{bubbles:true}));}
  }
  manual.rows.forEach((row,i)=>{edit(i+'-name',row.name);edit(i+'-percentage',row.percentage);});edit('category',manual.category);
  check('valid numeric editing permits save',!field('save').disabled && field('preview').width>0);
  field('save').click();check('save resumes capture and closes editor',field('editor').hidden && !get('read').disabled);
  const saved=G.load();check('one coordinate template persisted',G.valid(saved) && !JSON.stringify(saved).includes('data:image'));
  let observed=null;const record=DNScannerCollection.record;DNScannerCollection.record=result=>{observed=result;record(result);};
  get('read').click();await wait(()=>observed && !get('read').disabled);
  check('actual OCR uses calibrated fields',observed.recognitionPath==='calibrated-fields' && observed.valid);
  check('calibrated fields capture tier provenance',observed.rows.every(row=>row.tier==='white' && row.tierSource==='colour' && row.base===1));
  check('category and stars recognised',observed.artifact.type==='Pottery' && observed.unlocked.count===1);
  check('existing scorer rates calibrated input',get('result').querySelector('.scanner-score')?.textContent.includes('120') && !get('item-total').textContent.includes('—'));
  check('compact stats retained',get('result').querySelectorAll('.scanner-perk').length===5 && !get('result').textContent.includes('Recognition:'));
  get('layout').value='text';fire(get('layout'));DNScannerCalibration.report('standard');
  check('text-only mode retains standard path status',field('status').textContent.includes('Choose Gold-framed panel') && field('edit').disabled);
  get('layout').value='panel';fire(get('layout'));
  field('edit').click();field('field').value='0-name';fire(field('field'));field('x').value='-20';field('x').dispatchEvent(new Event('input'));
  check('invalid row boxes cannot save',field('save').disabled);
  field('cancel').click();check('cancel preserves saved template',JSON.stringify(G.load())===JSON.stringify(saved));
  async function variant(sx,sy,dx=0,dy=0) {
    const image=document.createElement('canvas');image.width=Math.ceil(full.width*sx+dx+10);image.height=Math.ceil(full.height*sy+dy+10);
    const ctx=image.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(full,dx,dy,full.width*sx,full.height*sy);
    const output=await new Promise(resolve=>image.toBlob(resolve,'image/png'));image.width=image.height=0;return output;
  }
  await open(await variant(.8,.8,30,20));await wait(()=>!get('read').disabled);
  check('saved template follows moved resized panel',field('status').textContent.startsWith('Calibrated fields'));
  observed=null;get('read').click();await wait(()=>observed && !get('read').disabled);
  check('moved resized field OCR remains correct',observed.valid && observed.rows.every((row,i)=>row.name===['Air Defense Damage','Sniper Tower Hitpoints','Catapult Hitpoints','Catapult Damage','Catapult Damage'][i] && row.value===1));
  await open(await variant(.7,1));await wait(()=>!field('edit').disabled);
  check('incompatible shape uses standard fallback',field('status').textContent.includes('Panel shape changed') && !get('read').disabled);
  const black=document.createElement('canvas');black.width=800;black.height=500;black.getContext('2d').fillRect(0,0,800,500);
  await open(await new Promise(resolve=>black.toBlob(resolve,'image/png')));
  check('missing anchor pauses reads',field('status').textContent.includes('Panel anchor missing') && get('read').disabled);
  field('reset').click();check('reset removes persisted template',G.load()===null && field('status').textContent.includes('no saved'));
  await open();await wait(()=>!field('edit').disabled);field('edit').click();get('stop').click();
  check('stop clears frozen editor and source',field('editor').hidden && field('edit').disabled && get('read').disabled);
  // Leave the actual editor visible for the viewport screenshot.
  await open();await wait(()=>!field('edit').disabled);field('edit').click();
  field('canvas').scrollIntoView({block:'center'});
  check('editor fits viewport horizontally',document.documentElement.scrollWidth<=innerWidth+1 && field('canvas').getBoundingClientRect().right<=innerWidth);
  const css=getComputedStyle(field('x').parentElement.parentElement);
  check('numeric inputs adapt to narrow widths',innerWidth>600 || css.gridTemplateColumns.split(' ').length===2);
  return {viewport:{width:innerWidth,height:innerHeight},checks,passed:Object.values(checks).every(Boolean),limitations:'Real CDP pointer draw/move/resize, numeric editing, local-file OCR, coordinate persistence, capture transforms, invalid anchors, reset, cancel and Stop. Live getDisplayMedia and background scheduling remain untested.'};
})()
