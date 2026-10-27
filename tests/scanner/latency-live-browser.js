/* Warm real OCR through Connect, canvas capture, controller and target renderer. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,timeout=15000)=>{const until=performance.now()+timeout;while(!fn()){if(performance.now()>until)throw Error('Live latency timed out: '+get('result-status').textContent);await pause(10);}};
  await wait(()=>get('names').children.length);
  const labels=await(await fetch('../tests/scanner/war-crafting-colours.json')).json();
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const fixtures=[];
  for(const label of labels)fixtures.push({...label,image:await createImageBitmap(await(await fetch('../tests/scanner/'+label.fixture+'.png')).blob())});
  const api=DNCraftingPurposes;
  const target=api.saveCustom({label:'Latency collection target',category:'defensive',selections:['general-defensive'],addOns:{attacking:{source:'profile'}}});
  const owned=Array.from({length:100},(_,i)=>{const label=fixtures[i%2];return {id:'live-owned-'+i,name:'Owned '+i,hall:'war',type:label.category,reviewed:true,rows:label.rows.map(row=>({...row,name:canonPerk(row.name),known:true,hasPercent:true,level:1,unlocked:false,rerollEligible:false,rerollSource:'manual'}))};});
  await DNStoredArtifacts.write(DNStoredArtifacts.collectionKey(),owned);
  window.dispatchEvent(new Event('focus'));await pause(150);
  const names=Array.from(get('names').children,option=>option.value),create=DNScannerRecognition.create,engine=create({names,canonPerk});
  await engine.warm({fast:true});await engine.warm({fast:false});
  DNScannerRecognition.create=()=>engine;
  const source=document.createElement('canvas');source.width=1718;source.height=1390;const ctx=source.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,source.width,source.height);
  let current=null,pending=null,lastResult=null;
  const draw=()=>{if(current)ctx.drawImage(current.image,0,0,source.width,source.height);else{ctx.fillStyle='#000';ctx.fillRect(0,0,source.width,source.height);}};
  const stream=source.captureStream(10),timer=setInterval(draw,100);
  Object.defineProperty(window.parent.navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>stream});
  const compare=DNScannerComparison.update;
  DNScannerComparison.update=function(...args){const answer=compare.apply(this,args),result=args[3]?.captureResult || args[0];
    if(pending && result?.rows?.length===5 && result.rows.every((row,i)=>row.name===canonPerk(pending.label.rows[i].name) && row.value===pending.label.rows[i].value)) {
      lastResult=result;
      const item=pending,node=get('purpose-results').querySelector('[data-purpose-result="'+target+'"] .scanner-focus-target');
      const targetReady=node && /^>/.test(node.textContent);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(pending!==item)return;
        item.statsMs ??= performance.now()-item.start;
        if(targetReady)item.targetMs ??=performance.now()-item.start;
      }));
    }
    return answer;
  };
  get('auto').checked=true;get('connect').click();await wait(()=>get('video').readyState>=2);
  const runs=[];
  try {
    for(let repeat=0;repeat<3;repeat++)for(const label of fixtures) {
      pending={label,start:performance.now(),statsMs:null,targetMs:null};current=label;draw();
      await wait(()=>pending.statsMs!==null && pending.targetMs!==null,12000);
      runs.push({fixture:label.fixture,repeat,statsMs:pending.statsMs,targetMs:pending.targetMs,valid:lastResult.valid,inferred:lastResult.rows.filter(row=>row.inferred).length,automatic:get('fields-status').textContent==='Automatic fields'});
      pending=null;await pause(100);
    }
    return {passed:true,metrics:{runs},limitations:'Six warm reads of two original War screenshots through a local 10Hz canvas stream at 1718x1390, real OCR and 100 synthetic owned items. Screen-sharing permission and live game motion are excluded.'};
  } finally {clearInterval(timer);get('stop').click();DNScannerComparison.update=compare;DNScannerRecognition.create=create;for(const label of fixtures)label.image.close();source.width=source.height=0;}
})();
