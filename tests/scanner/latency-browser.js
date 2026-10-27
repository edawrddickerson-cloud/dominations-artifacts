/* Measures detector and real controller/comparison work with deterministic OCR.
 * Timings exclude actual OCR accuracy; fixtures and storage are disposable. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async fn=>{const until=performance.now()+15000;while(!fn()){if(performance.now()>until)throw Error('Latency fixture timed out: '+get('result-status').textContent);await pause(10);}};
  const checks={},check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  await wait(()=>get('names').children.length && window.DNScannerPanel);
  const metrics={detector:{},comparison:{},controller:{}};
  const bitmap=await createImageBitmap(await(await fetch('../tests/scanner/war-pistol.png')).blob());
  const source=document.createElement('canvas');source.width=1718;source.height=1390;source.getContext('2d').drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
  const panel=DNScannerPanel.detect(source);check('War panel acquired',!!panel);
  const gold=DNScannerRecognition.detectPanel;let goldScans=0;
  DNScannerRecognition.detectPanel=(...args)=>{goldScans++;return gold(...args);};
  let start=performance.now();
  for(let i=0;i<30;i++)check('held frame keeps identical coordinates',JSON.stringify(DNScannerPanel.detect(source,{anchor:panel}))===JSON.stringify(panel));
  metrics.detector={samples:30,ms:performance.now()-start,goldScans};
  DNScannerRecognition.detectPanel=gold;source.width=source.height=0;
  if(window.DNVerifyLatency)check('tracked War frames avoid full gold searches',goldScans===0);

  const api=DNCraftingPurposes,core=DNScannerComparisonCore;
  const choices=['attack-heavy-tank','attack-fighter','counter-heavy-tank','counter-bomber','loot','production'];
  const ids=choices.map((id,index)=>{const choice=api.choices.find(item=>item.id===id);return api.saveCustom({label:'Latency '+index,category:choice.category,selections:[id],addOns:index<2?{defensive:{source:'profile'},economy:{source:'profile'}}:{}});});
  for(const id of ids)api.selectPurpose(id,true);
  const rows=['Heavy Tank Damage','Fighter Damage','Invading Heavy Tank Hitpoints','Invading Bomber Hitpoints','Ranged Infantry Damage'].map((name,index)=>({name,value:index%2?-6:1,known:true,hasPercent:true,level:1,levelSource:'crafting',unlocked:index<2,rerollEligible:true,rerollSource:'fresh-craft'}));
  rows.forEach(row=>{row.value=DN.expectedPerkSign(row.name)*Math.abs(row.value);});
  const items=Array.from({length:500},(_,index)=>({id:'latency-owned-'+index,name:'Owned '+index,hall:'war',type:index%3===0?'Armor':'Weapon',reviewed:true,rows:rows.map(row=>({...row,value:Math.sign(row.value)*(index%2?1:6)}))}));
  await DNStoredArtifacts.write(DNStoredArtifacts.collectionKey(),items);
  window.dispatchEvent(new Event('focus'));await pause(150);
  const canon=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const owned=items.map(DNStoredArtifacts.toRow),selected=[...api.settings().selected,...Object.keys(api.settings().rareCards)];
  const response={valid:true,hall:'war',hallSource:'hall-colour',artifact:{type:'Weapon',name:'Latency artifact'},rows,unlocked:{count:2,states:[true,true,false,false,false]},warnings:[]};
  const parameters={type:'Weapon',hall:'war',owned,canonPerk:canon,selected};
  const expected=api.evaluate(response,parameters);
  start=performance.now();
  for(let i=0;i<25;i++)api.evaluate(response,parameters);
  metrics.comparison={targets:selected.length,samples:25,ms:performance.now()-start,signature:expected.map(item=>[item.id,item.score,item.threshold,item.hit])};
  check('warm target evaluation is unchanged',JSON.stringify(api.evaluate(response,parameters).map(item=>[item.id,item.score,item.threshold,item.hit]))===JSON.stringify(metrics.comparison.signature));
  const factory=await(await fetch('data/perk_rating_defaults.json')).json(),ratingOf=DN.createStrategyRatingContext(factory,{canonPerk:canon}).ratingOf;
  const opts={canonPerk:canon,ratingOf,scoreMode:'combined',prefSortAxes:{offensive:true,defensive:true}};
  get('hall').value='war';get('hall').dispatchEvent(new Event('change'));
  DNScannerComparison.update({...response,artifact:{type:''}},true,opts);
  check('unread category never claims a vacant Collection Target',![...get('purpose-results').querySelectorAll('.scanner-focus-target')].some(node=>node.textContent==='Open slot'));
  const unavailable=api.evaluate(response,{...parameters,owned:[],available:false});
  check('unavailable collection cannot provide an open-slot benchmark',unavailable.every(item=>item.benchmarkAvailable===false && !item.hit));
  const vacant=api.evaluate(response,{...parameters,owned:[],available:true});
  check('a confirmed vacant collection retains its open slots',vacant.every(item=>item.benchmarkAvailable===true && item.threshold===null));

  get('auto').checked=false;
  let current=response;
  const create=DNScannerRecognition.create;
  DNScannerRecognition.create=()=>({warm:async()=>{},isWarm:()=>false,close:async()=>{},recognize:async()=>{await pause(200);return structuredClone(current);}});
  const compare=DNScannerComparison.update,compares=[];
  DNScannerComparison.update=function(...args){const begin=performance.now();try{return compare.apply(this,args);}finally{compares.push(performance.now()-begin);}};
  const canvas=document.createElement('canvas');canvas.width=634;canvas.height=330;
  const durations=[];let publicationErrors=0;
  for(let i=0;i<7;i++) {
    current={...response,artifact:{...response.artifact,name:'Latency artifact '+i}};
    canvas.getContext('2d').fillStyle=i%2?'#333':'#111';canvas.getContext('2d').fillRect(0,0,canvas.width,canvas.height);
    DNScannerReading.update(canvas,{session:500+i,current:true,itemPresent:true});
    start=performance.now();get('read').click();
    await wait(()=>get('artifact-name')?.textContent===current.artifact.name && !get('read').disabled);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    durations.push(performance.now()-start);
    if(ids.some(id=>{const node=get('purpose-results').querySelector('[data-purpose-result="'+id+'"]');return !node || node.querySelector('.scanner-focus-target').textContent==='—';}))publicationErrors++;
  }
  const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
  metrics.controller={samples:durations.length,ocrStubMs:200,p50:percentile(durations,.5),p95:percentile(durations,.95),comparisonP50:percentile(compares,.5),comparisonP95:percentile(compares,.95),publicationErrors};
  check('current stats and target thresholds publish together',publicationErrors===0);
  DNScannerComparison.update=compare;DNScannerRecognition.create=create;DNScannerReading.reset();canvas.width=canvas.height=0;
  return {passed:true,ui:checks,metrics,limitations:'30 held-frame samples, 500 synthetic owned items, enabled target/rare presets and seven real-controller publications with a fixed 200ms OCR stub. These are component timings, not live end-to-end OCR performance.'};
})();
