/* Authority: User-approved crafting field calibration, October 2026.
 * Ownership: Crafting setup UI and one localStorage template, never game control.
 * Invariants: Editor freezes in-memory pixels and pauses reads; saves coordinates
 * only; failures remain visible; capture/session cleanup releases the frozen frame.
 * Constraints: Supported gold-panel anchor required; calibration is browser-local. */
(() => {
  'use strict';
  const storage=!!window.DNStorageRegions,G=storage?window.DNStorageRegions:window.DNScannerRegions,C=window.DNScannerCore;
  const rowCount=()=>Number(document.getElementById('scanner-rows')?.value)===6?6:5;
  const supported=layout=>layout===(storage?'storage':'panel');
  const get=id=>document.getElementById('scanner-fields-'+id);
  if(!get('editor'))return;
  const ids=['enabled','edit','reset','status','editor','field','canvas','x','y','width','height','optional-label','optional','preview','preview-label','feedback','save','cancel'];
  const el=Object.fromEntries(ids.map(id=>[id,get(id)]));
  let template=storage?G.load(rowCount()):G.load(),draft=null,frozen=null,frozenPanel=null,source=null,panel=null,drag=null,active=null,lastPath=null,lastReason=null,currentLayout=storage?'storage':'panel',templateRows=rowCount();
  const notify=()=>{lastPath=lastReason=null;window.DNScannerReading?.invalidate('Field calibration changed. Reading the current panel again.');window.dispatchEvent(new Event('dn-scanner-fields-change'));};
  function discard() {
    if(frozen)frozen.width=frozen.height=0;
    frozen=null;frozenPanel=null;draft=null;drag=null;el.editor.hidden=true;
    el.canvas.width=640;el.canvas.height=360;el.preview.width=320;el.preview.height=64;
  }
  function update(nextSource,nextPanel,{layout=currentLayout}={}) {
    currentLayout=layout;
    if(storage && templateRows!==rowCount() && !draft){templateRows=rowCount();template=G.load(templateRows);lastPath=lastReason=null;}
    source=nextSource;panel=nextPanel;active=null;
    el.edit.disabled=!source || !panel || !supported(layout) || !!draft;
    el.reset.disabled=!template && !localStorageValue();
    let text='Standard recognition · no saved field boxes.';
    if(draft)text='Calibration paused · editing a frozen frame.';
    else if(!el.enabled.checked)text='Standard recognition · saved field boxes switched off.';
    else if(template) {
      const resolved=supported(layout)?G.resolve(template,panel,source):{valid:false,reason:storage?'Choose Full stored-item dialog to use saved boxes.':'Choose Gold-framed panel to use saved boxes.'};
      if(resolved.valid){active={template:G.copy(template),source,panel};text=lastReason?'Standard recognition · '+lastReason:lastPath==='calibrated-fields+standard-fallback'?'Calibrated fields · standard fallback used for unclear fields.':'Calibrated fields · saved boxes follow the detected panel.';}
      else text='Standard recognition · '+resolved.reason;
      if(!panel && source && supported(layout))text=storage?'Select the full stored-item dialog to calibrate fields.':'Panel anchor missing · reading paused. Find Panel or recalibrate.';
    }else if(localStorageValue())text='Standard recognition · saved boxes are invalid. Reset or recalibrate.';
    if(el.status.textContent!==text)el.status.textContent=text;
    return {fields:active,paused:!!draft || !!(template && el.enabled.checked && supported(layout) && source && !panel)};
  }
  function localStorageValue(){
    try {const raw=localStorage.getItem(G.KEY);return storage && raw && !JSON.parse(raw)?.[rowCount()]?null:raw;}catch{return null;}
  }
  function selected(){return draft && G.fields(draft).find(field=>field.id===el.field.value);}
  function refreshInputs() {
    const field=selected();if(!field)return;
    for(const key of ['x','y','width','height']){el[key].value=field.box?String(Math.round(field.box[key]*100000)/1000):'';el[key].disabled=!field.box;}
    el['optional-label'].hidden=!['category','hall','dice'].includes(field.kind);el.optional.checked=!!field.box;
    draw();
  }
  function draw() {
    if(!draft || !frozen)return;
    const scale=Math.min(1,1280/frozen.width);el.canvas.width=Math.round(frozen.width*scale);el.canvas.height=Math.round(frozen.height*scale);
    const ctx=el.canvas.getContext('2d');ctx.drawImage(frozen,0,0,el.canvas.width,el.canvas.height);
    const current=selected();
    const list=G.fields(draft).filter(field=>field.box).sort((a,b)=>(a.id===current?.id)-(b.id===current?.id));
    for(const field of list) {
      const box=G.toSource(field.box,frozenPanel);if(!box)continue;
      const x=box.x*el.canvas.width,y=box.y*el.canvas.height,w=box.width*el.canvas.width,h=box.height*el.canvas.height,chosen=field.id===current?.id;
      ctx.strokeStyle=chosen?'#ffdd6d':field.kind==='percentage'?'#72dcad':'#89bfff';ctx.lineWidth=chosen?3:1;
      ctx.strokeRect(x,y,w,h);
      const label=field.index===undefined?field.label:(field.index+1)+' '+(field.kind==='name'?'Name':field.kind==='percentage'?'%':field.kind==='dice'?'Dice':field.kind==='level'?'Level':'Star');
      ctx.font=(chosen?'bold ':'')+'12px sans-serif';ctx.fillStyle='#10151e';ctx.fillRect(x,Math.max(0,y-15),ctx.measureText(label).width+8,15);
      ctx.fillStyle=ctx.strokeStyle;ctx.fillText(label,x+4,Math.max(12,y-3));
      if(chosen)for(const [a,b] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){ctx.fillStyle='#ffdd6d';ctx.fillRect(a-4,b-4,8,8);}
    }
    const box=current?.box && G.toSource(current.box,frozenPanel),rect=box && C.cropPixels(box,frozen.width,frozen.height);
    const preview=el.preview.getContext('2d');
    el['preview-label'].textContent=(current?.label || 'Selected field')+' crop';
    if(rect){el.preview.width=rect.width;el.preview.height=rect.height;preview.drawImage(frozen,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);}
    else {el.preview.width=320;el.preview.height=64;preview.clearRect(0,0,320,64);}
    const resolved=G.resolve(draft,frozenPanel,frozen);
    el.save.disabled=!resolved.valid;
    el.feedback.textContent=resolved.valid?(Object.keys(resolved.unavailable || {}).length?'An optional dice box is outside this frame; its eligibility will stay unknown.':'Boxes fit this frame. Check the crop previews, then save.'):resolved.reason;
  }
  function begin() {
    if(!source || !panel || draft)return;
    frozen=document.createElement('canvas');frozen.width=source.width;frozen.height=source.height;frozen.getContext('2d').drawImage(source,0,0);
    frozenPanel={...panel};draft=template?G.copy(template):G.defaults(panel.width*source.width/(panel.height*source.height),storage?rowCount():false);
    draft.aspect=panel.width*source.width/(panel.height*source.height);
    el.field.replaceChildren(...G.fields(draft).map(field=>{const option=document.createElement('option');option.value=field.id;option.textContent=field.label;return option;}));
    el.field.value='0-name';el.editor.hidden=false;el.edit.disabled=true;
    notify();update(source,panel);refreshInputs();el.canvas.focus();
  }
  function point(event){const rect=el.canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  el.canvas.addEventListener('pointerdown',event=>{
    const field=selected();if(event.button!==0 || !field)return;
    const start=point(event),box=field.box && G.toSource(field.box,frozenPanel),rect=el.canvas.getBoundingClientRect();
    let corner=null;
    if(box)for(const [x,y] of [[0,0],[1,0],[0,1],[1,1]])if(Math.abs(start.x-(box.x+x*box.width))*rect.width<10 && Math.abs(start.y-(box.y+y*box.height))*rect.height<10)corner={x,y};
    const inside=box && start.x>=box.x && start.x<=box.x+box.width && start.y>=box.y && start.y<=box.y+box.height;
    drag={start,box,corner,mode:corner?'resize':inside?'move':'draw'};el.canvas.setPointerCapture(event.pointerId);event.preventDefault();
  });
  el.canvas.addEventListener('pointermove',event=>{
    if(!drag)return;
    const p=point(event),{box,start,corner}=drag;let next;
    if(drag.mode==='move')next={...box,x:Math.max(0,Math.min(1-box.width,box.x+p.x-start.x)),y:Math.max(0,Math.min(1-box.height,box.y+p.y-start.y))};
    else if(drag.mode==='resize')next=C.regionBetween({x:box.x+(1-corner.x)*box.width,y:box.y+(1-corner.y)*box.height},p);
    else next=C.regionBetween(start,p);
    if(next){G.assign(draft,el.field.value,G.fromSource(next,frozenPanel));refreshInputs();}
  });
  function finish(event){drag=null;if(el.canvas.hasPointerCapture(event.pointerId))el.canvas.releasePointerCapture(event.pointerId);}
  el.canvas.addEventListener('pointerup',finish);el.canvas.addEventListener('pointercancel',finish);
  el.canvas.addEventListener('keydown',event=>{if(event.key==='Escape'){discard();notify();update(source,panel);}});
  for(const key of ['x','y','width','height'])el[key].addEventListener('input',()=>{
    const field=selected();if(!field)return;
    G.assign(draft,field.id,Object.fromEntries(['x','y','width','height'].map(k=>[k,el[k].value.trim()===''?NaN:Number(el[k].value)/100])));draw();
  });
  el.optional.addEventListener('change',()=>{
    const field=selected();if(!field || !['category','hall','dice'].includes(field.kind))return;
    const seed=storage?G.fields(G.defaults(draft.aspect,draft.rows.length)).find(item=>item.id===field.id)?.box:field.kind==='category'?{x:-.3,y:-.31,width:.5,height:.2}:field.kind==='hall'?{x:.03,y:.04,width:.55,height:.2}:
      {x:.88,y:draft.rows[field.index].name.y,width:.10,height:draft.rows[field.index].name.height};
    G.assign(draft,field.id,el.optional.checked?seed:null);refreshInputs();
  });
  el.field.addEventListener('change',refreshInputs);el.edit.addEventListener('click',begin);
  el.cancel.addEventListener('click',()=>{discard();notify();update(source,panel);});
  el.save.addEventListener('click',()=>{
    if(!draft || !G.resolve(draft,frozenPanel,frozen).valid)return;
    if(!G.save(draft)){el.feedback.textContent='Could not save boxes in this browser. Allow local storage and try again.';return;}
    template=G.copy(draft);discard();notify();update(source,panel);
  });
  el.reset.addEventListener('click',()=>{
    if(!(storage?G.reset(rowCount()):G.reset())){el.status.textContent='Could not reset saved boxes. Check browser storage access.';return;}
    template=null;discard();notify();update(source,panel);
  });
  el.enabled.addEventListener('change',()=>{discard();notify();update(source,panel);});
  window.DNScannerCalibration={update,report(path,reason){lastPath=path;lastReason=reason;update(source,panel);},resetCapture(){discard();source=panel=active=null;lastPath=lastReason=null;update(null,null);},get hasTemplate(){return !!template && el.enabled.checked;},get editing(){return !!draft;}};
  update(null,null);
})();
