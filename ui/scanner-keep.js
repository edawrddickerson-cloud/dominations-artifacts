/* Explicit user ownership: keep a confirmed craft in inventory and the active
 * profile's benchmarks. OCR observations alone never establish ownership. */
(() => {
  'use strict';
  const get=id=>document.getElementById('scanner-'+id),button=get('keep');
  if(!button)return;
  const DN=window.DN,store=window.DNStoredArtifacts,saved=new Map(),ids=new Map(),pending=new Map();
  let result=null,state={},saving=false,failure='',failureKey='';
  const key=()=>state.profileKey+':'+state.encounterId;
  const currentLog=()=>window.DNScannerCollection?.itemForEncounter(state.encounterId,state.profileKey);
  function loggedReason(item){
    if(!window.DNScannerCollectionCore?.isComplete(item))return 'All five stats must be complete before keeping this craft.';
    if(!['main','war'].includes(item.hall))return 'The artifact hall needs to be identified.';
    if(!item.type)return 'Choose the artifact category before keeping.';
    if(item.profileKey && item.profileKey!==store.collectionKey())return 'Switch to the profile this craft was scanned for.';
    return '';
  }
  async function saveItem(item,profileKey,logged,encounter){
    if(pending.has(item.id))return pending.get(item.id);
    const operation=(async()=>{
      const outcome=await store.keepCraft(item,{profileKey});
      if(outcome.action==='cancelled')throw new Error('Profile changed before this craft could be kept.');
      if(encounter)saved.set(encounter,item.id);
      if(logged)window.DNScannerCollection?.markKept(logged.id,item.id,{type:item.type,profileKey});
      window.dispatchEvent(new CustomEvent('dn-craft-kept'));
      return outcome;
    })();
    pending.set(item.id,operation);render();
    try{return await operation;}finally{pending.delete(item.id);render();}
  }
  async function keepLogged(logged){
    const blocked=loggedReason(logged);if(blocked)throw new Error(blocked);
    const profileKey=logged.profileKey || store.collectionKey(),type=logged.type;
    const item=store.backfillItem({id:logged.keptId || logged.keepId || 'craft-log-'+logged.id,name:logged.name || 'Crafted '+type,
      hall:logged.hall,type,reviewed:true,freshCraft:true,keptFromCraft:true,profileId:DN.activeProfileId(),
      capturedAt:logged.firstSeen || new Date().toISOString(),rows:structuredClone(logged.rows)});
    return saveItem(item,profileKey,logged,currentLog()?.id===logged.id?key():null);
  }
  function reason(){
    if(!state.current || !state.confirmed || !result?.valid || result.rows?.length!==5 ||
      result.rows.some(row=>!row.known || row.assumed || row.conflict || row.tierConflict || !Number.isFinite(row.value)))return 'Confirm all five stats before keeping this craft.';
    if(state.profileKey!==store.collectionKey())return 'Read this craft again for the current profile.';
    if(!get('compare-type').value)return 'Choose the artifact category before keeping.';
    return '';
  }
  function render(){
    const logged=currentLog(),kept=saved.has(key()) || !!logged?.keptId,blocked=reason(),busy=saving || pending.has(logged?.keepId);
    if(logged && !logged.keptId && saved.has(key()))window.DNScannerCollection?.markKept(logged.id,saved.get(key()),{keepId:saved.get(key())});
    button.textContent=busy?'Saving…':kept?'Kept':'Keep';
    button.disabled=busy || kept || !!blocked;
    button.title=kept?'Already added to inventory':blocked || 'Add this craft to inventory and benchmarks';
    const status=get('keep-status');
    status.textContent=failureKey===key()?failure:'';status.hidden=!status.textContent;
  }
  window.DNScannerKeep={loggedReason,keepLogged,update(next,nextState){result=next;state=nextState;render();}};
  button.addEventListener('click',async()=>{
    if(saving || saved.has(key()) || reason())return;
    const encounter=key(),profileKey=state.profileKey,profileId=DN.activeProfileId();
    const logged=currentLog();
    if(!ids.has(encounter))ids.set(encounter,logged?.keepId || store.newId());
    const type=get('compare-type').value.replace(/^./,letter=>letter.toUpperCase());
    const item=store.backfillItem({id:ids.get(encounter),name:result.artifact?.name || 'Crafted '+type,
      hall:result.hall || get('hall').value,type,reviewed:true,freshCraft:true,keptFromCraft:true,profileId,
      capturedAt:new Date().toISOString(),image:result.artifact?.image || null,rows:structuredClone(result.rows)});
    saving=true;failure='';render();
    try{
      await saveItem(item,profileKey,logged,encounter);
    }catch(error){failureKey=encounter;failure=error.message || 'Could not keep this craft. Try again.';}
    finally{saving=false;render();}
  });
  get('compare-type').addEventListener('change',render);
  window.addEventListener('focus',render);
  render();
})();
