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
const data={kind:'dominations-planner-backup',version:1,settings:{'dn-crafting-scanner-log-v2':'{"items":[]}','dn-profiles':'{"profiles":[{"id":"main","name":"Main"}]}'},records:[
  {id:'items',items:[{id:'scan-a',name:'Example',hall:'main',type:'Weapon',image:'data:image/png;base64,YQ==',rows:[{name:'Damage',value:-6,base:-6,max:-15,rerollEligible:true}]}]},
  {id:'collection:main',items:[]}
]};
(async()=>{
  validate(data);
  for(const bad of [{}, {...data,version:2},{...data,settings:{unrelated:'x'}},{...data,records:[data.records[0],data.records[0]]},
    {...data,records:[{id:'items',items:[{...data.records[0].items[0],image:'https://example.com/image.png'}]}]}])assert.throws(()=>validate(bad));
  const storage=new Storage([['unrelated','keep'],['dn-old','old']]);
  const store={records:[{id:'items',items:[]}],async restoreBackupRecords(records,write){write();this.records=structuredClone(records);}};
  await restore(JSON.parse(JSON.stringify(data)),storage,store);
  assert.equal(storage.getItem('unrelated'),'keep');assert.equal(storage.getItem('dn-old'),null);
  assert.equal(storage.getItem('dn-profiles'),data.settings['dn-profiles']);
  assert.deepEqual(store.records,data.records,'artwork, signs, range and reroll metadata survive a JSON round trip');
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
