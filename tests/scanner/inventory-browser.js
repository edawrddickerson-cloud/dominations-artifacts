/* Exercise real DOM, IndexedDB, transfer and Collection rendering without OCR. */
(async()=>{
  const checks={};
  function check(name,condition){checks[name]=!!condition;if(!condition)throw new Error(name);}
  async function wait(fn){const until=performance.now()+15000;while(!await fn()){if(performance.now()>until)throw new Error('Timed out');await new Promise(resolve=>setTimeout(resolve,25));}}
  const get=id=>document.getElementById('storage-'+id),store=window.DNStoredArtifacts;
  await wait(()=>!get('saved').textContent.startsWith('Loading'));
  const legacyKey='collection:backfill-fixture';
  await store.write(legacyKey,[{id:'missing-level',hall:'main',type:'Weapon',rows:[{value:13,unlocked:true,level:1,base:13,max:22},{value:-5,unlocked:true,level:null}]}]);
  const migrationPage=document.createElement('iframe');migrationPage.src='storage-scanner.html';document.body.appendChild(migrationPage);
  await wait(()=>migrationPage.contentWindow?.DNStoredArtifacts);
  const migrated=await migrationPage.contentWindow.DNStoredArtifacts.read(legacyKey);
  check('ambiguous prior levels need confirmation',migrated[0].rows[0].level===null && migrated[0].rows[0].rangeCandidates.length===2);
  const persisted=await store.read(legacyKey);
  check('tier corrections persist across profile records',persisted[0].rows[0].base===null && persisted[0].rows[1].base===-1 && persisted[0].rows[1].max===-10 && persisted[0].rows[1].level===5);
  migrationPage.remove();
  const rows=[{name:'Enemy Defender Spawn Time',value:13,level:3,unlocked:true,base:11,max:20},
    {name:'Invading Generals\' Damage',value:-6,level:1,unlocked:false,base:-6,max:-15},
    {name:'Heavy Infantry Hitpoints',value:1,level:null,unlocked:true,base:null,max:null},
    {name:'Heavy Infantry Hitpoints',value:6,level:1,unlocked:true,base:6,max:15},
    {name:'Tactical Helicopter Hitpoints',value:1,level:1,unlocked:true,base:1,max:10}]
    .map(row=>({...row,known:true,hasPercent:true,rerollEligible:false,levelSource:row.level==null?null:'ocr'}));
  const canvas=document.createElement('canvas');canvas.width=canvas.height=10;
  const image=canvas.toDataURL('image/jpeg');
  const result={valid:true,warnings:[],rows,artifact:{name:'Transfer fixture',type:'Weapon',hall:'main',image}};
  window.DNStorageScanner.update(result,true,{reviewable:true,expectedRows:5});
  check('new complete scan schedules automatic saving',get('ownership-title').textContent==='No saved match found');
  await wait(async()=>(await store.read('items')).length===1);
  check('duplicate skipped while scanning',get('items').children.length===1 && get('keep').hidden && get('ownership-title').textContent==='Added');
  check('added scan is awaiting import',get('ownership-title').textContent==='Added' && get('ownership-detail').textContent.includes('awaiting import to Collection'));
  const saved=await store.read('items');
  check('saved detail',saved.length===1 && saved[0].rows[0].base===11 && saved[0].rows[1].max===-15 && saved[0].image===image);
  check('saved tiers include inference source',saved[0].rows.every((row,i)=>row.tier===['blue','green','white','green','white'][i] && row.tierSource===(i===2?'unique-percentage':'percentage-level')));
  get('add-collection').click();
  await wait(()=>get('collection-status').textContent.includes('1 added'));
  check('identical copies import once',(await store.read(store.collectionKey())).length===1);
  check('import clears scanned inventory',get('items').children.length===0 && (await store.read('items')).length===0);
  check('collection duplicate requires no keeping',get('keep').hidden && get('ownership-title').textContent==='Already in your collection');
  check('imported scan is clearly already owned',get('ownership-title').textContent==='Already in your collection' && get('ownership').dataset.state==='collection');
  window.DNStorageScanner.update({...result,rows:rows.map((row,index)=>index===0?{...row,known:false}:row)},false,{reviewable:true,expectedRows:5});
  check('unclear scan cannot claim a saved match',get('ownership-title').textContent==='More scan details needed');
  window.DNStorageScanner.update({...result,metadataConflict:true},false,{reviewable:true,expectedRows:5});
  check('conflicting metadata cannot claim a saved match',get('ownership-title').textContent==='More scan details needed');
  window.DNStorageScanner.update(result,true,{reviewable:false,expectedRows:5});
  check('stale scan cannot retain an owned result',get('ownership-title').textContent==='Ownership check pending');
  window.DNStorageScanner.update(result,true,{reviewable:true,pending:true,expectedRows:5});
  check('pending edits cannot retain an owned result',get('ownership-title').textContent==='Ownership check pending');
  window.DNStorageScanner.update(result,true,{reviewable:true,expectedRows:5});
  const duplicateImport=await store.accept([{...saved[0],id:'duplicate-import'}]);
  check('import rejects exact duplicates',duplicateImport.duplicates===1 && duplicateImport.added===0);
  check('rescanned duplicate clears without importing',(await store.read(store.collectionKey())).length===1 && get('items').children.length===0);
  await store.accept([{...saved[0],id:'scan-second',name:'Transfer second fixture'}]);
  const legacy=store.identify([{capturedAt:'2026-10-12',reviewed:true}, {capturedAt:'2026-10-12',reviewed:true}]);
  check('legacy identities stable and distinct',legacy[0].id!==legacy[1].id && legacy[0].id===store.identify([{capturedAt:'2026-10-12'}])[0].id);
  check('accepted collection survives inventory cleanup',(await store.read(store.collectionKey())).length===2);
  const inferredRows=rows.map((row,index)=>index===0?{...row,value:null,tier:'blue',tierSource:'manual'}:
    index===1?{...row,level:null,tier:'green',tierSource:'manual'}:row);
  window.DNStorageScanner.update({...result,artifact:{...result.artifact,name:'Inference fixture'},valid:false,rows:inferredRows},false,{reviewable:true,expectedRows:5});
  await wait(async()=>(await store.read('items')).some(item=>item.name==='Inference fixture'));
  check('known tier fills missing value and level automatically',get('keep').hidden);
  const inferredSaved=(await store.read('items'))[0];
  check('inferred values and provenance survive inventory saving',inferredSaved.rows[0].value===13 && inferredSaved.rows[0].valueSource==='tier-level' && inferredSaved.rows[0].inferredFields.includes('value') && inferredSaved.rows[1].level===1 && inferredSaved.rows[1].levelSource==='locked-star' && inferredSaved.rows[1].inferredFields.includes('level'));
  get('add-collection').click();await wait(()=>get('items').children.length===0);
  await store.remove(inferredSaved.id);
  const replacementName='Replacement fixture';
  const scanLevels=level=>window.DNStorageScanner.update({...result,artifact:{...result.artifact,name:replacementName},rows:rows.map((row,index)=>index===0?{...row,value:11+level-1,level}:row)},true,{reviewable:true,expectedRows:5});
  scanLevels(3);await wait(async()=>(await store.read('items')).some(item=>item.name===replacementName));
  const stagedId=(await store.read('items'))[0].id;
  scanLevels(4);await wait(async()=>(await store.read('items')).some(item=>item.name===replacementName && item.rows[0].level===4));
  let staged=await store.read('items');
  check('new levels replace staged inventory in place',staged.length===1 && staged[0].id===stagedId && staged[0].rows[0].level===4);
  get('add-collection').click();await wait(()=>get('items').children.length===0);
  const previousLoadout=window.DN.loadLoadout(),assigned=window.DN.loadLoadout();
  assigned.Main.mains.push(stagedId);assigned.Main.scannedPlaced.push(stagedId);window.DN.saveLoadout(assigned);
  scanLevels(5);
  check('changed levels show an automatic collection update',get('ownership-title').textContent==='Collection match · improved stats');
  await wait(async()=>(await store.read(store.collectionKey())).find(item=>item.id===stagedId)?.rows[0].level===5);
  let replacement=(await store.read(store.collectionKey())).find(item=>item.id===stagedId);
  check('updated scan inherits assigned exhibit',replacement?.rows[0].level===5 && JSON.stringify(window.DN.loadLoadout())===JSON.stringify(assigned));
  scanLevels(2);await new Promise(resolve=>setTimeout(resolve,750));
  replacement=(await store.read(store.collectionKey())).find(item=>item.id===stagedId);
  check('lower scan leaves improved owned stats unchanged',replacement?.rows[0].level===5 && window.DN.loadLoadout().Main.mains.includes(stagedId));
  check('weaker replacement requires no keep action',get('keep').hidden && get('ownership-title').textContent==='Already in your collection' && !get('keep-status').textContent);
  await store.remove(stagedId);window.DN.saveLoadout(previousLoadout);
  if(window.DNInventoryTierOnly) {
    const accepted=await store.read(store.collectionKey());
    check('accepted tiers retain their source',accepted.every(item=>item.rows.every((row,i)=>row.tier===saved[0].rows[i].tier && row.tierSource===saved[0].rows[i].tierSource)));
    const contextItems=[
      {...saved[0],id:'unclear-tier',name:'Unclear tier',rows:saved[0].rows.map(row=>({...row,unlocked:true,value:13,level:null,levelSource:null,base:null,max:null,tier:null,tierSource:null,tierEvidence:null}))},
      {...saved[0],id:'war-tier',name:'War tier',hall:'war',type:'War Weapon',rows:saved[0].rows.map(row=>({...row,unlocked:true,value:8,level:3,levelSource:'ocr',base:null,max:null}))},
      {...saved[0],id:'special-tier',name:'Special tier',type:'Legendary'}
    ];
    const transfer=await store.accept(contextItems);
    check('tiered and unknown items import without data loss',transfer.added===3);
    const collection=await store.read(store.collectionKey());
    check('ambiguous storage tier remains unknown after import',collection.find(item=>item.id==='unclear-tier').rows.every(row=>row.tier===null && row.tierSource===null));
    check('War percentage and level infer Blue',collection.find(item=>item.id==='war-tier').rows.every(row=>row.tier==='blue' && row.tierSource==='percentage-level' && row.base===6));
    check('special items have no ordinary tier',collection.find(item=>item.id==='special-tier').rows.every(row=>row.tier===null && row.tierSource===null));
    const edited=await store.update('war-tier',{rows:collection.find(item=>item.id==='war-tier').rows.map(row=>({...row,level:6,base:3,max:12,rangeSource:'manual',tier:null,tierSource:null,tierConflict:false}))});
    check('manual tier correction is saved',edited.rows.every(row=>row.tier==='green' && row.tierSource==='manual'));
    const restored=document.createElement('iframe');restored.src='storage-scanner.html';document.body.append(restored);
    await wait(()=>restored.contentWindow?.DNStoredArtifacts && !restored.contentDocument.getElementById('storage-saved').textContent.startsWith('Loading'));
    const reloaded=await restored.contentWindow.DNStoredArtifacts.read(store.collectionKey());
    check('tier metadata survives a new page connection',reloaded.find(item=>item.id==='war-tier').rows.every(row=>row.tier==='green' && row.tierSource==='manual') && reloaded.find(item=>item.id==='unclear-tier').rows.every(row=>row.tier===null));
    restored.remove();
    return {passed:Object.values(checks).every(Boolean),ui:checks};
  }
  window.DN.saveCollectionUi({hall:'Main',viewMode:'list',valueMode:'actual'});
  window.DN.lsSet('dn-artifact-hall-filter','Main');
  const frame=document.createElement('iframe');frame.width='1400';
  frame.srcdoc=(await(await fetch('collection.html')).text()).replace(/<!-- Cloudflare Web Analytics -->.*<!-- End Cloudflare Web Analytics -->/g,'');
  document.body.append(frame);
  try {await wait(()=>frame.contentDocument?.querySelectorAll('.artifact-card').length===2);}
  catch(error){throw new Error(error.message+': '+frame.contentDocument?.body.innerText);}
  const doc=frame.contentDocument;
  check('artwork and duplicate perks preserved',doc.querySelectorAll('.artifact-card img').length===2 && doc.querySelectorAll('.card-perks li').length===10);
  check('stars replace perk metadata',doc.querySelectorAll('#collection-list .collection-perk-star.is-unlocked').length===6 && !doc.getElementById('collection-list').textContent.includes('Captured level'));
  const totalsFrame=document.createElement('iframe');totalsFrame.hidden=true;
  totalsFrame.srcdoc=(await(await fetch('totals.html')).text()).replace(/<!-- Cloudflare Web Analytics -->.*<!-- End Cloudflare Web Analytics -->/g,'');
  document.body.append(totalsFrame);
  await wait(()=>totalsFrame.contentDocument?.querySelector('.active-total'));
  const totalsText=()=>totalsFrame.contentDocument.getElementById('totals-list').textContent;
  check('dedicated totals include captured unlocked stats',totalsText().includes('+26%') && !totalsText().includes('Invading Generals'));
  check('filters show scanner button without blurb or value toggles',!!doc.querySelector('.collection-controls a.collection-scanner-link[href^="storage-scanner.html"]') && !doc.getElementById('mode-max') && !doc.querySelector('.collection-hint'));
  check('perk metadata hidden',!doc.getElementById('collection-list').textContent.includes('Max ') && !doc.getElementById('collection-list').textContent.includes('Unlocked'));
  check('every stat has a value editor',doc.querySelectorAll('#collection-list .collection-perk-value').length===10);
  check('every stat has minus and plus buttons',doc.querySelectorAll('#collection-list [data-action="lvl"]').length===20);
  const editedId=doc.querySelector('#collection-list .artifact-card').dataset.artifactId;
  const unknownValue=doc.querySelector('#collection-list .collection-perk-value[data-id="'+editedId+'"][data-perk="3"]');
  unknownValue.value='2';unknownValue.dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
  check('unknown-range stat edits persist',frame.contentWindow.DN.loadLevels()[editedId]['3']===2 && doc.querySelector('#collection-list .collection-perk-value[data-id="'+editedId+'"][data-perk="3"]').value==='2');
  check('editing keeps compact stats',!doc.getElementById('collection-list').textContent.includes('Max '));
  doc.querySelector('#collection-list [data-action="lvl"][data-id="'+editedId+'"][data-perk="3"][data-dir="1"]').click();
  check('unknown-range plus button changes value',frame.contentWindow.DN.loadLevels()[editedId]['3']===3);
  doc.querySelector('#collection-list [data-action="lvl"][data-id="'+editedId+'"][data-perk="3"][data-dir="-1"]').click();
  check('unknown-range minus button changes value',frame.contentWindow.DN.loadLevels()[editedId]['3']===2);
  const rangedValue=doc.querySelector('#collection-list .collection-perk-value[data-id="'+editedId+'"][data-perk="1"]');
  rangedValue.value='99';rangedValue.dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
  check('known ranges reject out-of-range edits',!rangedValue.validity.valid && !frame.contentWindow.DN.loadLevels()[editedId]['1']);
  rangedValue.value='14';rangedValue.dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
  totalsFrame.contentWindow.dispatchEvent(new totalsFrame.contentWindow.Event('storage'));
  await wait(()=>totalsText().includes('+27%'));
  check('valid edit refreshes dedicated totals',totalsText().includes('+27%'));
  totalsFrame.remove();
  check('named exhibit assigned',frame.contentWindow.DN.loadLoadout().Main.mains.length===2 && Object.keys(frame.contentWindow.DN.loadLoadout().Main.singles).length===0);
  doc.getElementById('view-structured').click();
  check('weapon exhibit slots filled',Array.from(doc.querySelectorAll('.museum-tile.is-filled')).filter(tile=>tile.textContent.includes('Weapon Exhibit')).length===2);
  check('showcase empty',doc.getElementById('museum-board').textContent.includes('No Showcase artifacts'));
  const categories=[['Weapon','main'],['Armor','main'],['Jewelry','main'],['Pottery','main'],['Legendary','main'],['Mythical','main'],
    ['War Weapon','war'],['War Armor','war'],['War Equipment','war'],['War Legendary','war'],['War Mythical','war']];
  await store.accept(categories.map(([type,hall],index)=>{
    // Ordinary War artifacts use 1/3/6 starting magnitudes. Copying the Main
    // 1/6/11 rows would now correctly trigger the tier conflict gate.
    const ordinaryWar=hall==='war' && ['War Weapon','War Armor','War Equipment'].includes(type);
    const rows=ordinaryWar?saved[0].rows.map(row=>{
      const base={1:1,6:3,11:6}[Math.abs(row.base)],sign=Math.sign(row.value),level=row.level;
      return {...row,value:sign*(base+level-1),base:sign*base,max:sign*(base+9),tier:null,tierSource:null,tierConflict:false};
    }):index===5?[...saved[0].rows,saved[0].rows[4]]:saved[0].rows;
    return {...saved[0],id:'scan-category-'+index,type,hall,name:index===5?'Mythical artifact with a long name':type+' fixture',rows};
  }));
  const reloaded=document.createElement('iframe');reloaded.style.cssText='width:1400px;height:900px;max-width:none;min-width:1400px;flex-shrink:0';reloaded.srcdoc=frame.srcdoc;document.body.append(reloaded);
  await wait(()=>reloaded.contentWindow?.DN?.loadLoadout().Main.scannedPlaced.includes('scan-category-5'));
  const placed=reloaded.contentWindow.DN.loadLoadout();
  check('all main categories automatically placed',placed.Main.mains.length===7);
  check('all war categories automatically placed',placed.War.mains.length===5);
  check('full exhibit leaves copy unused',!placed.Main.mains.includes('scan-category-0') && !Object.keys(placed.Main.singles).length && reloaded.contentDocument.getElementById('museum-board').textContent.includes('Unused'));
  const unusedTile=reloaded.contentDocument.querySelector('.museum-unused .museum-tile');
  check('unused uses compact tiles',!!unusedTile && !reloaded.contentDocument.querySelector('.museum-unused .artifact-card'));
  const weaponTile=Array.from(reloaded.contentDocument.querySelectorAll('.museum-tile.is-filled')).find(tile=>tile.textContent.includes('Weapon Exhibit'));
  const unusedRect=unusedTile.getBoundingClientRect(),weaponRect=weaponTile.getBoundingClientRect();
  check('unused matches exhibit tile dimensions',Math.abs(unusedRect.width-weaponRect.width)<1 && Math.abs(unusedRect.height-weaponRect.height)<1);
  unusedTile.click();
  check('unused opens editable stats',reloaded.contentDocument.querySelectorAll('#museum-detail .collection-perk-value').length===5 && reloaded.contentDocument.getElementById('slot-picker').hidden);
  for(const tile of reloaded.contentDocument.querySelectorAll('.museum-tile.is-filled[data-action="tile-inspect"]')) {
    reloaded.contentDocument.querySelector('.museum-tile[data-id="'+tile.dataset.id+'"]').click();
    const count=tile.dataset.id==='scan-category-5'?6:5;
    check('all exhibit and hall stats editable: '+tile.dataset.id,reloaded.contentDocument.querySelectorAll('#museum-detail .collection-perk-value').length===count && reloaded.contentDocument.querySelectorAll('#museum-detail [data-action="lvl"]').length===count*2);
    const detail=reloaded.contentDocument.getElementById('museum-detail');
    check('highlighted details fit without scrolling: '+tile.dataset.id,detail.scrollHeight<=detail.clientHeight+1 && detail.querySelector('.artifact-card').getBoundingClientRect().bottom<=detail.getBoundingClientRect().bottom+1);
  }
  weaponTile.click();
  check('click inspects without removal',reloaded.contentWindow.DN.loadLoadout().Main.mains.length===7 && reloaded.contentDocument.querySelector('#museum-detail .card-perks'));
  reloaded.contentDocument.getElementById('museum-board').click();
  check('blank space clears highlighted artifact',!reloaded.contentDocument.querySelector('#museum-detail .artifact-card') && reloaded.contentDocument.getElementById('slot-picker').hidden && reloaded.contentWindow.DN.loadLoadout().Main.mains.length===7);
  Array.from(reloaded.contentDocument.querySelectorAll('.museum-tile.is-filled')).find(tile=>tile.textContent.includes('Weapon Exhibit')).click();
  const option=reloaded.contentDocument.querySelector('[data-action="picker-pick"][data-id="scan-category-0"]');
  check('common exhibit picker offers matching category',!!option);
  option.click();
  check('crafted swap assigns unused copy',reloaded.contentWindow.DN.loadLoadout().Main.mains.includes('scan-category-0') && !Object.keys(reloaded.contentWindow.DN.loadLoadout().Main.singles).length);
  check('crafted items have no showcase controls',!reloaded.contentDocument.querySelector('.artifact-card[data-artifact-id="scan-category-0"] [data-mode="showcase"]'));
  const sections=Array.from(reloaded.contentDocument.querySelectorAll('#museum-board > .museum-section')).map(section=>section.querySelector('h3')?.textContent);
  check('hermitage follows legendary row',sections.indexOf('Hermitage')===sections.indexOf('Legendary Hall')+1);
  const boardTiles=Array.from(reloaded.contentDocument.querySelectorAll('#museum-board .museum-tile')).map(tile=>tile.getBoundingClientRect());
  check('all item tiles have the same dimensions',boardTiles.every(rect=>Math.abs(rect.width-boardTiles[0].width)<1 && Math.abs(rect.height-boardTiles[0].height)<1));
  const boardOrigin=reloaded.contentDocument.getElementById('museum-board').getBoundingClientRect().left,step=boardTiles[0].width+9;
  check('all tile columns align',boardTiles.every(rect=>Math.abs((rect.left-boardOrigin)/step-Math.round((rect.left-boardOrigin)/step))<.02));
  const groupRects=Array.from(reloaded.contentDocument.querySelectorAll('#museum-board .museum-section')).map(group=>group.getBoundingClientRect());
  let inlineBreaks=0;
  check('groups sharing a row have one empty tile column',groupRects.every((rect,index)=>{
    const previous=groupRects[index-1];if(!previous || Math.abs(rect.top-previous.top)>1)return true;
    inlineBreaks++;return Math.abs(rect.left-previous.right-(boardTiles[0].width+18))<1;
  }) && inlineBreaks>0);
  await new Promise(resolve=>setTimeout(resolve,350));
  const boardRect=reloaded.contentDocument.getElementById('museum-board').getBoundingClientRect(),inspectorRect=reloaded.contentDocument.querySelector('.museum-inspector').getBoundingClientRect();
  const itemsRect=reloaded.contentDocument.querySelector('.collection-list-panel').getBoundingClientRect(),summaryRect=reloaded.contentDocument.querySelector('.collection-summary').getBoundingClientRect();
  check('selected collection gives similar space to Owned and comparison',Math.abs(itemsRect.height-summaryRect.height)<100);
  check('board uses full page width',Math.abs(boardRect.width-reloaded.contentDocument.getElementById('museum-workspace').getBoundingClientRect().width)<1);
  const titleStyle=reloaded.contentWindow.getComputedStyle(reloaded.contentDocument.querySelector('#museum-detail .card-name'));
  check('highlighted title is large and bold',parseFloat(titleStyle.fontSize)>=28 && Number(titleStyle.fontWeight)>=800);
  check('comparison uses the full bottom strip',inspectorRect.top>=itemsRect.bottom-1 && Math.abs(inspectorRect.width-itemsRect.width)<2 && !reloaded.contentDocument.querySelector('.totals-panel'));
  const compareSelect=reloaded.contentDocument.getElementById('collection-compare-item');
  check('selected item has a stat comparison',compareSelect.options.length>0 && !!reloaded.contentDocument.querySelector('.collection-stat-comparison'));
  const slotted=reloaded.contentWindow.DN.loadLoadout().Main.mains;
  const unusedIds=new Set(Array.from(reloaded.contentDocument.querySelectorAll('.museum-unused .museum-tile')).map(tile=>tile.dataset.id));
  check('comparison only offers unused items',Array.from(compareSelect.options).every(option=>unusedIds.has(option.value) && !slotted.includes(option.value)));
  const scores=Array.from(compareSelect.options).map(option=>Number(option.textContent.split('Score ')[1]));
  check('comparison candidates sorted by score',scores.every((score,index)=>index===0 || score<=scores[index-1]));
  compareSelect.value=compareSelect.options[compareSelect.options.length-1].value;
  compareSelect.dispatchEvent(new reloaded.contentWindow.Event('change'));
  check('choosing a compared item updates the table',reloaded.contentDocument.querySelector('.collection-stat-comparison thead th:nth-child(3)').title===compareSelect.selectedOptions[0].textContent.split(' · Score ')[0]);
  await store.accept(Array.from({length:3},(_,index)=>({...saved[0],id:'scan-extra-legend-'+index,type:'Legendary',name:'Extra legendary '+index})));
  const swaps=document.createElement('iframe');swaps.srcdoc=frame.srcdoc;document.body.append(swaps);
  await wait(()=>swaps.contentWindow?.DN?.loadLoadout().Main.scannedPlaced.includes('scan-extra-legend-2'));
  const swapDoc=swaps.contentDocument, state=()=>swaps.contentWindow.DN.loadLoadout().Main;
  const legendTile=Array.from(swapDoc.querySelectorAll('.museum-tile.is-filled')).find(tile=>tile.textContent.includes('Legendary 1'));
  const displaced=legendTile.dataset.id;
  legendTile.click();
  check('legendary replacements come only from showcase',swapDoc.querySelectorAll('#slot-picker-list [data-id]').length===1 && !!swapDoc.querySelector('#slot-picker-list [data-id="scan-extra-legend-2"]'));
  swapDoc.querySelector('#slot-picker-list [data-id="scan-extra-legend-2"]').click();
  check('legendary swap exchanges all and single contributions',state().mains.includes('scan-extra-legend-2') && state().singles[displaced]===1 && !state().singles['scan-extra-legend-2']);
  check('delete visible in structured detail',!!swapDoc.querySelector('#museum-detail [data-action="delete"]'));
  swapDoc.querySelector('#museum-detail [data-action="delete"]').click();
  await wait(()=>!state().mains.includes('scan-extra-legend-2'));
  check('structured delete persisted',!(await store.read(store.collectionKey())).some(item=>item.id==='scan-extra-legend-2'));
  swapDoc.getElementById('view-list').click();
  const deleteButton=swapDoc.querySelector('#collection-list [data-action="delete"]'), deletedId=deleteButton.dataset.id;
  deleteButton.click();await wait(()=>!swapDoc.querySelector('#collection-list [data-artifact-id="'+deletedId+'"]'));
  check('list delete removes artifact and slot',!(await store.read(store.collectionKey())).some(item=>item.id===deletedId) && !state().mains.includes(deletedId));
  swaps.remove();
  reloaded.remove();
  const mainKey=store.collectionKey();
  const profile=window.DN.addProfile('Inventory test');
  window.DN.setActiveProfile(profile);
  check('profile collection isolated',(await store.read(store.collectionKey())).length===0);
  await store.accept(saved);
  check('profile accepts one copy',(await store.read(store.collectionKey())).length===1 && (await store.read(mainKey)).length===14);
  const complete={...saved[0],name:'Upgrade fixture',rows:saved[0].rows.map(row=>({...row,known:true,hasPercent:true,level:row.level??1,base:null,max:null}))};
  window.DNStorageScanner.update({...result,artifact:{...result.artifact,name:complete.name},rows:complete.rows},true,{reviewable:true,expectedRows:5});
  await wait(()=>!get('keep').disabled);
  get('keep').click();get('add-collection').click();await wait(()=>get('collection-status').textContent.startsWith('1 added'));
  const before=(await store.read(store.collectionKey())).find(item=>item.name===complete.name);
  const upgraded=complete.rows.map((row,index)=>index<2?{...row,value:Math.sign(row.value)*(Math.abs(row.value)+1),level:row.level+1}:row);
  window.DNStorageScanner.update({...result,artifact:{...result.artifact,name:complete.name},rows:upgraded},true,{reviewable:true,expectedRows:5});
  get('keep').click();get('add-collection').click();await wait(()=>get('collection-status').textContent.startsWith('0 added, 1 updated'));
  const after=(await store.read(store.collectionKey())).find(item=>item.name===complete.name);
  check('upgraded scan updates in place and clears staging',after.id===before.id && after.rows[0].value===14 && after.rows[1].value===-9 && get('items').children.length===0);
  const downgraded=upgraded.map((row,index)=>index===0?{...row,value:13,level:3}:row);
  window.DNStorageScanner.update({...result,artifact:{...result.artifact,name:complete.name},rows:downgraded},true,{reviewable:true,expectedRows:5});
  get('keep').click();get('add-collection').click();await wait(()=>get('items').children.length===0);
  check('latest matching scan replaces previous levels',get('items').children.length===0 && (await store.read('items')).length===0 && (await store.read(store.collectionKey())).find(item=>item.id===before.id).rows[0].value===13);
  const catalogue=(await(await fetch('data/artifacts.json')).json()).find(item=>item.hall==='Main');
  window.DN.lsSet(window.DN.COLLECTED_KEY,JSON.stringify([catalogue.artifact_id]));
  window.DN.saveCollectionUi({hall:'Main',viewMode:'list',valueMode:'actual'});window.DN.lsSet('dn-artifact-hall-filter','Main');
  const catalogueFrame=document.createElement('iframe');catalogueFrame.srcdoc=frame.srcdoc;document.body.append(catalogueFrame);
  await wait(()=>catalogueFrame.contentDocument?.querySelector('[data-artifact-id="'+catalogue.artifact_id+'"] [data-action="delete"]'));
  catalogueFrame.contentDocument.querySelector('[data-artifact-id="'+catalogue.artifact_id+'"] [data-action="delete"]').click();
  await wait(()=>!catalogueFrame.contentDocument.querySelector('[data-artifact-id="'+catalogue.artifact_id+'"]'));
  check('catalogue artifact can also be deleted',!catalogueFrame.contentWindow.DN.loadCollected().has(catalogue.artifact_id) && !catalogueFrame.contentWindow.DN.loadLoadout().Main.singles[catalogue.artifact_id]);
  catalogueFrame.remove();
  frame.remove();
  return {passed:Object.values(checks).every(Boolean),ui:checks};
})()
