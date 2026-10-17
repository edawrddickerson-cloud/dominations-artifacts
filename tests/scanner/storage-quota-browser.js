(async()=>{
  const checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw new Error(name);};
  await window.DN.scannerLog.ready;
  const legacy=JSON.stringify({version:2,items:[],scans:[],labels:[],evidence:'x'.repeat(2000000)});
  localStorage.setItem('dn-crafting-scanner-log-v2',legacy);
  let filled=false;
  for(let i=0;i<100;i++) {
    try {localStorage.setItem('quota-fixture-'+i,'x'.repeat(64000));}
    catch(error){if(error.name!=='QuotaExceededError')throw error;filled=true;break;}
  }
  check('fixture reaches actual localStorage quota',filled);
  const frame=document.createElement('iframe');frame.src='collection.html';document.body.appendChild(frame);
  await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  await frame.contentWindow.DN.scannerLog.ready;
  check('migration preserves the entire original log',await frame.contentWindow.DN.scannerLog.read()===legacy);
  check('migration frees settings storage',localStorage.getItem('dn-crafting-scanner-log-v2')===null);
  const DN=frame.contentWindow.DN,loadout=DN.loadLoadout();loadout.Main.mains=['quota-test-artifact'];
  DN.saveLoadout(loadout);
  check('loadout persists after quota recovery',DN.loadLoadout().Main.mains.includes('quota-test-artifact'));
  check('migrated log is included in full backups',(await window.DNStoredArtifacts.readBackupRecords()).some(record=>record.id==='crafting-log' && record.value===legacy));
  const scanner=document.createElement('iframe');scanner.src='scanner.html';document.body.appendChild(scanner);
  await new Promise(resolve=>scanner.addEventListener('load',resolve,{once:true}));
  for(let i=0;i<100 && !scanner.contentWindow.DNScannerCollection;i++)await new Promise(resolve=>setTimeout(resolve,20));
  check('scanner restores migrated logs',!!scanner.contentWindow.DNScannerCollection);
  frame.remove();scanner.remove();
  return {passed:true,ui:checks};
})();
