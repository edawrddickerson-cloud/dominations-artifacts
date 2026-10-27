/*
 * Authority: User-requested extraction of already crafted artifacts in storage.
 * Ownership: Reviewed item metadata, artwork and a local browser inventory/export.
 * Invariants: Complete current reads/edits save automatically; duplicates skipped;
 * only unique non-regressing upgrades replace owned records, preserving their IDs;
 * only the requested artwork crop persists, with no uploads or catalogue edits.
 * Constraints: Browser storage is local to this device/origin; export backs it up.
 */
(() => {
  'use strict';
  const get=id=>document.getElementById('storage-'+id);
  const items=[];let current=null,canKeep=false,signature='',edited=false,artifact=null,reviewable=false,pending=false,expectedRows=5,correctionError='';
  let loaded=false,adding=false,collection=[],collectionProfile=null,unknownEditable=false;
  let observationProfile=null,encounter=null,candidateId=null,manualCorrection=false,saveTimer=null,saveKey='',saving=false,failedKey='',dismissedKey='',lastSave=null;
  const store=window.DNStoredArtifacts;
  const esc=window.DN.esc;
  let catalog=[],catalogMatch=null,ownershipTimer=null,ownershipKey='',markedOwnershipKey='';
  let artworkSavingKey='',savedArtworkKey='';
  function saveMatchedArtwork() {
    const image=current?.artifact?.image,profileKey=observationProfile,scanEncounter=encounter,match=catalogMatch;
    if(!match || !image || !reviewable || pending || current.metadataConflict || profileKey!==store.collectionKey())return;
    const key=JSON.stringify([profileKey,scanEncounter,match.artifact_id]);
    if(key===artworkSavingKey || key===savedArtworkKey)return;
    artworkSavingKey=key;
    const item={name:match.name,hall:match.hall.toLowerCase(),rows:current.rows,image};
    const isCurrent=()=>observationProfile===profileKey && encounter===scanEncounter && reviewable && !pending && !current?.metadataConflict && catalogMatch?.artifact_id===match.artifact_id;
    store.saveCatalogArtwork(item,catalog,{profileKey,isCurrent}).then(()=>{if(isCurrent())savedArtworkKey=key;})
      .catch(()=>{savedStatus('Could not save the artifact image. Read the artifact again.',true);})
      .finally(()=>{if(artworkSavingKey===key)artworkSavingKey='';});
  }
  function syncCatalogOwnership({commit=false}={}) {
    catalogMatch=null;
    const item=current && {name:get('name').value.trim(),hall:document.getElementById('scanner-hall').value,rows:current.rows};
    const match=item && reviewable && !pending && !current.metadataConflict && !current.artifact?.categoryUnclear && observationProfile===store.collectionKey() &&
      item.rows?.length===expectedRows && store.matchCatalog(item,catalog);
    const key=match?JSON.stringify([observationProfile,encounter,item.name,match.artifact_id]):'';
    if(key!==ownershipKey){clearTimeout(ownershipTimer);ownershipTimer=null;ownershipKey=key;}
    if(!match)return;
    get('type').value=(match.hall==='War'?'War ':'')+match.grade;
    if(key===markedOwnershipKey) {
      if(window.DN.loadCollected().has(match.artifact_id))catalogMatch=match;
      return;
    }
    if((manualCorrection || edited) && !commit && !window.DN.loadCollected().has(match.artifact_id)) {
      if(!ownershipTimer)ownershipTimer=setTimeout(()=>{ownershipTimer=null;syncCatalogOwnership({commit:true});render();},650);
      return;
    }
    try {
      store.markCatalogOwned([item],catalog,{profileKey:observationProfile});
      catalogMatch=match;markedOwnershipKey=key;
    } catch {savedStatus('Could not mark this artifact Collected on Priority. Retry the scan.',true);}
  }
  function savedStatus(text,error=false){get('saved').textContent=text;get('saved').hidden=!error;}
  const reviewedItem=()=>store.backfillItem(store.linkCatalogItem({id:'scan-preview',reviewed:true,name:get('name').value.trim(),type:get('type').value,hall:document.getElementById('scanner-hall').value,rows:current.rows},catalog));
  function matches() {
    const item=reviewedItem();
    return [store.passivePlan(items,{...item,id:candidateId,manualCorrection},{allowCorrection:true}),store.passivePlan(collection,item,{allowCorrection:!!item.catalogId && manualCorrection})];
  }
  async function refreshCollection() {
    const key=store.collectionKey();
    collectionProfile=null;
    try {const saved=await store.read(key),inventory=await store.read('items');if(key===store.collectionKey()){collection=saved;collectionProfile=key;items.splice(0,items.length,...inventory);}}
    catch {savedStatus('Could not load Collection. Reload to retry.',true);}
    render();
  }
  function renderOwnership() {
    const show=(state,title,detail)=>{
      get('ownership').dataset.state=state;
      get('ownership-title').textContent=title;
      get('ownership-detail').textContent=detail;
    };
    if(!current) {show('unknown','Ownership not checked','Scan an artifact to check your collection and scanned inventory.');return null;}
    if(!loaded || collectionProfile!==store.collectionKey()) {show('unknown','Checking saved artifacts…','Waiting for your active profile\'s collection and scanned inventory.');return null;}
    if(observationProfile!==store.collectionKey()){show('uncertain','Profile changed','Read the current artifact again before saving it to this profile.');return null;}
    if(!reviewable || pending) {show('uncertain','Ownership check pending',pending?'Complete the remaining fields. Valid edits apply automatically.':'Waiting for a current artifact read; the displayed stats may be from the last scan.');return null;}
    if(current.artifact?.categoryUnclear){show('uncertain','Category needed','Choose the artifact category.');return null;}
    if(catalogMatch) {
      show('collection','Collected · '+catalogMatch.grade,catalogMatch.name+' is marked Collected on Artifact rankings.');
      return matches();
    }
    const linked=store.matchCatalog({name:get('name').value,hall:document.getElementById('scanner-hall').value,rows:current.rows},catalog);
    if(linked && !window.DN.loadCollected().has(linked.artifact_id)) {
      show('unmatched','Not collected',linked.name+' is unchecked on Artifact rankings. Tick Collected there or scan it again.');
      return null;
    }
    const preview=reviewedItem();
    if(!get('name').value.trim() || !get('type').value || current.metadataConflict || current.warnings?.some(w=>/OCR reads disagree|conflict/i.test(w)) ||
      preview.rows?.length!==expectedRows || window.DNScannerRecognition.signIssues(preview.rows).length ||
      preview.rows.some(row=>!row.known || row.assumed || !Number.isFinite(row.value) || !row.hasPercent || row.conflict || row.tierConflict)) {
      show('uncertain','More scan details needed','Read the artifact name, category and all stats before checking for a saved match.');return null;
    }
    const checked=matches(),[inventoryMatch,collectionMatch]=checked;
    if(collectionMatch.action!=='added')show(collectionMatch.action==='blocked'?'uncertain':'collection',collectionMatch.action==='updated'?'Collection match · improved stats':collectionMatch.action==='blocked'?'Saved match not resolved':'Already in your collection',
      collectionMatch.reason || 'The improved stats will update the matching item automatically, preserving its Collection spot.');
    else if(inventoryMatch.action!=='added')show(inventoryMatch.action==='blocked'?'uncertain':'inventory',inventoryMatch.action==='updated'?'Scanned inventory match · improved stats':inventoryMatch.action==='blocked'?'Saved match not resolved':'Added',
      inventoryMatch.action==='duplicate'?'Saved to scanned inventory, awaiting import to Collection.':inventoryMatch.reason || 'The improved stats will update your scanned inventory automatically.');
    else show('unmatched','No saved match found','Complete scans are saved to scanned inventory. Add Inventory to Collection transfers them into your active profile.');
    return checked;
  }
  function keepReason() {
    if(adding)return 'Finishing the inventory import.';
    if(!loaded)return 'Loading your saved inventory.';
    if(collectionProfile!==store.collectionKey())return 'Checking your collection for duplicates.';
    if(!current)return 'Read an artifact to save it automatically.';
    if(observationProfile!==store.collectionKey())return 'Profile changed. Read this artifact again for the current profile.';
    if(pending)return correctionError || 'Complete the remaining fields. Edits apply automatically.';
    if(!reviewable)return 'Waiting for a current artifact read.';
    if(current.metadataConflict)return 'Verify the conflicting artifact name, category or Hall.';
    if(current.artifact?.categoryUnclear)return 'Choose the artifact category.';
    const linked=store.matchCatalog({name:get('name').value,hall:document.getElementById('scanner-hall').value,rows:current.rows},catalog);
    if(linked && !window.DN.loadCollected().has(linked.artifact_id))return 'Not collected. Tick Collected on Priority or scan the artifact again.';
    if(current.rows?.length!==expectedRows)return 'Read all '+expectedRows+' stats.';
    for(const [index,row] of reviewedItem().rows.entries()) {
      if(!row.known || row.assumed)return 'Row '+(index+1)+': perk name needed.';
      if(!Number.isFinite(row.value) || !row.hasPercent)return 'Row '+(index+1)+': percentage needed.';
      if(row.conflict)return 'Row '+(index+1)+': conflicting readings.';
      if(row.tierConflict)return 'Row '+(index+1)+': value and level conflict.';
      if(!Number.isInteger(row.level) || row.level<1 || row.level>10)return 'Row '+(index+1)+': upgrade level needed.';
      if(!Number.isFinite(row.base) || !Number.isFinite(row.max))return 'Row '+(index+1)+': range needed.';
      if(typeof row.unlocked!=='boolean')return 'Row '+(index+1)+': star state needed.';
      if(typeof row.rerollEligible!=='boolean')return 'Row '+(index+1)+': reroll state needed.';
    }
    if(current.warnings?.some(w=>/OCR reads disagree|conflict/i.test(w)))return 'Conflicting readings.';
    if(unknownEditable)return 'Complete the highlighted fields.';
    if(window.DNScannerRecognition.signIssues(current.rows).length)return 'Check percentage signs.';
    if(!get('name').value.trim())return 'Enter the artifact name.';
    if(!get('type').value && !linked)return 'Choose the artifact category.';
    if(current.rows.some(row=>Math.abs(row.value)>40))return 'Percentages must be between -40% and +40%.';
    return '';
  }
  function render() {
    syncCatalogOwnership();
    saveMatchedArtwork();
    const special=!!reviewable && !!current && !!store.matchCatalog({name:get('name').value,hall:document.getElementById('scanner-hall').value,rows:current.rows},catalog) || /legendary|mythical/i.test(get('type').value);
    for(const select of document.querySelectorAll('#scanner-correct .scanner-perk-tier')) {
      select.disabled=special;
      select.options[0].textContent=special?'Not applicable':'Unknown';
      select.classList.toggle('is-unknown',false);
    }
    for(const id of ['name','type'])get(id).classList?.toggle('is-unknown',!get(id).value.trim());
    const checked=renderOwnership(),reason=keepReason();canKeep=!reason;
    const plan=checked && (checked[1].action==='added'?checked[0]:checked[1]);
    const nextKey=canKeep?JSON.stringify([observationProfile,encounter,reviewedItem()]):'';
    if(nextKey!==saveKey){clearTimeout(saveTimer);saveTimer=null;saveKey=nextKey;failedKey='';lastSave=null;}
    get('keep').hidden=failedKey!==saveKey || !saveKey;get('keep').disabled=!canKeep || saving || failedKey!==saveKey;
    get('keep-status').textContent=failedKey===saveKey && saveKey?'Save failed. Retry Save.':current && loaded && (reviewable || pending)?reason:'';
    if(canKeep && !saving && !adding && !saveTimer && failedKey!==saveKey && dismissedKey!==saveKey && lastSave?.key!==saveKey && ['added','updated'].includes(plan?.action)) {
      const scheduledKey=saveKey;saveTimer=setTimeout(()=>{saveTimer=null;saveAutomatically(scheduledKey);},manualCorrection || edited?650:0);
    }
    get('add-collection').disabled=!loaded || !items.length || adding || saving;
    get('count').textContent=items.length+' artifacts in your scanned inventory';
    get('items').innerHTML=items.map((item,index)=>({item,index})).reverse().map(({item,index})=>'<li>'+(window.DNArtwork?window.DNArtwork.html(item,'storage-artwork',item.name):item.image?'<img class="storage-artwork" src="'+esc(item.image)+'" alt="'+esc(item.name)+'" loading="lazy" />':'')+'<div><strong>'+esc(item.name)+'</strong> · '+esc(item.type)+' · '+esc(item.hall)+' · '+item.rows.length+' stats'+
      item.rows.map((row,i)=>row.rangeReview?'<p>Stat '+(i+1)+' ('+esc(row.name)+'): '+esc(row.rangeReview)+' '+esc((row.rangeCandidates || []).map(candidate=>'Base '+candidate.base+'% at level '+candidate.level).join(' or '))+'</p>':'').join('')+
      '<button type="button" class="btn" data-remove="'+index+'" aria-label="Remove '+esc(item.name)+'">Remove</button><ul class="storage-inventory-stats" style="--stat-count:'+item.rows.length+'">'+item.rows.map(inventoryStat).join('')+'</ul></div></li>').join('');
  }
  function inventoryStat(row) {
    const percent=value=>Number.isFinite(value)?(value>=0?'+':'')+value+'%':'Unknown';
    const fields=[['Current',percent(row.value)],['Tier',row.tier?row.tier[0].toUpperCase()+row.tier.slice(1):'Unknown'],
      ['Level',row.level!=null?row.level+'/10':'Unknown'],['Base',percent(row.base)],['Max',percent(row.max)],
      ['Star',row.unlocked===true?'Unlocked':row.unlocked===false?'Locked':'Unknown'],
      ['Reroll',row.rerollEligible===true?'Available':row.rerollEligible===false?'Unavailable':'Unknown']];
    return '<li><strong>'+esc(row.name)+'</strong><dl>'+fields.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></li>';
  }
  window.DNStorageScanner={update(result,confirmed,state={}) {
    unknownEditable=!!state.unknownEditable;
    if(collectionProfile!==store.collectionKey())refreshCollection();
    const nextEncounter=state.encounterId ?? (result?.artifact===artifact?encounter:store.newId());
    if(nextEncounter!==encounter || !candidateId){encounter=nextEncounter;candidateId=store.newId();}
    observationProfile=state.profileKey ?? (result===current?observationProfile:store.collectionKey());
    current=result;reviewable=state.reviewable ?? confirmed;pending=!!state.pending;correctionError=state.correctionError || '';expectedRows=state.expectedRows || result?.expectedRows || 5;
    const next=JSON.stringify([result?.artifact,result?.rows?.map(r=>[r.name,r.value,r.level])]);
    if(!result || result.artifact!==artifact || (next!==signature && !edited)) {
      signature=next;edited=false;
      get('name').value=result?.artifact?.name || '';
      get('type').value=result?.artifact?.type || '';
      const detectedHall=/^War /i.test(get('type').value)?'war':result?.artifact?.hall;
      if(detectedHall){document.getElementById('scanner-hall').value=detectedHall;window.DNPrimaryFilters?.setHall(detectedHall);}
      const hall=document.getElementById('scanner-hall').value;
      if(!get('type').value && !result?.artifact?.categoryUnclear){const saved=window.DN.loadScannerArtifactType(hall);get('type').value=[...get('type').options].find(option=>option.value.replace(/^War /,'').toLowerCase()===saved)?.value || '';}
      if(!result?.artifact?.categoryUnclear)window.DN.saveScannerArtifactType(get('type').value,hall);
    }
    artifact=result?.artifact;
    get('picture').hidden=!artifact?.image;
    if(window.DNArtwork){window.DNArtwork.bind(get('picture'),artifact);get('picture').alt=get('name').value || 'Artifact';}
    else if(artifact?.image){get('picture').src=artifact.image;get('picture').alt=get('name').value || 'Captured artifact artwork';}
    else get('picture').removeAttribute('src');
    const notices=(result?.artifact?.metadataWarnings || []).filter(w=>{
      const row=/^Row (\d+): upgrade level/.exec(w);return !row || result.rows[Number(row[1])-1]?.level==null;
    });
    get('metadata').textContent=result?(edited?'Using your checked name and category.':notices.join(' ')):'Read a stored artifact, then verify its name, category and every perk.';
    manualCorrection=!!state.manualCorrection || edited;render();
  }};
  for(const id of ['name','type'])get(id).addEventListener('input',()=>{
    edited=true;manualCorrection=true;
    if(id==='name' && current){const logged=window.DNScannerCollection?.itemForEncounter?.(encounter,observationProfile);if(logged)window.DNScannerCollection.setName(logged.id,get('name').value);}
    if(id==='type' && get('type').value) {
      const hall=/^War /i.test(get('type').value)?'war':'main';
      document.getElementById('scanner-hall').value=hall;window.DNPrimaryFilters?.setHall(hall);
      window.DN.saveScannerArtifactType(get('type').value,hall);
      window.DNScannerReading?.setStorageType(get('type').value);
    }
    get('metadata').textContent='Using your checked name and category.';render();
  });
  async function saveAutomatically(key) {
    if(key!==saveKey || saving || keepReason())return;
    const preview=reviewedItem();
    const item={id:preview.catalogId || candidateId,catalogId:preview.catalogId,manualCorrection,name:preview.name,type:preview.type,hall:preview.hall,
      image:current.artifact?.image || null,...(current.artifact?.artworkId?{artworkId:current.artifact.artworkId}:{}),capturedAt:new Date().toISOString(),reviewed:true,rows:reviewedItem().rows.map(({name,value,level,levelSource,unlocked,base,max,rangeSource,tier,tierSource,tierEvidence,tierConflict,inferredFields,valueSource,observedValue,observedLevel,rerollEligible,rerollSource,rerollConfidence,rerollEvidence,rerollConflict,rangeCandidates,rangeReview})=>({name,value,level:level??null,levelSource:levelSource??null,unlocked:unlocked??null,base:base??null,max:max??null,rangeSource:rangeSource??null,tier:tier??null,tierSource:tierSource??null,tierEvidence:tierEvidence??null,tierConflict:!!tierConflict,inferredFields:inferredFields || [],valueSource:valueSource??null,observedValue:observedValue??null,observedLevel:observedLevel??null,rerollEligible:typeof rerollEligible==='boolean'?rerollEligible:null,rerollSource:rerollSource??null,rerollConfidence:rerollConfidence??null,rerollEvidence:rerollEvidence??null,rerollConflict:!!rerollConflict,rangeCandidates:rangeCandidates || [],rangeReview:rangeReview || null}))};
    saving=true;render();
    try {
      const result=await store.saveScan(item,{profileKey:observationProfile,isCurrent:()=>key===saveKey && !keepReason()});
      if(result.profileKey===store.collectionKey()) {
        collection=result.collection;collectionProfile=result.profileKey;items.splice(0,items.length,...result.items);
        if(key===saveKey && result.action!=='cancelled') {
          const message=result.action==='added'?(item.catalogId?'Saved to the linked artifact in Collection and Priority.':'Saved automatically to scanned inventory.'):result.action==='updated'?(result.target==='collection'?'Improved stats saved to Collection; the existing ID and slot were preserved.':'Improved stats saved to scanned inventory.'):result.reason;
          lastSave={key,message};savedStatus(message);
        }
      }
    } catch(error) {if(key===saveKey){failedKey=key;savedStatus('Save failed. Retry Save.');}}
    finally {saving=false;render();}
  }
  get('keep').addEventListener('click',()=>{failedKey='';dismissedKey='';clearTimeout(saveTimer);saveTimer=null;saveAutomatically(saveKey);});
  get('items').addEventListener('click',async event=>{
    if(adding || saving)return;const button=event.target.closest('[data-remove]');if(!button)return;
    const item=items[Number(button.dataset.remove)];dismissedKey=saveKey;clearTimeout(saveTimer);saveTimer=null;
    try {await store.remove(item.id,{inventory:true});items.splice(0,items.length,...await store.read('items'));render();}
    catch {savedStatus('Could not remove this scan. Try again.',true);}
  });
  get('add-collection').addEventListener('click',async()=>{
    if(!loaded || !items.length || adding || saving)return;
    adding=true;render();get('collection-status').textContent='Adding to your collection…';
    try {
      const importingProfile=store.collectionKey();
      const result=await store.accept(items.slice());
      if(importingProfile===store.collectionKey()){collection=result.collection;collectionProfile=importingProfile;}
      items.splice(0,items.length,...result.remainingInventory);
      savedStatus('Import complete.');
      get('collection-status').textContent=[result.added?result.added+' added':'',result.updated?result.updated+' updated':'',result.blocked?result.blocked+' need review':''].filter(Boolean).join(' · ');
    } catch {get('collection-status').textContent='Import failed. Try again.';}
    finally {adding=false;render();}
  });
  render();
  window.addEventListener('focus',refreshCollection);
  window.addEventListener('storage',refreshCollection);
  window.addEventListener('dn-artifacts-changed',refreshCollection);
  store.loadCatalog().then(async rows=>{
    catalog=rows;
    const linked=await store.reconcileCatalog(catalog);
    if(linked.profileKey===store.collectionKey()){items.splice(0,items.length,...linked.items);collection=linked.collection;collectionProfile=linked.profileKey;}
    savedStatus('Inventory loaded.');
  })
    .catch(()=>{savedStatus('Browser storage is unavailable.',true);})
    .finally(()=>{loaded=true;render();});
})();
