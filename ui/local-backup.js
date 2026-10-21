/* Local file backup of planner settings, crafting logs and all scanned artwork.
 * No uploads. Restore validates before writing and rolls back on storage errors. */
(() => {
  'use strict';
  // Historical scoring settings do not all use the dn- prefix. Keep this
  // explicit so backups never sweep in authentication or integration storage.
  const additionalSettings=new Set(['dn_perk_group_defaults_v1']);
  const isSettingKey=key=>typeof key==='string' && (key.startsWith('dn-') || additionalSettings.has(key));
  function settingsSnapshot(storage) {
    const settings={};
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if(isSettingKey(key))settings[key]=storage.getItem(key);
    }
    return settings;
  }
  function validate(data) {
    const fail=()=>{throw new Error('Choose a full planner backup made with Export Backup.');};
    if(data?.kind!=='dominations-planner-backup' || data.version!==1 ||
      !data.settings || typeof data.settings!=='object' || Array.isArray(data.settings) || !Array.isArray(data.records))fail();
    for(const [key,value] of Object.entries(data.settings))if(!isSettingKey(key) || typeof value!=='string')fail();
    const ids=new Set();
    for(const record of data.records) {
      if(record?.id==='crafting-log') {
        if(ids.has(record.id) || typeof record.value!=='string')fail();
        ids.add(record.id);continue;
      }
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
    await window.DN?.scannerLog?.ready;
    const previous=settingsSnapshot(storage);
    const settings={...data.settings},records=data.records.slice();
    // Backups from before log migration remain supported without filling the
    // settings quota again. Restore both the log and artifacts atomically.
    const logKey='dn-crafting-scanner-log-v2';
    if(settings[logKey]!=null) {
      if(!records.some(record=>record.id==='crafting-log'))records.push({id:'crafting-log',value:settings[logKey]});
      delete settings[logKey];
    }
    try {await store.restoreBackupRecords(records,()=>replaceSettings(storage,settings));}
    catch(error) {
      try {replaceSettings(storage,previous);}
      catch {throw new Error('Restore failed and browser settings could not be rolled back. Keep your safety backup and restore it after freeing browser storage.');}
      throw error;
    }
  }
  async function saveRecovery(local,serviceStore) {
    const previous=await serviceStore.get('cloud-recovery') || [];
    await serviceStore.put('cloud-recovery',[{createdAt:new Date().toISOString(),owner:null,local,remote:null},...previous].slice(0,3));
  }
  window.DNLocalBackupCore={validate,settingsSnapshot,restore,saveRecovery};
  const root=document.querySelector('[data-local-backup]');
  if(!root)return;
  root.innerHTML='<summary>Backups</summary><p>All profiles, collections, scanner logs, images and settings.</p><button type="button" class="btn" data-backup-export>Export Backup</button> <button type="button" class="btn" data-backup-import>Import Backup</button><input type="file" accept=".json,application/json" data-backup-file hidden /><p role="status" aria-live="polite" data-backup-status></p>';
  const exportButton=root.querySelector('[data-backup-export]'),importButton=root.querySelector('[data-backup-import]'),fileInput=root.querySelector('[data-backup-file]'),status=root.querySelector('[data-backup-status]');
  const store=window.DNStoredArtifacts;
  const snapshot=async()=>{
    await window.DN.scannerLog.ready;
    return {kind:'dominations-planner-backup',version:1,exportedAt:new Date().toISOString(),settings:settingsSnapshot(localStorage),records:await store.readBackupRecords()};
  };
  function download(data,prefix='dominations-backup') {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const busy=value=>{exportButton.disabled=value;importButton.disabled=value;};
  exportButton.addEventListener('click',async()=>{
    busy(true);
    try {download(await snapshot());status.textContent='Backup download started.';}
    catch(error){status.textContent='Backup failed: '+error.message;}
    finally{busy(false);}
  });
  importButton.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];if(!file)return;
    busy(true);
    try {
      const data=validate(JSON.parse(await file.text()));
      const total=data.records.reduce((sum,record)=>sum+(record.items?.length || 0),0);
      if(!confirm('Restore backup ('+total+' scanned artifacts)? This replaces this browser’s planner data. Close other planner tabs and stop scanning. A local safety copy will be available in Show safety backups.'))return;
      await window.DNServicesReady;
      if(!window.DNServiceStore)throw Error('Safety backup storage is unavailable. Reload and try again.');
      await saveRecovery(await snapshot(),window.DNServiceStore);
      await restore(data,localStorage,store);
      location.reload();
    } catch(error){status.textContent='Backup could not be restored: '+error.message;}
    finally{fileInput.value='';busy(false);}
  });
})();
