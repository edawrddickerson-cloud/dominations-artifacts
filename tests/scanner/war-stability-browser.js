/* Public War fixtures: moving particles must not look like a new stat panel;
 * changing one physical stat row must still be detected. No OCR is simulated. */
(async()=>{
  const checks={},check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const R=DNScannerRecognition,F=DNScannerFieldRecognition,G=DNScannerRegions;
  const labels=await(await fetch('../tests/scanner/war-crafting-colours.json')).json(),items=[];
  const difference=(a,b)=>a.length===b.length?a.filter((value,i)=>Math.abs(value-b[i])>1).length/a.length:1;
  for(const label of labels){
    const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/'+label.fixture+'.png')).blob());
    const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;source.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    const p=label.panel,crop=document.createElement('canvas');crop.width=p.width;crop.height=p.height;crop.getContext('2d').drawImage(source,p.x,p.y,p.width,p.height,0,0,crop.width,crop.height);
    const broad=G.defaults(crop.width/crop.height),tight=G.copy(broad);tight.rows.forEach(row=>{row.name.y+=row.name.height*.2;row.name.height*=.6;row.name.width=.6;});
    items.push({label,source,crop,broad,tight});
  }
  const runs=[];
  try{
    for(const item of items)for(const kind of ['broad','tight']){
      const {crop}=item,template=item[kind],before=JSON.stringify(template),signature=F.warSignature(crop,{template});
      check(item.label.fixture+' '+kind+' current War signature',signature?.[0]===64);
      const frame=document.createElement('canvas');frame.width=crop.width;frame.height=crop.height;const ctx=frame.getContext('2d');ctx.drawImage(crop,0,0);
      for(const index of [0,2,4]){ctx.fillStyle=index===2?'#ffffff':'#ffd23c';ctx.fillRect(crop.width*.68,crop.height*(.275+.657*(index+.5)/5)-3,7,7);}
      const particleDifference=difference(signature,F.warSignature(frame,{template}));
      check(item.label.fixture+' '+kind+' bounded particles keep the encounter',particleDifference<.02);
      const other=items.find(value=>value!==item),box=template.rows[0].name,from=other[kind].rows[0].name;
      ctx.drawImage(crop,0,0);ctx.drawImage(other.crop,from.x*other.crop.width,from.y*other.crop.height,from.width*other.crop.width,from.height*other.crop.height,box.x*crop.width,box.y*crop.height,box.width*crop.width,box.height*crop.height);
      const rowDifference=difference(signature,F.warSignature(frame,{template}));
      check(item.label.fixture+' '+kind+' one changed stat row starts a new encounter',rowDifference>.02);
      ctx.drawImage(crop,0,0);ctx.fillStyle='#b02020';ctx.fillRect(crop.width*.03,crop.height*.04,crop.width*.55,crop.height*.2);
      check(item.label.fixture+' '+kind+' Main ribbon does not enable War processing',R.hallColour(frame,{banner:true})==='main' && F.warSignature(frame,{template})===null);
      check(item.label.fixture+' '+kind+' saved coordinates unchanged',JSON.stringify(template)===before);
      runs.push({fixture:item.label.fixture,kind,particleDifference,rowDifference});frame.width=frame.height=0;
    }
    return {passed:true,ui:checks,metrics:{runs},limitations:'Controlled particles and a single-row substitution on two public original War fixtures. Actual recording motion is covered separately by the optional local video review.'};
  }finally{for(const item of items)item.source.width=item.source.height=item.crop.width=item.crop.height=0;}
})();
