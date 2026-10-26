/* Metadata-first workspace reads; isolated accounts, no external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app={window:{},crypto:require('node:crypto').webcrypto,TextEncoder};vm.createContext(app);
for(const file of ['crafting-history','integration-core','cloud-sync'])vm.runInContext(fs.readFileSync('ui/'+file+'.js','utf8'),app);
const C=app.window.DNIntegrationCore,H=app.window.DNCraftingHistory,copy=v=>JSON.parse(JSON.stringify(v));
const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const workspace=(value=1,items)=>({kind:'dominations-cloud-workspace',version:1,game:'dominations',
  settings:{'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]}),'dn-artifact-perk-ratings-global':JSON.stringify({value})},
  records:[{id:'items',items:[]},{id:'collection:main',items:[]}],...(items?{craftingLog:copy(H.project({version:2,items}))}:{})});
const metadata=row=>row?Object.fromEntries(['game_key','revision','operation_id','updated_at'].map(k=>[k,row[k]])):null;
const cloudRow=(data,revision=1)=>({game_key:'dominations',revision,operation_id:'operation-'+revision,updated_at:'2026-10-26T12:00:'+String(revision).padStart(2,'0')+'Z',data:copy(data)});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(local=workspace(),row=cloudRow(local)) {
  const f={local:copy(local),row:copy(row),binding:null,metadataReads:0,fullReads:0,writes:0,backups:0,applied:0,receivedBytes:0};
  f.attach=()=>{f.sync=app.window.DNCloudSyncCore.create({capture:async()=>copy(f.local),readBinding:()=>f.binding,saveBinding:v=>f.binding=copy(v),
    recover:async()=>{f.backups++;await f.onBackup?.();},apply:async data=>{f.applied++;f.local=copy(data);},
    applyHistory:async log=>{f.local.craftingLog=copy(log);},
    remote:{readMetadata:async owner=>{f.metadataReads++;assert.equal(owner,f.owner);if(f.offline)throw Error('offline');const value=copy(metadata(f.row));await f.onMetadata?.();f.receivedBytes+=bytes(value);return value;},
      read:async owner=>{f.fullReads++;assert.equal(owner,f.owner);if(f.offline)throw Error('offline');await f.onRead?.();const value=copy(f.row);f.receivedBytes+=bytes(value);return value;},
      write:async(owner,revision,operation,data)=>{assert.equal(owner,f.owner);await f.onWrite?.();if((f.row?.revision || 0)!==revision)throw Object.assign(Error('changed'),{code:'40001'});
        f.writes++;f.row={...cloudRow(data,revision+1),operation_id:operation};if(f.loseResponse){f.loseResponse=false;throw Error('lost acknowledgement');}return copy(f.row);}}});
    f.owner='owner';f.sync.setOwner(f.owner);};
  f.bind=async()=>{f.binding={owner:f.owner,revision:f.row.revision,operation:f.row.operation_id,hash:await C.fingerprint(f.row.data),savedAt:f.row.updated_at};};
  f.attach();return f;
}

async function adapter() {
  let remote;const requests=[],row=cloudRow(workspace()),storage={getItem:()=>null};
  const client={from(table){const request={table};requests.push(request);return {select(columns){request.columns=columns;return this;},eq(column,value){request.filter={column,value};return this;},async maybeSingle(){return {status:200,data:Object.fromEntries(request.columns.split(',').map(k=>[k,row[k]]))};}};},
    rpc:async()=>({data:{},error:null}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:'owner'}}}})}};
  const browser={window:{DNIntegrationCore:{cloudReady:()=>true},DNServiceConfig:{supabaseUrl:'https://test.example',supabasePublishableKey:'sb_publishable_test'},DNStoredArtifacts:{},
    DNCloudSyncCore:{create(options){remote=options.remote;return {setOwner(){},state(){return {};}};}},DNConsent:{subscribe(){}},supabase:{createClient:()=>client},dispatchEvent(){},addEventListener(){}},
    document:{addEventListener(){}},location:{origin:'http://127.0.0.1:8765'},localStorage:storage,URL,CustomEvent:class{},setTimeout:()=>0,setInterval:()=>0,clearTimeout(){}};
  vm.createContext(browser);vm.runInContext(fs.readFileSync('ui/cloud.js','utf8'),browser);await browser.window.DNCloud.start();
  const small=await remote.readMetadata('owner'),full=await remote.read('owner');
  assert.equal(small.data,undefined);assert.deepEqual(copy(small),metadata(row));assert.deepEqual(copy(full),row);
  assert.equal(requests[0].columns,'game_key,revision,operation_id,updated_at');
  assert.equal(requests[1].columns,'game_key,revision,operation_id,data,updated_at');
  for(const request of requests){assert.equal(request.table,'planner_workspaces');assert.deepEqual(copy(request.filter),{column:'owner_id',value:'owner'});}
  await assert.rejects(()=>remote.readMetadata('other'),/account changed/);assert.equal(requests.length,2);
}

(async()=>{
  await adapter();
  const row={name:'Aircraft Damage',known:true,value:11,hasPercent:true,level:1,levelSource:'observed',tier:3,tierSource:'colour',colour:'gold',base:11,max:20,rangeSource:'rules',assumed:false,inferred:false,conflict:false,tierConflict:false,outOfRange:false,nameSource:'ocr',valueSource:'ocr',unlocked:true,rerollEligible:true,rerollSource:'dice'};
  const items=Array.from({length:2400},(_,i)=>({id:'record-'+i,firstSeen:'2026-10-26T10:00:00Z',name:'Artifact '+i,hall:'main',rows:Array.from({length:5},()=>({...row}))}));
  const large=fixture(workspace(1,items));await large.bind();const fullBytes=bytes(large.row);assert(fullBytes>5*1024*1024);
  await large.sync.inspect();assert.equal(large.sync.state().status,'synced');assert.equal(large.fullReads,0);assert.equal(large.metadataReads,1);
  assert.equal(large.sync.state().comparison.cloud.lifetimeCraftsLogged,2400);assert.equal(large.writes,0);
  const coldBytes=large.receivedBytes;await large.sync.inspect();assert.equal(large.fullReads,0);
  large.attach();await large.sync.inspect();assert.equal(large.fullReads,0,'verified binding also avoids the full document in a new page session');
  console.log(`Large-history fixture: ${fullBytes.toLocaleString()} byte document; unchanged load receives ${coldBytes} metadata bytes, zero full-document reads.`);

  const legacy=fixture();await legacy.bind();delete legacy.binding.operation;
  await legacy.sync.inspect();assert.equal(legacy.fullReads,1,'old bindings are verified once before metadata reuse');
  assert.equal(legacy.binding.operation,legacy.row.operation_id);await legacy.sync.inspect();assert.equal(legacy.fullReads,1);

  const dirty=fixture();await dirty.bind();dirty.local=workspace(2);await dirty.sync.inspect();
  assert.equal(dirty.fullReads,1,'an unchanged revision cannot classify local edits as synced');assert.equal(dirty.writes,1);assert.equal(dirty.row.data.settings['dn-artifact-perk-ratings-global'],JSON.stringify({value:2}));
  dirty.local=workspace(3);await dirty.sync.inspect();assert.equal(dirty.fullReads,1,'a session keeps the true remote data across local edits');assert.equal(dirty.writes,2);

  const craft=id=>({id,firstSeen:'2026-10-26T10:00:00Z',rows:[]});
  const history=fixture(workspace(1,[craft('original')]));await history.bind();history.local=workspace(1,[craft('new')]);await history.sync.inspect();
  assert.equal(history.fullReads,1);assert.equal(history.writes,1);assert.deepEqual(history.row.data.craftingLog.items.map(i=>i.id).sort(),['new','original'],'a dirty local history cannot discard bound cloud history');

  const changed=fixture();await changed.bind();await changed.sync.inspect();changed.row=cloudRow(workspace(2),2);await changed.sync.inspect();
  assert.equal(changed.fullReads,1);assert.equal(changed.sync.state().status,'remote');assert.equal(changed.applied,0);assert.equal(changed.writes,0);
  changed.local=workspace(3);await changed.sync.inspect();assert.equal(changed.fullReads,1);assert.equal(changed.sync.state().status,'conflict');
  for(const field of ['operation_id','updated_at']) {
    const altered=fixture();await altered.bind();await altered.sync.inspect();altered.row[field]+='-changed';altered.row.data=workspace(9);
    await altered.sync.inspect();assert.equal(altered.fullReads,1,field+' invalidates same-revision cache');assert.equal(altered.sync.state().status,'remote');
  }

  const advanced=fixture();await advanced.bind();advanced.local=workspace(2);
  advanced.onMetadata=()=>{advanced.onMetadata=null;advanced.row=cloudRow(workspace(3),2);};
  await advanced.sync.inspect();assert.equal(advanced.fullReads,1);assert.equal(advanced.sync.state().status,'conflict');assert.equal(advanced.writes,0,'the full response supersedes older metadata');
  const writeRace=fixture();await writeRace.bind();await writeRace.sync.inspect();writeRace.local=workspace(2);
  writeRace.onWrite=()=>{writeRace.onWrite=null;writeRace.row=cloudRow(workspace(4),2);};
  await writeRace.sync.inspect();assert.equal(writeRace.sync.state().status,'conflict');assert.equal(writeRace.writes,0);assert.equal(writeRace.row.data.settings['dn-artifact-perk-ratings-global'],JSON.stringify({value:4}));

  const lost=fixture();await lost.bind();await lost.sync.inspect();lost.local=workspace(2);lost.loseResponse=true;
  await lost.sync.inspect();assert.equal(lost.sync.state().status,'offline');assert(lost.binding.pending);
  await lost.sync.inspect();assert.equal(lost.sync.state().status,'synced');assert.equal(lost.writes,1);assert.equal(lost.fullReads,1);assert.equal(lost.binding.pending,undefined);

  const choice=fixture(workspace(1),cloudRow(workspace(2)));await choice.sync.inspect();const displayed=choice.sync.state().comparison;
  await choice.sync.choose('cloud',displayed);assert.equal(choice.fullReads,1,'choice revalidation uses fresh metadata without downloading identical content again');assert.equal(choice.metadataReads,3);assert.equal(choice.applied,1);
  const stale=fixture(workspace(1),cloudRow(workspace(2)));await stale.sync.inspect();
  stale.onBackup=()=>{stale.row=cloudRow(workspace(3),2);};await assert.rejects(()=>stale.sync.choose('cloud',stale.sync.state().comparison),/cloud version changed/);
  assert.equal(stale.applied,0);assert.equal(stale.fullReads,2);
  const replacedOperation=fixture(workspace(1),cloudRow(workspace(2)));await replacedOperation.sync.inspect();
  replacedOperation.onBackup=()=>{replacedOperation.row.operation_id='replacement-operation';replacedOperation.row.data=workspace(3);};
  await assert.rejects(()=>replacedOperation.sync.choose('cloud',replacedOperation.sync.state().comparison),/cloud version changed/);
  assert.equal(replacedOperation.applied,0,'changed operation content is rejected even if the revision is unchanged');
  const sameData=fixture(workspace(1),cloudRow(workspace(2)));await sameData.sync.inspect();
  sameData.onBackup=()=>{sameData.row=cloudRow(sameData.row.data,2);};await sameData.sync.choose('cloud',sameData.sync.state().comparison);
  assert.equal(sameData.binding.revision,2);assert.equal(sameData.binding.operation,'operation-2');assert.equal(sameData.binding.savedAt,sameData.row.updated_at);

  const absent=fixture(workspace(),null);await absent.sync.inspect();assert.equal(absent.fullReads,0);assert.equal(absent.backups,1);assert.equal(absent.writes,1);
  const removed=fixture();await removed.bind();await removed.sync.inspect();removed.row=null;await removed.sync.inspect();assert.equal(removed.sync.state().status,'conflict');assert.equal(removed.writes,0);
  const unavailable=fixture();await unavailable.bind();await unavailable.sync.inspect();unavailable.offline=true;await unavailable.sync.inspect();
  assert.equal(unavailable.sync.state().status,'offline','cached data never masks a failed metadata request');assert.equal(unavailable.fullReads,0);

  const switched=fixture();await switched.bind();const started=deferred(),finish=deferred();
  switched.onMetadata=async()=>{started.resolve();await finish.promise;};const pending=switched.sync.inspect();await started.promise;
  switched.owner='other';switched.sync.setOwner(switched.owner);finish.resolve();await pending;
  assert.equal(switched.sync.state().status,'unlinked');assert.equal(switched.fullReads,0);assert.equal(switched.writes,0);assert.equal(switched.binding.owner,'owner');
  switched.onMetadata=null;await switched.sync.inspect();assert.equal(switched.fullReads,1,'another account cannot reuse the previous owner cache or binding');assert.equal(switched.sync.state().status,'unlinked');
  const fullSwitch=fixture();fullSwitch.onRead=()=>{fullSwitch.owner='other';fullSwitch.sync.setOwner(fullSwitch.owner);};await fullSwitch.sync.inspect();
  assert.equal(fullSwitch.sync.state().status,'unlinked');assert.equal(fullSwitch.binding,null);assert.equal(fullSwitch.writes,0,'a full document arriving after an owner switch cannot create a binding');
  const choiceSwitch=fixture(workspace(1),cloudRow(workspace(2)));await choiceSwitch.sync.inspect();
  choiceSwitch.onBackup=()=>{choiceSwitch.onMetadata=()=>{choiceSwitch.owner='other';choiceSwitch.sync.setOwner(choiceSwitch.owner);};};
  await assert.rejects(()=>choiceSwitch.sync.choose('cloud',choiceSwitch.sync.state().comparison),/account changed/);assert.equal(choiceSwitch.applied,0);assert.equal(choiceSwitch.writes,0);
  const returning=fixture();await returning.bind();await returning.sync.inspect();returning.binding=null;returning.sync.setOwner('other');returning.sync.setOwner('owner');await returning.sync.inspect();
  assert.equal(returning.fullReads,1,'owner changes clear the private session cache, including returning to the original account');
  console.log('Metadata adapter projection/owner filters, verified bindings, dirty edits/history merges, changed operation/revision/time, fetch/write races, lost acknowledgements, choices, outages, missing rows and owner isolation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
