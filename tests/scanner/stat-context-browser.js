/* Isolated browser profile only. Seed local test data, exercise the real export
 * control, and verify the audit neither changes storage nor exports private IDs. */
(async()=>{
  const until=performance.now()+20000;
  while(!window.DNArtifactStatContext || !window.DNScannerCollection || !window.DNStoredArtifacts){if(performance.now()>until)throw new Error('Stat context scripts did not load');await new Promise(resolve=>setTimeout(resolve,25));}
  const checks={},check=(name,value)=>{checks[name]=!!value;if(!value)throw new Error(name);};
  const row={name:'Invading Heavy Infantry Hitpoints',value:-5,known:true,hasPercent:true,colour:'green'};
  localStorage.setItem('dn-crafting-scanner-log-v2',JSON.stringify({version:2,items:[{id:'private-log-id',hall:'main',type:'Armor',freshCraft:true,rows:[row]}],scans:[]}));
  await DNStoredArtifacts.write('collection:private-profile-id',[{id:'private-owned-id',hall:'war',type:'Equipment',rows:[{name:'Fighter Damage',known:true,hasPercent:true,value:6,level:1,levelSource:'manual'}]}]);
  const beforeSettings=JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
  const beforeItems=JSON.stringify(await DNStoredArtifacts.readBackupRecords());
  const report=await DNArtifactStatContext.browserEvidence();
  check('reads saved crafting observations',report.crafting.counts.rowObservations===1);
  check('reads owned inventory',report.owned.counts.rowObservations===1);
  check('detects the impossible Main green starting value',report.crafting.counts.tierConflicts===1);
  check('expected value remains distinct from OCR',DNArtifactStatContext.assess(row,{hall:'main',type:'Armor',freshCraft:true}).expectedValue===-6 && row.value===-5);
  let blob,download;
  const originalURL=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalClick=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=value=>{blob=value;return 'blob:stat-context-fixture';};URL.revokeObjectURL=()=>{};
  HTMLAnchorElement.prototype.click=function(){download=this.download;};
  try{
    document.getElementById('scanner-stat-evidence-export').click();
    while(!blob){if(performance.now()>until)throw new Error('Evidence export did not finish');await new Promise(resolve=>setTimeout(resolve,25));}
    const text=await blob.text(),exported=JSON.parse(text);
    check('real export button includes saved data even with an empty current collector',exported.crafting.counts.rowObservations===1 && exported.owned.counts.rowObservations===1);
    check('export has its own evidence format',exported.kind==='artifact-stat-evidence' && download.startsWith('artifact-stat-evidence-'));
    check('export omits profile and physical item IDs',!text.includes('private-'));
    check('export reports local storage read success',exported.errors.length===0);
  }finally{URL.createObjectURL=originalURL;URL.revokeObjectURL=originalRevoke;HTMLAnchorElement.prototype.click=originalClick;}
  check('audit and export preserve settings',beforeSettings===JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]))));
  check('audit and export preserve owned data',beforeItems===JSON.stringify(await DNStoredArtifacts.readBackupRecords()));
  const itemRows=Array.from({length:5},(_,index)=>({name:'Fighter Damage',known:true,value:index===1?11:6,hasPercent:true,
    raw:'Fighter Damage '+(index===1?'+11%':'+6%'),unlocked:index<2,level:1,levelSource:'crafting',
    ...(index===2?{inferred:true}:{}),...(index===3?{assumed:true}:{}),...(index===4?{conflict:true}:{}),rerollEligible:true,rerollSource:'fresh-craft'}));
  const reading={hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon'},valid:false,rows:itemRows,
    unlocked:{count:2,states:[true,true,false,false,false]},observations:[{pass:'test-original-read',rows:itemRows}],
    presentation:{attempt:1,rows:itemRows},temporal:{frames:3,method:'median'},ocrCalls:7};
  DNScannerCollection.record(reading);
  DNScannerCollection.recordItem(reading,'export-copy-one',{expectedRows:5});
  DNScannerCollection.recordItem(reading,'export-copy-two',{expectedRows:5,corrected:true,newEncounter:true});
  const logBeforeExport=localStorage.getItem('dn-crafting-scanner-log-v2');
  blob=null;download=null;
  URL.createObjectURL=value=>{blob=value;return 'blob:full-item-log-fixture';};URL.revokeObjectURL=()=>{};
  HTMLAnchorElement.prototype.click=function(){download=this.download;};
  try{
    document.getElementById('scanner-collection-export').click();
    const exported=JSON.parse(await blob.text());
    check('full item export keeps the existing observation format',exported.version===2 && exported.kind==='unverified-artifact-perk-observations' && download.startsWith('artifact-perk-observations-'));
    check('full item export keeps identical physical encounters separate',exported.items.length===2 && exported.items[0].id!==exported.items[1].id);
    check('full item export includes every stat in original order',exported.items.every(item=>item.rows.length===5 && item.rows[0].value===6 && item.rows[1].value===11 && item.rows[4].value===6));
    check('full item export preserves uncertainty and correction evidence',exported.items[0].rows[2].inferred && exported.items[0].rows[3].assumed && exported.items[0].rows[4].conflict && exported.items[1].corrected);
    check('full item export contains raw reads and source metadata',exported.scans[0].observations[0].rows[1].raw==='Fighter Damage +11%' && exported.scans[0].temporal.frames===3 && exported.scans[0].ocrCalls===7 && exported.labels.length>0);
    check('full item export leaves the saved log intact',logBeforeExport===localStorage.getItem('dn-crafting-scanner-log-v2'));
    check('full item export leaves owned inventory intact',beforeItems===JSON.stringify(await DNStoredArtifacts.readBackupRecords()));
    check('full item export reports item and read counts',document.getElementById('scanner-collection-export-status').textContent.endsWith('2 items and 1 read.'));
  }finally{URL.createObjectURL=originalURL;URL.revokeObjectURL=originalRevoke;HTMLAnchorElement.prototype.click=originalClick;}
  return {passed:Object.values(checks).every(Boolean),checks,limitations:'Seeded local browser data verifies both read-only stores and the export control. It does not inspect the user’s current browser origin or establish OCR accuracy.'};
})()
