/* Import only missing local image pixels for already-owned stable identities. */
(() => {
 'use strict';
 const button=document.querySelector('[data-recover-images]'),input=document.querySelector('[data-image-backup]'),status=document.querySelector('[data-image-recovery-status]');
 if(!button||!input)return;
 button.addEventListener('click',()=>input.click());
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file)return;button.disabled=true;status.textContent='Reading backup…';
  const owner=window.DNCloud?.user()?.id || 'local',current=()=>owner===(window.DNCloud?.user()?.id || 'local');
  try{
   if(file.size>67108864)throw Error('Choose a backup under 64 MB.');
   const backup=JSON.parse(await file.text());
   if(backup.kind!=='dominations-planner-backup'||backup.version!==1||!Array.isArray(backup.records))throw Error('Choose a full planner backup.');
   const records=await window.DNStoredArtifacts.readBackupRecords(),result=window.DNLocalArtworkRecovery.recover(records,[{owner,local:backup}],{owner});
   const restored=await window.DNStoredArtifacts.recoverArtwork(result.patches,current);
   if(!current())throw Error('Account changed. Retry.');
   status.textContent=restored?restored.toLocaleString()+' images recovered':'No matching missing images';
  }catch(error){status.textContent=error.message || 'Images could not be recovered.';}
  finally{button.disabled=false;input.value='';}
 });
})();
