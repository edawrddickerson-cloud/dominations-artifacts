/* Workspace and sync acceptance tests; no live accounts or external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},crypto:require('node:crypto').webcrypto,TextEncoder,console};vm.createContext(context);
for(const file of ['integration-core','cloud-sync','research'])vm.runInContext(fs.readFileSync('ui/'+file+'.js','utf8'),context);
const C=context.window.DNIntegrationCore,R=context.window.DNResearchCore;
const clone=value=>JSON.parse(JSON.stringify(value));
class Storage {
  constructor(values={}){this.values=new Map(Object.entries(values));}
  get length(){return this.values.size;}key(index){return [...this.values.keys()][index];}
  getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,value);}removeItem(key){this.values.delete(key);}
}
const settings={'dn-profiles':JSON.stringify({v:1,activeId:'main',profiles:[{id:'main',name:'Main'}]}),'dn_perk_group_defaults_v1':'{"Aircraft:damage":{"offensive":4}}','dn-primary-filters:main':'{"hall":"War","offensive":false,"defensive":true}','dn-p:main:dn-strategies':'{"strategies":[{"name":"Private strategy","overrides":{"Damage":4}}]}'};
function workspace(value=6) {
  return C.createWorkspace(settings,[{id:'items',items:[]},{id:'collection:main',items:[{id:'craft-1',name:'Private item',type:'Weapon',hall:'main',image:'data:image/png;base64,YQ==',rows:[{name:'Damage',value,raw:'private OCR',level:1,rerollEligible:true,rerollEvidence:{image:'data:image/png;base64,YQ==',reason:'dice-background'}},{name:'Damage',value:-3,level:1}]}]},{id:'crafting-log',value:'private diagnostic history'}]);
}
(async()=>{
  const storage=new Storage({...settings,'sb-auth-token':'secret','dn_service_consent':'{"research":true}','dn-crafting-field-template-v1':'private geometry','dn-crafting-scanner-log-v2':'private logs','dn-last-page':'scanner.html'});
  const localConfig={localCloudTesting:true,environment:'development',cloudEnabled:false,privacyReady:false,supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
  assert.equal(C.cloudReady(localConfig,'http://127.0.0.1:8765'),true,'the operator can test real accounts locally before public rollout');
  for(const origin of ['https://planner.example','http://localhost:8765','http://127.0.0.1:8766','http://127.0.0.1:8765.attacker.example'])assert.equal(C.cloudReady(localConfig,origin),false,'local testing must not enable another origin');
  assert.equal(C.cloudReady({...localConfig,environment:'production'},'http://127.0.0.1:8765'),false);
  assert.equal(C.privacyReady(localConfig),false,'local account testing does not enable optional data collection');
  assert.equal(C.researchReady({...localConfig,privacyReady:true,privacyContact:'privacy@example.invalid'}),false,'analytics availability does not enable research');
  assert.equal(C.researchReady({...localConfig,privacyReady:true,privacyContact:'privacy@example.invalid',researchEnabled:true}),true);
  assert.equal(C.researchReady({...localConfig,researchEnabled:true}),false,'research still requires the privacy notice');
  assert.deepEqual(clone(C.settingsSnapshot(storage)),settings);
  const item=workspace().records[1].items[0];
  assert.equal(item.image,undefined);assert.equal(item.rows[0].raw,undefined);assert.equal(item.rows[0].rerollEvidence.image,undefined);
  assert.equal(item.rows[0].rerollEligible,true);assert.equal(item.rows.length,2,'ordered duplicate perks are preserved');assert.equal(item.rows[1].value,-3);
  assert.equal(workspace().records.length,2,'scanner history is not uploaded');
  const pictureOnly=C.createWorkspace(settings,[{id:'items',items:[]},{id:'collection:main',items:[]},{id:'catalog-artwork:main',images:{'arm-reliquary-of-charlemagne-mythical':'data:image/png;base64,YQ=='}}]);
  assert.equal(pictureOnly.records.length,2,'image-only catalog captures are excluded from cloud serialization');
  assert.equal(JSON.stringify(pictureOnly).includes('data:image'),false);
  assert.throws(()=>C.validate({...workspace(),version:2}));
  assert.throws(()=>C.validate({...workspace(),settings:{...settings,'sb-auth-token':'private'}}));
  assert.throws(()=>C.validate({...workspace(),records:[{id:'items',items:[]}]}));
  assert.equal(C.consent(storage).analytics,false,'invalid or old consent policies do not opt in');
  C.setConsent(storage,{analytics:true});assert.equal(C.consent(storage).analytics,true);assert.equal(C.consent(storage).research,false);
  storage.setItem('dn_service_consent','{"policy":"old","research":true}');assert.equal(C.consent(storage).research,false);
  assert.equal(await C.fingerprint(workspace()),await C.fingerprint(clone(workspace())));
  console.log('Workspace coverage, ordered perks, screenshot/auth exclusion, schema rejection and purpose-specific consent passed.');

  let local=workspace(),row=null,binding=null,offline=false,recoveries=0,applied=0,writeCount=0,recoveryFailure=false,loseResponse=false;
  const writes=[];
  const remote={async read(){if(offline)throw Error('offline');return clone(row);},async write(owner,revision,operation,data){
    if(offline)throw Error('offline');
    if((row?.revision || 0)!==revision)throw Object.assign(Error('conflict'),{code:'40001'});
    writeCount++;row={revision:revision+1,operation_id:operation,data:clone(data)};writes.push(clone(row));if(loseResponse){loseResponse=false;throw Error('response lost after commit');}return clone(row);
  }};
  const sync=context.window.DNCloudSyncCore.create({capture:async()=>clone(local),remote,readBinding:()=>binding,saveBinding:value=>binding=clone(value),recover:async()=>{if(recoveryFailure)throw Error('quota');recoveries++;},apply:async data=>{applied++;local=clone(data);}});
  sync.setOwner('user-a');await sync.inspect();assert.equal(writeCount,1,'an empty account automatically backs up browser data');assert.equal(recoveries,1);assert.equal(sync.state().status,'synced');
  offline=true;local=workspace(11);await sync.inspect();assert.equal(sync.state().status,'offline');assert.equal(local.records[1].items[0].rows[0].value,11,'local edits survive an outage');
  offline=false;await sync.inspect();assert.equal(row.data.records[1].items[0].rows[0].value,11);assert.equal(sync.state().status,'synced');
  local=workspace(10);loseResponse=true;await sync.inspect();assert.equal(sync.state().status,'offline');
  await sync.inspect();assert.equal(sync.state().status,'synced');assert.equal(writeCount,3,'a lost success response is reconciled without a second write');
  local=workspace(12);row={...row,revision:row.revision+1,data:workspace(13)};await sync.inspect();
  assert.equal(sync.state().status,'conflict');assert.equal(applied,0,'remote data is never silently applied');assert.equal(row.data.records[1].items[0].rows[0].value,13);
  recoveryFailure=true;await assert.rejects(()=>sync.choose('cloud'),/quota/);assert.equal(local.records[1].items[0].rows[0].value,12,'failed safety storage prevents replacement');
  recoveryFailure=false;await sync.choose('cloud');assert.equal(applied,1);assert.equal(local.records[1].items[0].rows[0].value,13);assert.equal(recoveries,2);
  sync.setOwner('user-b');await sync.inspect();assert.equal(sync.state().status,'unlinked','another account cannot inherit the upload binding');
  assert.equal(writeCount,3);sync.setOwner(null);await sync.inspect();assert.equal(sync.state().status,'signed-out');
  console.log('Empty-account backup, offline edits/reconnect, conflicting versions, safety-copy failure and account switching passed.');

  function linkingFixture(initialRow=null,initialBinding=null) {
    const f={local:workspace(),row:initialRow,binding:initialBinding,writes:0,copies:0};
    f.sync=context.window.DNCloudSyncCore.create({capture:async()=>clone(f.local),readBinding:()=>f.binding,saveBinding:value=>f.binding=clone(value),
      recover:async()=>{if(f.backupError)throw Error('backup unavailable');f.copies++;await f.duringBackup?.();},apply:async data=>{f.local=clone(data);},
      remote:{read:async()=>clone(f.row),write:async(_owner,revision,operation,data)=>{
        if((f.row?.revision || 0)!==revision)throw Object.assign(Error('conflict'),{code:'40001'});
        f.writes++;f.row={revision:revision+1,operation_id:operation,data:clone(data)};
        if(f.loseResponse){f.loseResponse=false;throw Error('lost response');}return clone(f.row);
      }}});
    f.sync.setOwner('new-user');return f;
  }
  const savedSettings=workspace();savedSettings.records.forEach(record=>record.items=[]);
  savedSettings.settings['dn-p:main:dn-crafting-purposes']=JSON.stringify({customPurposes:[{id:'saved-target'}]});
  const existing=linkingFixture({revision:7,data:savedSettings,updated_at:'2026-10-22T12:00:00Z'});
  await existing.sync.inspect();assert.equal(existing.writes,0,'zero artifacts does not mean an empty account');
  let comparison=existing.sync.state().comparison;
  assert.equal(comparison.cloud.lifetimeCraftsLogged,null,'account history that is not synced must not be reported as zero');
  assert.equal(C.lifetimeCraftsLogged(null),null);
  assert.equal(C.lifetimeCraftsLogged({version:2,items:[]}),0);
  const lifetimeLog={version:2,items:[{id:'one',rows:[]},{id:'one',rows:[]},{id:'two',rows:[]}],lifetimeStatistics:{version:1,archived:{logged:300,kept:10,main:200,war:100,threeUnlocked:3}}};
  assert.equal(C.lifetimeCraftsLogged(lifetimeLog),302,'comparison includes archived counts and distinct current log items');
  lifetimeLog.lifetimeStatistics.archived.logged=-1;
  assert.equal(C.lifetimeCraftsLogged(lifetimeLog),2,'invalid archived counts cannot corrupt comparison totals');
  assert.equal(comparison.cloud.artifacts,0);assert.equal(comparison.cloud.targets,1);assert.equal(comparison.local.artifacts,1);assert.equal(comparison.cloud.profiles,1);
  assert.equal(comparison.cloud.updatedAt,'2026-10-22T12:00:00Z');assert.equal(comparison.local.updatedAt,null,'unknown dates are not invented');
  existing.row={revision:8,data:workspace(22)};
  await assert.rejects(()=>existing.sync.choose('local',comparison),/changed/);assert.equal(existing.writes,0,'a stale dialog cannot overwrite a newer account version');
  comparison=existing.sync.state().comparison;existing.local=workspace(33);
  await assert.rejects(()=>existing.sync.choose('cloud',comparison),/changed/);assert.equal(existing.local.records[1].items[0].rows[0].value,33,'a stale dialog cannot overwrite newer local edits');

  const backupFailure=linkingFixture();backupFailure.backupError=true;await backupFailure.sync.inspect();
  assert.equal(backupFailure.writes,0);assert.equal(backupFailure.binding,null);assert.equal(backupFailure.sync.state().status,'offline');
  backupFailure.backupError=false;await backupFailure.sync.inspect();assert.equal(backupFailure.writes,1,'failed initial backup can retry');
  const lostFirst=linkingFixture();lostFirst.loseResponse=true;await lostFirst.sync.inspect();await lostFirst.sync.inspect();
  assert.equal(lostFirst.writes,1,'lost first-upload acknowledgement cannot duplicate a write');assert.equal(lostFirst.sync.state().status,'synced');
  const competing=linkingFixture();competing.duringBackup=()=>{competing.row={revision:1,data:workspace(44)};};
  await competing.sync.inspect();assert.equal(competing.writes,0);assert.equal(competing.sync.state().status,'conflict');
  assert.equal(competing.row.data.records[1].items[0].rows[0].value,44,'another device creating the workspace wins safely');
  const changing=linkingFixture();changing.duringBackup=()=>{changing.local=workspace(55);};
  await changing.sync.inspect();assert.equal(changing.writes,0);assert.equal(changing.sync.state().status,'pending');
  changing.duringBackup=null;await changing.sync.inspect();assert.equal(changing.row.data.records[1].items[0].rows[0].value,55);
  const switching=linkingFixture();switching.duringBackup=()=>switching.sync.setOwner('other-user');await switching.sync.inspect();
  assert.equal(switching.writes,0);assert.equal(switching.binding,null,'account changes during backup cannot grant an upload binding');
  const shared=linkingFixture(null,{owner:'previous-user',hash:'previous-hash'});await shared.sync.inspect();
  assert.equal(shared.writes,0);assert.equal(shared.sync.state().status,'unlinked','a shared browser never auto-uploads another account’s data');
  console.log('Linking summaries, existing settings, stale choices, first-backup failures, lost responses, device races and account switches passed.');

  console.log('Automatic v2 contribution checks: node scripts/test_crafting_v2.cjs');
})().catch(error=>{console.error(error);process.exitCode=1;});
