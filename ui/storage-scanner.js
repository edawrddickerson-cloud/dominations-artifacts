/*
 * Authority: User-requested extraction of already crafted artifacts in storage.
 * Ownership: Reviewed item metadata, artwork and a local browser inventory/export.
 * Invariants: Explicit keep action; current, validated rows only; duplicates retained;
 * only the requested artwork crop persists, with no uploads or catalogue edits.
 * Constraints: Browser storage is local to this device/origin; export backs it up.
 */
(() => {
  'use strict';
  const get=id=>document.getElementById('storage-'+id);
  const items=[];let current=null,canKeep=false,signature='',edited=false,artifact=null,reviewable=false,pending=false,expectedRows=5,correctionError='';
  let loaded=false,adding=false;
  const store=window.DNStoredArtifacts;
  const esc=window.DN.esc;
  const reviewedItem=()=>store.backfillItem({type:get('type').value,hall:document.getElementById('scanner-hall').value,rows:current.rows});
  function keepReason() {
    if(adding)return 'Finishing the inventory import.';
    if(!loaded)return 'Loading your saved inventory.';
    if(!current)return 'Read an artifact before keeping it.';
    if(pending)return correctionError || 'Apply your edits with Use Corrected Values before keeping this artifact.';
    if(!reviewable)return 'Read the current artifact again before keeping it.';
    if(current.rows?.length!==expectedRows)return 'Capture all '+expectedRows+' stats before keeping this artifact.';
    for(const [index,row] of reviewedItem().rows.entries()) {
      if(!row.known)return 'Row '+(index+1)+': choose a known perk in Correct Recognition.';
      if(!Number.isFinite(row.value) || !row.hasPercent)return 'Row '+(index+1)+': enter a percentage in Correct Recognition.';
      if(row.conflict)return 'Row '+(index+1)+': check the conflicting reads in Correct Recognition.';
      if(row.tierConflict)return 'Row '+(index+1)+': percentage and level conflict with this tier. Correct or clear the unclear level.';
    }
    if(current.warnings?.some(w=>/OCR reads disagree|conflict/i.test(w)))return 'Check the conflicting reads in Correct Recognition.';
    if(window.DNScannerRecognition.signIssues(current.rows).length)return 'Check the percentage signs in Correct Recognition.';
    if(!get('name').value.trim())return 'Enter the artifact name.';
    if(!get('type').value)return 'Choose the artifact category.';
    return '';
  }
  function render() {
    for(const id of ['name','type'])get(id).classList?.toggle('is-unknown',!get(id).value.trim());
    const reason=keepReason();canKeep=!reason;get('keep').disabled=!canKeep;
    get('keep-status').textContent=reason || (current.valid?'Ready to keep. Check the name, category and stats first.':'All stats are present. Check the OCR warnings; Keep Artifact confirms the values shown.');
    get('export').disabled=!items.length;
    get('add-collection').disabled=!loaded || !items.length || adding;
    get('count').textContent=items.length+' artifacts in your scanned inventory';
    get('items').innerHTML=items.map((item,index)=>'<li>'+(item.image?'<img class="storage-artwork" src="'+esc(item.image)+'" alt="'+esc(item.name)+'" loading="lazy" />':'')+'<div><strong>'+esc(item.name)+'</strong> · '+esc(item.type)+' · '+esc(item.hall)+' · '+item.rows.length+' stats'+
      item.rows.map((row,i)=>row.rangeReview?'<p>Stat '+(i+1)+' ('+esc(row.name)+'): '+esc(row.rangeReview)+' '+esc((row.rangeCandidates || []).map(candidate=>'Base '+candidate.base+'% at level '+candidate.level).join(' or '))+'</p>':'').join('')+
      '<button type="button" class="btn" data-remove="'+index+'" aria-label="Remove '+esc(item.name)+'">Remove</button><ul>'+item.rows.map(row=>'<li>'+esc(row.name)+' '+(row.value>=0?'+':'')+row.value+'%'+(row.level!=null?' · Level '+row.level+'/10':' · Level unknown')+' · '+(row.tier?esc(row.tier[0].toUpperCase()+row.tier.slice(1))+' tier':'Tier unknown')+' · Base '+(row.base??'?')+'% → Max '+(row.max??'?')+'%'+(row.unlocked===true?' · Unlocked':row.unlocked===false?' · Locked':' · Star unknown')+' · '+(row.rerollEligible===true?'Reroll available':row.rerollEligible===false?'Cannot reroll':'Reroll unknown')+'</li>').join('')+'</ul></div></li>').join('');
  }
  function persist() {
    store.write('items',items).then(()=>{get('saved').textContent='Saved on this device, including artwork. Export a backup to keep a separate copy.';})
      .catch(()=>{get('saved').textContent='Could not save this change in the browser. Export your inventory to keep it.';});
  }
  window.DNStorageScanner={update(result,confirmed,state={}) {
    current=result;reviewable=state.reviewable ?? confirmed;pending=!!state.pending;correctionError=state.correctionError || '';expectedRows=state.expectedRows || result?.expectedRows || 5;
    const next=JSON.stringify([result?.artifact,result?.rows?.map(r=>[r.name,r.value,r.level])]);
    if(!result || result.artifact!==artifact || (next!==signature && !edited)) {
      signature=next;edited=false;
      get('name').value=result?.artifact?.name || '';
      get('type').value=result?.artifact?.type || '';
      const detectedHall=/^War /i.test(get('type').value)?'war':result?.artifact?.hall;
      if(detectedHall){document.getElementById('scanner-hall').value=detectedHall;window.DNPrimaryFilters?.setHall(detectedHall);}
      const hall=document.getElementById('scanner-hall').value;
      if(!get('type').value){const saved=window.DN.loadScannerArtifactType(hall);get('type').value=[...get('type').options].find(option=>option.value.replace(/^War /,'').toLowerCase()===saved)?.value || '';}
      window.DN.saveScannerArtifactType(get('type').value,hall);
    }
    artifact=result?.artifact;
    get('picture').hidden=!artifact?.image;
    if(artifact?.image){get('picture').src=artifact.image;get('picture').alt=get('name').value || 'Captured artifact artwork';}
    else get('picture').removeAttribute('src');
    const notices=(result?.artifact?.metadataWarnings || []).filter(w=>{
      const row=/^Row (\d+): upgrade level/.exec(w);return !row || result.rows[Number(row[1])-1]?.level==null;
    });
    get('metadata').textContent=result?(edited?'Using your checked name and category.':notices.join(' ')):'Read a stored artifact, then verify its name, category and every perk.';
    render();
  }};
  for(const id of ['name','type'])get(id).addEventListener('input',()=>{
    edited=true;
    if(id==='type' && get('type').value) {
      const hall=/^War /i.test(get('type').value)?'war':'main';
      document.getElementById('scanner-hall').value=hall;window.DNPrimaryFilters?.setHall(hall);
      window.DN.saveScannerArtifactType(get('type').value,hall);
    }
    get('metadata').textContent='Using your checked name and category.';render();
  });
  get('keep').addEventListener('click',()=>{
    if(keepReason())return;
    items.unshift({id:store.newId(),name:get('name').value.trim(),type:get('type').value,hall:document.getElementById('scanner-hall').value,
      image:current.artifact?.image || null,capturedAt:new Date().toISOString(),reviewed:true,rows:reviewedItem().rows.map(({name,value,level,levelSource,unlocked,base,max,rangeSource,tier,tierSource,tierEvidence,tierConflict,inferredFields,valueSource,observedValue,observedLevel,rerollEligible,rerollSource,rerollConfidence,rerollEvidence,rerollConflict,rangeCandidates,rangeReview})=>({name,value,level:level??null,levelSource:levelSource??null,unlocked:unlocked??null,base:base??null,max:max??null,rangeSource:rangeSource??null,tier:tier??null,tierSource:tierSource??null,tierEvidence:tierEvidence??null,tierConflict:!!tierConflict,inferredFields:inferredFields || [],valueSource:valueSource??null,observedValue:observedValue??null,observedLevel:observedLevel??null,rerollEligible:typeof rerollEligible==='boolean'?rerollEligible:null,rerollSource:rerollSource??null,rerollConfidence:rerollConfidence??null,rerollEvidence:rerollEvidence??null,rerollConflict:!!rerollConflict,rangeCandidates:rangeCandidates || [],rangeReview:rangeReview || null}))});
    render();persist();
  });
  get('items').addEventListener('click',event=>{if(adding)return;const button=event.target.closest('[data-remove]');if(button){items.splice(Number(button.dataset.remove),1);render();persist();}});
  get('add-collection').addEventListener('click',async()=>{
    if(!loaded || !items.length || adding)return;
    adding=true;render();get('collection-status').textContent='Adding to your collection…';
    try {
      const result=await store.accept(items.slice());
      items.splice(0,items.length,...result.remainingInventory);
      get('saved').textContent='Imported items and duplicates were removed from scanned inventory. Changes saved on this device.';
      get('collection-status').textContent=result.added+' added, '+result.updated+' updated, '+result.duplicates+' duplicates skipped; '+result.blocked+' left for review in '+window.DN.activeProfile().name+' collection. '+result.issues.join(' ');
    } catch {get('collection-status').textContent='Could not save to your collection. Try again; Export Inventory can keep a backup.';}
    finally {adding=false;render();}
  });
  get('export').addEventListener('click',()=>{
    if(!items.length)return;
    const blob=new Blob([JSON.stringify({version:3,kind:'stored-artifact-inventory',exportedAt:new Date().toISOString(),items},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='stored-artifacts-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  render();
  store.read('items').then(saved=>{items.push(...saved);get('saved').textContent='Inventory is saved on this device, including artwork.';})
    .catch(()=>{get('saved').textContent='Browser storage is unavailable. Export before closing this tab.';})
    .finally(()=>{loaded=true;render();});
})();
