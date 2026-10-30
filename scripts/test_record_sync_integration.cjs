/* Browser sync engine + record codec/transport against actual isolated PostgreSQL.
 * No SDK fixture, hosted account, network request or production mutation. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createFixture,A,B,D}=require('./test_workspace_records_database.cjs');
const copy=value=>JSON.parse(JSON.stringify(value)),uuid=()=>crypto.randomUUID();
async function main(){
 const f=await createFixture(),{db,app,C,H,R}=f;
 vm.runInContext(fs.readFileSync('ui/cloud-sync.js','utf8'),app);
 let queue=Promise.resolve();
 function serialize(run){const result=queue.catch(()=>{}).then(run);queue=result.catch(()=>{});return result;}
 const sql=(owner,name,args={},role='authenticated')=>serialize(async()=>{await f.user(owner,role);return f.rpc(name,args);});
 const admin=(text,args=[])=>serialize(async()=>{await db.exec('reset role');return f.query(text,args);});
 const heads=new Map(),remember=async(head,data)=>{heads.set(head.revision,await C.fingerprint(data));return head;};
 const addCraft=(data,id,at)=>{const item=f.item(id);item.firstSeen=at;data.craftingLog.items.push(copy(H.project({version:2,items:[item]}).items[0]));};
 async function binding(owner,head,data){return {owner,revision:head.revision,operation:head.operation_id,hash:await C.fingerprint(data),savedAt:head.updated_at};}
 function device(owner,local,options={}){
  const d={owner,generation:0,local:copy(local),binding:copy(options.binding || null),state:options.state || new Map(),calls:[],recoveries:[],applied:0,historyApplied:0};
  d.store={async get(key){const value=copy(d.state.get(key) || null);await d.afterGet?.(key);return value;},
   async put(key,value){await d.beforePut?.(key,value);d.state.set(key,copy(value));await d.afterPut?.(key);},
   async remove(key){await d.beforeRemove?.(key);d.state.delete(key);}};
  d.rpc=async(name,args)=>{const authenticatedOwner=d.owner,request={name,args:copy(args),owner:authenticatedOwner};d.calls.push(request);await d.beforeRpc?.(request);
   const value=await sql(authenticatedOwner,name,args);await d.afterRpc?.(request,value);return copy(value);};
  d.attach=()=>{
   d.remote=app.window.DNCloudRecordTransport.create({rpc:d.rpc,store:d.store,user:()=>d.owner,generation:()=>d.generation});
   d.sync=app.window.DNCloudSyncCore.create({capture:async()=>copy(d.local),remote:d.remote,readBinding:()=>d.binding,saveBinding:value=>{d.binding=copy(value);},
    recover:async value=>{d.recoveries.push({owner:value.owner,revision:value.remote?.revision || null});await d.onRecovery?.();},
    apply:async(data,options)=>{assert.equal(options.owner,d.owner);assert(options.isCurrent());d.local=copy(data);d.applied++;},
    applyHistory:async log=>{d.local.craftingLog=copy(log);d.historyApplied++;},readLocalCraftsLogged:async()=>H.totals(d.local.craftingLog).logged});
   d.sync.setOwner(d.owner);return d;
  };
  d.switchOwner=next=>{d.owner=next;d.generation++;d.remote.clearMemory();d.sync.setOwner(next);};
  d.resetCalls=()=>{d.calls=[];};d.stages=()=>d.calls.filter(call=>call.name==='planner_records_stage');
  return d.attach();
 }
 try{
  for(const value of [[],{},'plain',{'quoted\\key': '\u{1f512} \"line\nline',nested:[[],{value:'?: \\ \"'}]},[1e308,1e-308,-1.23e-7,1e21,1e-6,0,42.5],{dense:Array(87200).fill(0)}]){
   const actual=(await admin('select octet_length($1::jsonb::text)::int bytes',[JSON.stringify(value)]))[0].bytes;
   assert.equal(R.jsonbBytes(value),actual,'record byte estimator matches actual PostgreSQL JSONB output');
  }
  // Convert an actual large legacy workspace and its complete prior revision.
  const initial=f.workspace(3000);
  initial.craftingLog.items.forEach((item,i)=>{item.id='craft-'+String(i).padStart(5,'0');item.keepId='craft-log-'+item.id;item.firstSeen=new Date(Date.parse('2026-10-30T00:00:00Z')+i*1000).toISOString();});
  initial.settings['dn-artifact-perk-ratings-global']='{"value":1}';
  const first=await sql(A,'planner_save_workspace_v3',{p_owner:A,p_expected_revision:0,p_operation_id:uuid(),p_data:initial,p_items_delta:null});await remember(first,initial);
  const legacy=copy(initial);legacy.settings['dn-artifact-perk-ratings-global']='{"value":2}';
  const second=await sql(A,'planner_save_workspace_v3',{p_owner:A,p_expected_revision:1,p_operation_id:uuid(),p_data:legacy,p_items_delta:null});await remember(second,legacy);
  const primary=device(A,legacy);await primary.sync.inspect();
  assert.equal(primary.sync.state().status,'unlinked');assert(primary.calls.some(call=>call.name==='planner_records_activate'));
  const bootstrapPages=primary.calls.filter(call=>call.name==='planner_records_page');assert(bootstrapPages.length>20);assert(bootstrapPages.every(call=>call.args.p_revision===2));
  assert.equal(primary.sync.state().comparison.cloud.lifetimeCraftsLogged,3000);assert.equal(primary.stages().length,0);
  await primary.sync.choose('cloud',primary.sync.state().comparison);assert.equal(primary.applied,1);assert.deepEqual(primary.local,legacy);assert.equal(primary.recoveries.length,1);
  const retainedInitial=(await sql(A,'planner_records_history',{p_owner:A})).find(row=>row.revision===1);
  const recoveredInitial=await primary.remote.readRevision(A,retainedInitial);assert.deepEqual(copy(recoveredInitial.data),initial);
  assert.equal((await sql(A,'planner_records_metadata',{p_owner:A})).revision,2,'choosing unchanged cloud data does not save a new version');
  // One new chronological craft creates exactly one server version, not 3001.
  primary.resetCalls();addCraft(primary.local,'new-primary','2026-10-30T01:00:00Z');await primary.sync.inspect();assert.equal(primary.sync.state().status,'synced');
  assert.equal(primary.stages().length,1);assert.equal(primary.stages()[0].args.p_changes.length,1);assert.equal(primary.stages()[0].args.p_changes[0].kind,'craft');
  const sparseBytes=Buffer.byteLength(JSON.stringify(primary.stages()[0].args.p_changes));assert(sparseBytes<4096);
  let current=copy(primary.local),head=await sql(A,'planner_records_metadata',{p_owner:A});await remember(head,current);assert.equal(head.revision,3);
  assert.equal((await admin('select count(*)::int n from public.planner_record_versions where owner_id=$1 and revision=$2',[A,head.revision]))[0].n,1);
  console.log('Real SQL: 3,000-craft conversion and single-row append passed.');
  // Every page of a cold full read stays pinned when a writer advances mid-read.
  const pinned=device(A,f.workspace(0)),beforePinned=copy(current),pinnedHead=copy(head);let advanced=false;
  pinned.afterRpc=async request=>{if(!advanced && request.name==='planner_records_page'){advanced=true;const next=copy(current);next.settings['dn-p:main:dn-artifact-score-mode']='"potential"';head=await primary.remote.write(A,head.revision,uuid(),next,current);current=next;await remember(head,current);}};
  const pinnedRow=await pinned.remote.read(A);assert.equal(pinnedRow.revision,pinnedHead.revision);assert.deepEqual(copy(pinnedRow.data),beforePinned);
  assert(pinned.calls.filter(call=>call.name==='planner_records_page').every(call=>call.args.p_revision===pinnedHead.revision));pinned.afterRpc=null;
  // A multi-page delta stays pinned too; it neither includes a later commit nor
  // downloads unchanged craft rows as if this were another complete snapshot.
  const wide=copy(current);for(let i=0;i<160;i++){wide.craftingLog.items[i].revision++;wide.craftingLog.items[i].rows[0].value=20;}
  head=await primary.remote.write(A,head.revision,uuid(),wide,current);current=wide;await remember(head,current);
  const deltaExpected=copy(current),deltaHead=copy(head);advanced=false;pinned.resetCalls();
  pinned.afterRpc=async request=>{if(!advanced && request.name==='planner_records_page' && request.args.p_since!==null){advanced=true;const next=copy(current);next.settings['dn-p:main:dn-artifact-score-mode']='"current"';head=await primary.remote.write(A,head.revision,uuid(),next,current);current=next;await remember(head,current);}};
  const deltaRow=await pinned.remote.read(A),deltaPages=pinned.calls.filter(call=>call.name==='planner_records_page');
  assert.equal(deltaRow.revision,deltaHead.revision);assert.deepEqual(copy(deltaRow.data),deltaExpected);assert(deltaPages.length>=2);assert(deltaPages.every(call=>call.args.p_since===pinnedHead.revision && call.args.p_revision===deltaHead.revision));pinned.afterRpc=null;
  // Two real engines reconcile distinct local encounters without resending the
  // owned baseline. A pure pull applies history without an empty commit.
  const a=device(A,current,{binding:await binding(A,head,current)}),b=device(A,current,{binding:await binding(A,head,current)});
  await a.sync.inspect();await b.sync.inspect();addCraft(a.local,'device-a-new','2026-10-30T02:00:00Z');addCraft(b.local,'device-b-new','2026-10-30T03:00:00Z');
  a.resetCalls();await a.sync.inspect();assert.equal(a.sync.state().status,'synced');assert.equal(a.stages().flatMap(call=>call.args.p_changes).length,1);
  head=await sql(A,'planner_records_metadata',{p_owner:A});current=copy(a.local);await remember(head,current);
  b.resetCalls();await b.sync.inspect();assert.equal(b.sync.state().status,'synced');assert.equal(b.historyApplied,1);assert.equal(b.stages().flatMap(call=>call.args.p_changes).length,1);assert.equal(b.local.craftingLog.items.length,3003);
  head=await sql(A,'planner_records_metadata',{p_owner:A});current=copy(b.local);await remember(head,current);
  a.resetCalls();await a.sync.inspect();assert.equal(a.sync.state().status,'synced');assert.deepEqual(a.local,current);assert.equal(a.stages().length,0,'history-only pull must not stage an empty write');
  assert.equal((await sql(A,'planner_records_metadata',{p_owner:A})).revision,head.revision);
  console.log('Real SQL: pinned full/delta reads and cross-device merge/pull passed.');
  // The first upload to an empty account retains safety-copy ordering. A lost
  // committed response is repaired on reload without a duplicate revision or
  // indefinitely retained operation payload.
  const firstUpload=device(B,f.workspace(30));let lose=true;
  firstUpload.afterRpc=request=>{if(lose && request.name==='planner_records_commit'){lose=false;throw Error('Lost committed response');}};
  await firstUpload.sync.inspect();assert.equal(firstUpload.sync.state().status,'offline');assert.equal(firstUpload.recoveries.length,1);assert(firstUpload.binding.pending);
  const lostOperation=firstUpload.binding.pending.operation,lostKey='cloud-record-pending:'+B+':'+lostOperation;assert(firstUpload.state.has(lostKey));
  assert.equal((await sql(B,'planner_records_metadata',{p_owner:B})).revision,1);firstUpload.afterRpc=null;firstUpload.attach();firstUpload.resetCalls();await firstUpload.sync.inspect();
  assert.equal(firstUpload.sync.state().status,'synced');assert.equal(firstUpload.binding.pending,undefined);assert(!firstUpload.state.has(lostKey),'verified reload repair removes only its accepted pending operation');
  assert(!firstUpload.calls.some(call=>call.name==='planner_records_commit'));assert.equal((await sql(B,'planner_records_metadata',{p_owner:B})).revision,1);
  // Linking another account requires an explicit choice and never imports the
  // prior account's local history just because the new cloud has few items.
  const other=f.workspace(3);await sql(D,'planner_save_workspace_v3',{p_owner:D,p_expected_revision:0,p_operation_id:uuid(),p_data:other,p_items_delta:null});
  const linked=device(D,f.workspace(4),{binding:{owner:B,hash:'another-account'}});await linked.sync.inspect();assert.equal(linked.sync.state().status,'unlinked');assert.equal(linked.stages().length,0);
  await linked.sync.choose('cloud',linked.sync.state().comparison);assert.deepEqual(linked.local,other);assert.equal(linked.applied,1);assert.equal(linked.recoveries.length,1);
  // Stale CAS attempts cannot publish a second staged workspace or fall back to
  // the fenced giant-document writers.
  const winner=device(A,current),loser=device(A,current),losingBase=copy(current),staleRevision=head.revision;
  const winnerData=copy(current);winnerData.settings['dn-p:main:dn-artifact-score-mode']='"potential"';head=await winner.remote.write(A,head.revision,uuid(),winnerData,current);current=winnerData;await remember(head,current);
  const loserData=copy(losingBase);loserData.settings['dn-p:main:dn-artifact-score-mode']='"off"';await assert.rejects(()=>loser.remote.write(A,staleRevision,uuid(),loserData,losingBase),error=>error.code==='40001');assert.equal((await sql(A,'planner_records_metadata',{p_owner:A})).revision,head.revision);
  for(const name of ['planner_save_workspace','planner_save_workspace_v2','planner_save_workspace_v3']){
   const args={p_expected_revision:head.revision,p_operation_id:uuid(),p_data:current};if(name!=='planner_save_workspace')args.p_owner=A;if(name.endsWith('v3'))args.p_items_delta=null;
   await assert.rejects(()=>sql(A,name,args),error=>error.code==='55000');
  }
  assert.equal((await serialize(async()=>{await f.user(A);return f.query('select data from public.planner_workspaces');})).length,0);
  await assert.rejects(()=>sql(B,'planner_records_metadata',{p_owner:A}),error=>error.code==='42501');await assert.rejects(()=>sql(null,'planner_records_metadata',{p_owner:A},'anon'),error=>error.code==='42501');
  // Same-owner tabs share storage, but operation-specific pending keys preserve
  // each uncertain staged request while another operation succeeds.
  const shared=new Map(),tabA=device(A,current,{state:shared}),tabB=device(A,current,{state:shared}),base=copy(current),revision=head.revision,opA=uuid(),opB=uuid();
  const editA=copy(base);editA.settings['dn-p:main:dn-artifact-score-mode']='"current"';const editB=copy(base);editB.settings['dn-p:main:dn-artifact-score-mode']='"off"';
  for(const tab of [tabA,tabB])tab.afterRpc=request=>{if(request.name==='planner_records_stage')throw Error('Uncertain staged response');};
  await assert.rejects(()=>tabA.remote.write(A,revision,opA,editA,base),/Uncertain/);await assert.rejects(()=>tabB.remote.write(A,revision,opB,editB,base),/Uncertain/);
  const keyA='cloud-record-pending:'+A+':'+opA,keyB='cloud-record-pending:'+A+':'+opB;assert(shared.has(keyA)&&shared.has(keyB));
  tabA.afterRpc=null;head=await tabA.remote.write(A,revision,opA,editA,base);current=editA;await remember(head,current);assert(!shared.has(keyA));assert(shared.has(keyB),'successful operation cannot erase the other tab pending request');
  tabB.afterRpc=null;await assert.rejects(()=>tabB.remote.write(A,revision,opB,editB,base),error=>error.code==='40001');await tabB.remote.read(A);assert(shared.has(keyB),'reading another committed operation cannot erase an uncertain pending request');
  // Account changes after SQL pages/stages are accepted cannot install another
  // account's result, advance a binding, or publish an additional stage.
  const race=device(A,current);race.afterRpc=request=>{if(request.name==='planner_records_page'){race.afterRpc=null;race.switchOwner(B);}};
  await race.sync.inspect();assert.equal(race.sync.state().status,'unlinked');assert.equal(race.binding,null);assert(!race.state.has('cloud-record-cache:'+A));assert(!race.state.has('cloud-record-cache:'+B));
  const stageRace=device(A,current),stageData=copy(current);stageData.settings['dn-p:main:dn-artifact-score-mode']='"potential"';stageRace.afterRpc=request=>{if(request.name==='planner_records_stage'){stageRace.afterRpc=null;stageRace.switchOwner(B);}};
  await assert.rejects(()=>stageRace.remote.write(A,head.revision,uuid(),stageData,current),error=>error.code==='42501');assert.equal((await sql(A,'planner_records_metadata',{p_owner:A})).revision,head.revision);assert.equal((await sql(B,'planner_records_metadata',{p_owner:B})).revision,1);
  console.log('Real SQL: reply-loss, explicit linking, CAS, fences and account/tab races passed.');
  // Account export heads plus bounded pages reconstruct the exact current and
  // three retained prior workspaces, without exposing a stale legacy document.
  const exported=await sql(A,'planner_export_account');assert.equal(exported.workspace,null);assert.equal(exported.workspace_records.revision,head.revision);assert.equal(exported.workspace_record_history.length,3);
  const exporting=device(A,current),materialized=await exporting.remote.readRevision(A,exported.workspace_records);assert.deepEqual(copy(materialized.data),current);
  for(const prior of exported.workspace_record_history){const row=await exporting.remote.readRevision(A,prior);assert.equal(await C.fingerprint(row.data),heads.get(prior.revision));}
  console.log(JSON.stringify({craftsBootstrapped:3000,bootstrapBytes:Buffer.byteLength(JSON.stringify(legacy)),bootstrapPages:bootstrapPages.length,sparseRowsWritten:1,sparseBytes,fullPinnedRevision:pinnedHead.revision,deltaPinnedRevision:deltaHead.revision,deltaPages:deltaPages.length,currentRevision:head.revision,exportPriorVersions:exported.workspace_record_history.length}));
  console.log('Real SQL record integration passed: 3,000-craft conversion, sparse append, pinned full/delta pages, first upload, explicit account linking, lost-response reload repair, cross-device merge/pull, CAS/fences, same-owner pending isolation, account races and complete retained export.');
 }finally{await queue.catch(()=>{});await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
