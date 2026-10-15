(async()=>{
  const checks={};
  const check=(name,result)=>{checks[name]=!!result;if(!result)throw new Error(name);};
  const wait=async fn=>{for(let i=0;i<400;i++){if(await fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Special artifact import timed out');};
  const get=id=>document.getElementById('storage-'+id),store=window.DNStoredArtifacts;
  await wait(()=>window.DNStorageScanner && !get('saved').textContent.startsWith('Loading'));
  window.DN.setActiveProfile(window.DN.addProfile('Special scanner test'));
  const types=['Legendary','Mythical','War Legendary','War Mythical'];
  for(const [index,type] of types.entries()) {
    const count=type.includes('Mythical')?6:5;
    const rows=Array.from({length:count},()=>({name:'Catapult Damage',known:true,value:13,hasPercent:true,level:3,levelSource:'manual',unlocked:true,base:11,max:20,rerollEligible:false,rerollSource:'manual'}));
    const artifact={name:type+' transfer test',type,hall:type.startsWith('War')?'war':'main',image:null};
    window.DNStorageScanner.update({valid:true,warnings:[],rows,artifact},true,{reviewable:true,expectedRows:count});
    await wait(()=>!get('keep').disabled);
    check(type+' does not require ordinary colour tier',get('keep-status').textContent.includes('Ready to keep'));
    get('keep').click();
    await wait(async()=>(await store.read('items')).length===index+1);
    const saved=(await store.read('items')).find(item=>item.name===artifact.name);
    check(type+' keeps every stat and its ranges',saved.rows.length===count && saved.rows.every(row=>row.value===13 && row.base===11 && row.max===20 && row.tier===null));
  }
  get('add-collection').click();
  await wait(()=>get('collection-status').textContent.startsWith('4 added'));
  const collection=await store.read(store.collectionKey());
  check('all four special categories transferred',collection.length===4 && types.every(type=>collection.some(item=>item.type===type && item.rows.length===(type.includes('Mythical')?6:5))));
  check('transferred items removed from scanner inventory',(await store.read('items')).length===0);
  return {passed:true,ui:checks};
})();
