(async()=>{
  const checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw new Error(name);};
  const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Loading timed out');};
  await wait(()=>window.DNLocalBackupCore && window.DNStoredArtifacts);
  const core=window.DNLocalBackupCore,store=window.DNStoredArtifacts;
  const item={id:'backup-fixture',name:'Backup artifact',type:'Legendary',hall:'main',image:'data:image/png;base64,YQ==',rows:[{name:'Damage',value:-6,level:1,base:-6,max:-15,rerollEligible:true}]};
  await store.write('items',[item]);await store.write('collection:other-profile',[item]);
  localStorage.setItem('dn-crafting-scanner-log-v2',JSON.stringify({version:2,items:[],scans:[],labels:[]}));
  localStorage.setItem('dn-backup-fixture','saved');localStorage.setItem('unrelated','keep');
  const data={kind:'dominations-planner-backup',version:1,settings:core.settingsSnapshot(localStorage),records:await store.readBackupRecords()};
  core.validate(data);
  const before=JSON.stringify(data.records);
  try {await store.restoreBackupRecords([],()=>{throw new Error('Settings quota failure');});throw new Error('Expected failure');}
  catch(error){check('real IndexedDB abort reports settings error',error.message==='Settings quota failure');}
  check('real IndexedDB abort preserves inventory',JSON.stringify(await store.readBackupRecords())===before);
  await store.write('items',[]);localStorage.setItem('dn-backup-fixture','changed');
  await core.restore(JSON.parse(JSON.stringify(data)),localStorage,store);
  check('real IndexedDB restores inventory and every collection',JSON.stringify(await store.readBackupRecords())===before);
  check('settings and crafting log restored',localStorage.getItem('dn-backup-fixture')==='saved' && localStorage.getItem('dn-crafting-scanner-log-v2')===data.settings['dn-crafting-scanner-log-v2']);
  check('unrelated settings preserved',localStorage.getItem('unrelated')==='keep');
  let blob,downloadName;
  const createURL=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=value=>{blob=value;return 'blob:fixture';};
  HTMLAnchorElement.prototype.click=function(){downloadName=this.download;};
  document.querySelector('[data-backup-export]').click();
  await wait(()=>blob);
  const downloaded=JSON.parse(await blob.text());core.validate(downloaded);
  check('export button downloads complete backup',downloadName.startsWith('dominations-backup-') && downloaded.records.length===2 && downloaded.settings['dn-backup-fixture']==='saved');
  URL.createObjectURL=createURL;HTMLAnchorElement.prototype.click=click;
  for(const page of ['collection.html','storage-scanner.html','scanner.html']) {
    const frame=document.createElement('iframe');frame.src=page;document.body.appendChild(frame);
    await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    check(page+' has no backup controls',!frame.contentDocument.querySelector('[data-local-backup]'));
    frame.remove();
  }
  return {passed:true,ui:checks};
})();
