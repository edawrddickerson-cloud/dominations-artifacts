const {browserRun}=require('./artwork_browser.cjs');
browserRun(async({evaluate})=>{
 const result=await evaluate(`(async()=>{
  const checks=[],assert=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};window.DNAppShell={accepts:()=>true,navigate:()=>true};
  const frame=document.createElement('iframe');frame.id='scanner-view';frame.style='width:100%;height:1200px';document.body.append(frame);frame.src='/ui/collection.html';
  const wait=async test=>{for(let i=0;i<800;i++){if(await test())return;await new Promise(r=>setTimeout(r,25));}throw Error('Readiness timeout');};
  await wait(()=>frame.contentWindow.DNLocalArtworkRecovery&&frame.contentWindow.DNStoredArtifacts);const w=frame.contentWindow,d=frame.contentDocument;await w.DNServicesReady;
  const c=w.document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillRect(0,0,8,8);const image=c.toDataURL('image/png');
  const key=w.DNStoredArtifacts.collectionKey(),items=[{id:'image-fixture',name:'Keep current name',hall:'main',type:'Weapon',rows:[{name:'Heavy Infantry Damage',value:11,known:true}]},{id:'current-image',name:'Current capture',hall:'main',type:'Weapon',image,rows:[{name:'Heavy Infantry Damage',value:6,known:true}]}];await w.DNStoredArtifacts.write(key,items);
  const before=await w.DNStoredArtifacts.read(key),settings=w.localStorage.getItem('dn-profiles');
  const backup={kind:'dominations-planner-backup',version:1,settings:{'dn-profiles':'do not import'},records:[{id:key,items:[{...items[0],name:'Old name',image,rows:[]},{id:'deleted-copy',image}]}]};
  const file=new w.File([JSON.stringify(backup)],'backup.json',{type:'application/json'}),transfer=new w.DataTransfer();transfer.items.add(file);const input=d.querySelector('[data-image-backup]');input.files=transfer.files;input.dispatchEvent(new w.Event('change'));
  await wait(()=>d.querySelector('[data-image-recovery-status]').textContent==='1 images recovered');const saved=await w.DNStoredArtifacts.read(key);
  assert('file recovery fills only missing pixels',saved[0].image===image&&saved[1].image===image);
  assert('file recovery preserves current stats and names',saved[0].name===before[0].name&&JSON.stringify(saved[0].rows)===JSON.stringify(before[0].rows));
  assert('file recovery never recreates deleted items',saved.length===2);assert('file recovery does not import backup settings',w.localStorage.getItem('dn-profiles')===settings);
  await w.DNStoredArtifacts.remove('image-fixture');const restored=await w.DNStoredArtifacts.recoverArtwork([{record:key,id:'image-fixture',image}]);assert('delayed recovery cannot resurrect deletion',restored===0);
  const blocked=await w.DNStoredArtifacts.recoverArtwork([{record:key,id:'current-image',image}],()=>false);assert('account-change guard blocks recovery',blocked===0);
  return checks;
 })()`);console.log('Collection image recovery: '+result.length+' real-browser storage/file checks passed.');
}).catch(error=>{console.error(error);process.exitCode=1;});
