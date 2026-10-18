const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},document:{querySelector:()=>null}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/local-backup.js','utf8'),context);
const {validate,restore,settingsSnapshot}=context.window.DNLocalBackupCore;
class Storage {
  constructor(entries){this.values=new Map(entries);}
  get length(){return this.values.size;}
  key(i){return [...this.values.keys()][i];}
  getItem(k){return this.values.get(k)??null;}
  setItem(k,v){if(v==='quota-error')throw new Error('Quota exceeded');this.values.set(k,v);}
  removeItem(k){this.values.delete(k);}
}
const data={kind:'dominations-planner-backup',version:1,settings:{'dn_perk_group_defaults_v1':'{"Aircraft:damage":{"offensive":4}}','dn-crafting-scanner-log-v2':'{"items":[]}','dn-profiles':'{"profiles":[{"id":"main","name":"Main"}]}'},records:[
  {id:'items',items:[{id:'scan-a',name:'Example',hall:'main',type:'Weapon',image:'data:image/png;base64,YQ==',rows:[{name:'Damage',value:-6,base:-6,max:-15,rerollEligible:true}]}]},
  {id:'collection:main',items:[]}
]};
(async()=>{
  validate(data);
  for(const bad of [{}, {...data,version:2},{...data,settings:{unrelated:'x'}},{...data,records:[data.records[0],data.records[0]]},
    {...data,records:[{id:'items',items:[{...data.records[0].items[0],image:'https://example.com/image.png'}]}]}])assert.throws(()=>validate(bad));
  const storage=new Storage([['unrelated','keep'],['sb-auth-token','private'],['dn_cloud_runtime','private'],['dn_perk_group_defaults_v1','old-groups'],['dn-old','old']]);
  assert.equal(settingsSnapshot(storage).dn_perk_group_defaults_v1,'old-groups','group defaults are included despite their historical underscore prefix');
  assert.equal(settingsSnapshot(storage)['sb-auth-token'],undefined,'authentication is never exported');
  assert.equal(settingsSnapshot(storage).dn_cloud_runtime,undefined,'integration state is never exported');
  const store={records:[{id:'items',items:[]}],async restoreBackupRecords(records,write){write();this.records=structuredClone(records);}};
  await restore(JSON.parse(JSON.stringify(data)),storage,store);
  assert.equal(storage.getItem('unrelated'),'keep');assert.equal(storage.getItem('dn-old'),null);
  assert.equal(storage.getItem('dn-profiles'),data.settings['dn-profiles']);
  assert.equal(storage.getItem('dn_perk_group_defaults_v1'),data.settings.dn_perk_group_defaults_v1,'global group defaults survive restore');
  assert.equal(storage.getItem('sb-auth-token'),'private');
  assert.equal(storage.getItem('dn_cloud_runtime'),'private');
  assert.deepEqual(store.records,[...data.records,{id:'crafting-log',value:data.settings['dn-crafting-scanner-log-v2']}],'artwork, stats and legacy logs survive a JSON round trip');
  assert.equal(storage.getItem('dn-crafting-scanner-log-v2'),null,'legacy logs no longer consume settings quota');
  validate({...data,settings:{},records:store.records});
  assert.throws(()=>validate({...data,records:[{id:'crafting-log',value:42}]}));
  const previous={...settingsSnapshot(storage)},previousRecords=structuredClone(store.records);
  await assert.rejects(()=>restore({...data,settings:{'dn-test':'quota-error'}},storage,store),/Quota/);
  assert.deepEqual({...settingsSnapshot(storage)},previous,'partial localStorage writes are rolled back');
  assert.deepEqual(store.records,previousRecords,'failed writes preserve artifacts');
  await assert.rejects(()=>restore(data,storage,{async restoreBackupRecords(records,write){write();throw new Error('Transaction aborted');}}),/aborted/);
  assert.deepEqual({...settingsSnapshot(storage)},previous,'IndexedDB failures roll settings back');
  await assert.rejects(()=>restore({},storage,store));
  assert.deepEqual({...settingsSnapshot(storage)},previous,'invalid files leave existing data intact');
  console.log('Backup validation, JSON round trip, unrelated storage isolation, and rollback checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
