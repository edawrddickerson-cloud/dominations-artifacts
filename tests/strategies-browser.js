/* Real page integration. Recognition is deterministic; no capture permission or game interaction. */
(async()=>{
  const checks={},get=id=>document.getElementById('scanner-'+id),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  async function wait(test,description='condition'){const end=performance.now()+16000;while(!test()){if(performance.now()>end)throw Error('Timed out: '+description+' · '+get('benchmarks')?.textContent+' · '+get('comparison')?.textContent+' · '+get('profile-label')?.textContent);await pause(30);}}
  await wait(()=>get('names')?.children.length && window.DNScannerReading && document.getElementById('strategy-select'),'scanner ready');
  get('auto').checked=false;window.DNScannerCollection.isEnabled=()=>false;
  document.getElementById('header-main').click();
  if(!get('off').checked)document.getElementById('header-off').click();
  if(get('def').checked)document.getElementById('header-def').click();
  const tank=DN.addStrategy('Browser tanks',{units:['Heavy Tank']}),fighter=DN.addStrategy('Browser fighters',{units:['Fighter']});
  DN.updateStrategy(tank,{inheritRatings:false,overrides:{'Heavy Tank Damage':{offensive:5}}});
  DN.updateStrategy(fighter,{inheritRatings:false,overrides:{'Fighter Damage':{offensive:5}}});
  DN.setActiveStrategy(tank);DN.setComparisonStrategyIds([tank,fighter]);
  const rows=(name,value)=>Array.from({length:5},(_,index)=>({name,value,level:1,levelSource:'manual',known:true,hasPercent:true,unlocked:index<2,rerollEligible:false,rerollSource:'manual'}));
  const items=[['tank-best','Heavy Tank Damage',11],['tank-second','Heavy Tank Damage',6],['fighter-best','Fighter Damage',11],['fighter-second','Fighter Damage',6]].map(([id,name,value])=>({id,name:id,hall:'main',type:'Weapon',reviewed:true,rows:rows(name,value)}));
  await DNStoredArtifacts.write(DNStoredArtifacts.collectionKey(),items);
  window.dispatchEvent(new Event('focus'));
  await wait(()=>get('benchmarks').querySelector('[data-category="weapon"] dd')?.textContent==='375','active strategy benchmark');
  const response={valid:true,hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon',name:'Browser craft'},rows:rows('Heavy Tank Damage',11),unlocked:{count:2,states:[true,true,false,false,false]},warnings:[]};
  DNScannerRecognition.create=()=>({recognize:async()=>structuredClone(response),close:async()=>{}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;canvas.getContext('2d').fillRect(0,0,640,320);
  DNScannerReading.update(canvas,{session:1,current:true});get('read').click();
  await wait(()=>!get('read').disabled && get('strategy-results').querySelectorAll('tbody tr').length===2,'strategy results');
  const strategyRows=()=>[...get('strategy-results').querySelectorAll('tbody tr')];
  check('one craft receives independent strategy scores',strategyRows()[0].cells[2].textContent==='500' && strategyRows()[1].cells[2].textContent==='0');
  check('each strategy has its own owned benchmark',strategyRows().every(row=>row.cells[4].textContent==='375'));
  check('summary identifies improvement for one strategy',get('comparison').textContent.includes('1 of 2'));
  const capture=get('capture-percent').textContent;
  const select=document.getElementById('strategy-select');select.value=fighter;select.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>get('item-total').textContent==='0','live strategy change');
  check('scanner strategy changes preserve capture',get('capture-percent').textContent===capture && strategyRows().length===2);
  check('scanner continues to compare the selected set',get('comparison').textContent.includes('1 of 2'));
  if(innerWidth<=600) {
    const row=strategyRows()[0],bounds=get('strategy-results').getBoundingClientRect();
    check('mobile strategy verdict is visible without scrolling',row.cells[5].getBoundingClientRect().right<=bounds.right && getComputedStyle(row.cells[3]).display==='none');
    const allColumns=get('strategy-results').querySelector('[data-strategy-columns]');allColumns.checked=true;allColumns.dispatchEvent(new Event('change',{bubbles:true}));
    check('mobile can expand full benchmark details',getComputedStyle(strategyRows()[0].cells[3]).display!=='none');
    const collapse=get('strategy-results').querySelector('[data-strategy-columns]');collapse.checked=false;collapse.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const frame=document.createElement('iframe');frame.style.cssText='width:1440px;height:1000px;position:absolute;left:0;top:1200px';document.body.append(frame);
  async function page(name,test){frame.src='/ui/'+name;await wait(()=>{try{return frame.contentWindow.location.pathname.endsWith(name) && frame.contentDocument.readyState==='complete' && test(frame.contentDocument,frame.contentWindow);}catch{return false;}},name);return {doc:frame.contentDocument,win:frame.contentWindow};}
  let loaded=await page('army.html',doc=>doc.querySelectorAll('[data-unit]').length>20 && doc.querySelector('#strategy-select'));
  check('Army opens the active strategy',loaded.doc.getElementById('preset-name').value==='Browser fighters');
  const sharedBefore=localStorage.getItem('dn-artifact-perk-ratings-global');
  const troop=loaded.doc.querySelector('[data-unit="Heavy Tank"]');troop.checked=true;troop.dispatchEvent(new loaded.win.Event('change',{bubbles:true}));
  loaded.doc.getElementById('army-save').click();
  check('Army save changes only this strategy',DN.loadStrategies().strategies.find(item=>item.id===fighter).units.includes('Heavy Tank') && !DN.loadStrategies().strategies.find(item=>item.id===tank).units.includes('Fighter'));
  check('Army save preserves shared ratings',localStorage.getItem('dn-artifact-perk-ratings-global')===sharedBefore);
  loaded=await page('ratings.html',doc=>doc.querySelectorAll('[data-layer="strategy"]').length>10);
  const input=loaded.doc.querySelector('[data-layer="strategy"][data-key="Heavy Tank Damage"][data-axis="offensive"]');
  input.value='0';input.dispatchEvent(new loaded.win.Event('change',{bubbles:true}));
  check('Ratings supports an explicit local zero',DN.loadStrategies().strategies.find(item=>item.id===fighter).overrides['Heavy Tank Damage'].offensive===0);
  check('Rating edit leaves another strategy intact',DN.loadStrategies().strategies.find(item=>item.id===tank).overrides['Heavy Tank Damage'].offensive===5);
  DN.saveCollectionUi({hall:'Main',viewMode:'list',compareRows:'all',valueMode:'actual'});
  loaded=await page('collection.html',doc=>doc.querySelectorAll('.collection-strategy-score').length>0);
  check('Collection includes both strategy columns',loaded.doc.querySelectorAll('.collection-strategy-heading').length===2);
  check('Collection shows strategy-specific ranks',loaded.doc.querySelector('.collection-strategy-score').textContent.includes('Rank'));
  check('Collection exposes coverage filters',[...loaded.doc.getElementById('collection-strategy-filter').options].some(option=>option.value==='every'));
  const layout=DN.loadLoadout(tank);layout.Main.mains=['tank-best'];DN.saveLoadout(layout,tank);
  const other=DN.loadLoadout(fighter);other.Main.mains=['fighter-best'];DN.saveLoadout(other,fighter);
  DN.setActiveStrategy(tank);
  loaded=await page('totals.html',doc=>doc.getElementById('totals-sub')?.textContent.includes('Browser tanks'));
  check('Totals uses the chosen saved lineup',loaded.doc.getElementById('totals-list').textContent.includes('Heavy Tank Damage') && !loaded.doc.getElementById('totals-list').textContent.includes('Fighter Damage'));
  loaded=await page('artifacts.html',doc=>doc.querySelectorAll('.priority-strategy-score').length>0);
  check('Priority displays both strategy scores',loaded.doc.querySelectorAll('.priority-strategy-heading').length===2);
  loaded=await page('storage-scanner.html',doc=>doc.getElementById('scanner-names')?.children.length>0 && doc.querySelector('#strategy-select'));
  check('Storage scanner uses the active strategy',loaded.doc.getElementById('strategy-select').value===tank && loaded.doc.getElementById('scanner-profile-label').textContent.includes('Browser tanks'));
  for(const name of ['council.html','council-collection.html','council-ratings.html']){
    loaded=await page(name,doc=>doc.querySelector('.site-nav-profile-select') && !doc.getElementById('error')?.textContent);
    check(name+' retains separate profile scope',!loaded.doc.getElementById('strategy-select'));
  }
  frame.remove();
  return {passed:true,checks,limitations:['Deterministic recognition and synthetic collection; no live OCR accuracy or game capture evaluated.']};
})()
