/* Local file backup of planner settings, crafting logs and all scanned artwork.
 * No uploads. Restore validates before writing and rolls back on storage errors. */
(() => {
  'use strict';
  function settingsSnapshot(storage) {
    const settings={};
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if(key.startsWith('dn-'))settings[key]=storage.getItem(key);
    }
    return settings;
  }
  function validate(data) {
    const fail=()=>{throw new Error('Choose a full planner backup made with Export Backup.');};
    if(data?.kind!=='dominations-planner-backup' || data.version!==1 ||
      !data.settings || typeof data.settings!=='object' || Array.isArray(data.settings) || !Array.isArray(data.records))fail();
    for(const [key,value] of Object.entries(data.settings))if(!key.startsWith('dn-') || typeof value!=='string')fail();
    const ids=new Set();
    for(const record of data.records) {
      if(!record || typeof record.id!=='string' || (record.id!=='items' && !record.id.startsWith('collection:')) || ids.has(record.id) || !Array.isArray(record.items))fail();
      ids.add(record.id);
      for(const item of record.items) {
        if(!item || typeof item.id!=='string' || typeof item.name!=='string' || typeof item.type!=='string' ||
          !['main','war'].includes(item.hall) || !Array.isArray(item.rows) || item.rows.length<1 || item.rows.length>6)fail();
        if(item.image!=null && (typeof item.image!=='string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(item.image)))fail();
        for(const row of item.rows)if(!row || typeof row.name!=='string' || !Number.isFinite(row.value))fail();
      }
    }
    return data;
  }
  function replaceSettings(storage,settings) {
    for(const key of Object.keys(settingsSnapshot(storage)))storage.removeItem(key);
    for(const [key,value] of Object.entries(settings))storage.setItem(key,value);
  }
  async function restore(data,storage,store) {
    validate(data);
    const previous=settingsSnapshot(storage);
    try {await store.restoreBackupRecords(data.records,()=>replaceSettings(storage,data.settings));}
    catch(error) {
      try {replaceSettings(storage,previous);}
      catch {throw new Error('Restore failed and browser settings could not be rolled back. Keep your safety backup and restore it after freeing browser storage.');}
      throw error;
    }
  }
  window.DNLocalBackupCore={validate,settingsSnapshot,restore};
  const root=document.querySelector('[data-local-backup]');
  if(!root)return;
  root.innerHTML='<summary>Back up / restore saved data</summary><p>Browser storage survives normal restarts, but clearing site data removes it. Export a file to keep a separate copy of crafting logs, scanned stats and artwork, every profile\'s Collection, and planner settings.</p><button type="button" class="btn" data-backup-export>Export Backup</button> <button type="button" class="btn" data-backup-import>Import Backup</button><input type="file" accept=".json,application/json" data-backup-file hidden /><p role="status" aria-live="polite" data-backup-status></p>';
  const exportButton=root.querySelector('[data-backup-export]'),importButton=root.querySelector('[data-backup-import]'),fileInput=root.querySelector('[data-backup-file]'),status=root.querySelector('[data-backup-status]');
  const store=window.DNStoredArtifacts;
  const snapshot=async()=>({kind:'dominations-planner-backup',version:1,exportedAt:new Date().toISOString(),settings:settingsSnapshot(localStorage),records:await store.readBackupRecords()});
  function download(data,prefix='dominations-backup') {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const busy=value=>{exportButton.disabled=value;importButton.disabled=value;};
  exportButton.addEventListener('click',async()=>{
    busy(true);
    try {download(await snapshot());status.textContent='Backup download started. Keep the JSON file somewhere safe; export again after adding or editing stats.';}
    catch(error){status.textContent='Backup failed: '+error.message;}
    finally{busy(false);}
  });
  importButton.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];if(!file)return;
    busy(true);
    try {
      const data=validate(JSON.parse(await file.text()));
      const total=data.records.reduce((sum,record)=>sum+record.items.length,0);
      if(!confirm('Restore this backup ('+total+' scanned artifacts)? This replaces ALL saved planner data in this browser, including every profile and crafting log. Close other planner tabs and stop scanning first. A safety backup of your current data will download before restore.'))return;
      download(await snapshot(),'dominations-before-restore');
      await restore(data,localStorage,store);
      location.reload();
    } catch(error){status.textContent='Backup could not be restored: '+error.message;}
    finally{fileInput.value='';busy(false);}
  });
})();
