/* Isolated PostgreSQL record protocol; never opens a hosted connection.
 * Exported fixture also lets the browser transport run against real SQL. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',D='33333333-3333-4333-8333-333333333333';
const migrations=['202610180001_planner_backend.sql','202610230001_crafting_statistics_v2.sql','202610240007_shared_artwork.sql','202610250008_workspace_save_validation.sql','202610300001_workspace_delta_save.sql','202610300002_workspace_save_memory.sql','202610300003_workspace_records.sql'];
const copy=value=>JSON.parse(JSON.stringify(value)),uuid=()=>crypto.randomUUID();
async function createFixture(){
 const db=new PGlite(),app={window:{DNArtworkIds:JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8')).entries.map(entry=>entry.id)},TextEncoder,crypto:crypto.webcrypto};vm.createContext(app);
 for(const name of ['crafting-history','integration-core','workspace-records','cloud-record-transport'])vm.runInContext(fs.readFileSync('ui/'+name+'.js','utf8'),app);
 const C=app.window.DNIntegrationCore,R=app.window.DNWorkspaceRecords,H=app.window.DNCraftingHistory;
 const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;");
 for(const id of [A,B,D])await query('insert into auth.users values($1)',[id]);
 for(const name of migrations){
  const oldOids=name==='202610300003_workspace_records.sql'?await query("select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('planner_save_workspace','planner_save_workspace_v2','planner_save_workspace_v3') order by proname"):null;
  await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  if(oldOids)assert.deepEqual(await query("select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('planner_save_workspace','planner_save_workspace_v2','planner_save_workspace_v3') order by proname"),oldOids,'legacy fences preserve prepared-function identities');
 }
 async function user(id,role='authenticated'){await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']);await db.exec('set role '+role);}
 async function rpc(name,args={}){assert(/^planner_[a-z0-9_]+$/.test(name));for(const key of Object.keys(args))assert(/^p_[a-z_]+$/.test(key));return (await query('select public.'+name+'('+Object.keys(args).map((key,i)=>key+'=> $'+(i+1)).join(',')+') result',Object.values(args)))[0].result;}
 const item=id=>({id,firstSeen:'2026-10-30T00:00:00Z',revision:1,writer:'test-device',hall:'main',rows:Array.from({length:5},()=>({name:'Aircraft Damage',known:true,value:11,hasPercent:true,level:1,levelSource:'observed',tier:3,tierSource:'colour',colour:'gold',base:11,max:20,rangeSource:'rules',assumed:false,inferred:false,conflict:false,tierConflict:false,outOfRange:false,nameSource:'ocr',valueSource:'ocr',unlocked:true,rerollEligible:true,rerollSource:'dice'}))});
 const workspace=(count=3)=>copy(C.createWorkspace({'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]})},[{id:'items',items:[]},{id:'collection:main',items:[]}],{version:2,items:Array.from({length:count},(_,i)=>item('craft-'+i))}));
 async function read(owner=A,revision=null,since=null,limit=2){const rows=[];let after=null,head;do{const page=await rpc('planner_records_page',{p_owner:owner,p_revision:revision,p_since:since,p_after:after,p_limit:limit,p_max_bytes:524288});head=page.head;rows.push(...page.records);after=page.next;if(page.complete)break;assert(after);}while(true);return {head,rows,data:since===null?copy(R.workspace(rows)):null};}
 async function stage(revision,operation,changes,index=0,count=1,owner=A){return rpc('planner_records_stage',{p_owner:owner,p_expected_revision:revision,p_operation_id:operation,p_batch_index:index,p_batch_count:count,p_changes:changes});}
 async function commit(revision,operation,owner=A){return rpc('planner_records_commit',{p_owner:owner,p_expected_revision:revision,p_operation_id:operation});}
 async function save(revision,data,base,owner=A){const operation=uuid();await stage(revision,operation,copy(R.changes(R.rows(data),base?R.rows(base):[])),0,1,owner);return commit(revision,operation,owner);}
 return {db,app,C,R,H,query,user,rpc,item,workspace,read,stage,commit,save,A,B,D,copy,uuid};
}
async function main(){
 const f=await createFixture(),{db,query,user,rpc,workspace,R,H,read,stage,commit,save}=f;
 const denied=(fn,code='22023')=>assert.rejects(fn,error=>error.code===code);
 try{
  await user(null,'anon');await denied(()=>rpc('planner_records_metadata',{p_owner:A}),'42501');
  await user(A);await denied(()=>rpc('planner_records_activate',{p_owner:B,p_expected_revision:0}),'42501');
  // Installing the migration leaves legacy clients and their complete rows usable.
  let old=workspace(),legacyOp=uuid();
  const inventory={id:'owned-in-both-containers',name:'Owned "quoted" é',type:'Weapon',hall:'main',rows:[{name:'Aircraft Damage',value:15}]};
  old.records[0].items=[copy(inventory)];old.records[1].items=[copy(inventory)];
  await rpc('planner_save_workspace_v3',{p_owner:A,p_expected_revision:0,p_operation_id:legacyOp,p_data:old,p_items_delta:null});
  let prior=copy(old);old.settings['dn-p:main:dn-artifact-score-mode']='"potential"';
  await rpc('planner_save_workspace_v3',{p_owner:A,p_expected_revision:1,p_operation_id:uuid(),p_data:old,p_items_delta:null});
  assert.equal((await rpc('planner_records_metadata',{p_owner:A})).format,3);
  assert.deepEqual((await query('select data from public.planner_workspaces'))[0].data,old);
  await denied(()=>rpc('planner_records_activate',{p_owner:A,p_expected_revision:1}),'40001');
  const activation=await rpc('planner_records_activate',{p_owner:A,p_expected_revision:2});assert.equal(activation.format,4);
  assert.deepEqual(await rpc('planner_records_activate',{p_owner:A,p_expected_revision:2}),activation);
  assert.deepEqual((await read()).data,old);assert.deepEqual((await read(A,1)).data,prior);
  async function exactBytes(expected){await db.exec('reset role');const value=(await query('select live_bytes,octet_length($2::jsonb::text) actual from public.planner_record_heads where owner_id=$1',[A,expected]))[0];assert.equal(Number(value.live_bytes),value.actual,'incremental quota matches the complete JSONB document');await user(A);}
  await exactBytes(old);
  assert.equal((await query('select count(*)::int n from public.planner_workspaces'))[0].n,0,'legacy direct SELECT cannot expose a frozen copy');
  for(const name of ['planner_save_workspace','planner_save_workspace_v2','planner_save_workspace_v3']){
   const args={p_expected_revision:2,p_operation_id:uuid(),p_data:old};if(name!=='planner_save_workspace')args.p_owner=A;if(name.endsWith('v3'))args.p_items_delta=null;
   await denied(()=>rpc(name,args),'55000');
  }
  await denied(()=>query('select * from public.planner_record_versions'),'42501');
  // Stage all batches without publishing any partial revision, then commit once.
  let next=copy(old);next.craftingLog.items[0].rows[0].value=20;next.settings['dn-p:main:dn-artifact-score-mode']='"current"';
  let changes=copy(R.changes(R.rows(next),R.rows(old))),operation=uuid();assert.equal(changes.length,2);
  await stage(2,operation,[changes[0]],0,2);await stage(2,operation,[changes[0]],0,2);
  assert.deepEqual((await read()).data,old);await denied(()=>commit(2,operation));
  await denied(()=>stage(2,operation,[changes[0]],1,2));
  await stage(2,operation,[changes[1]],1,2);let head=await commit(2,operation);assert.equal(head.revision,3);
  assert.deepEqual(await commit(2,operation),head);await stage(2,operation,[changes[0]],0,2);
  const altered=copy(changes[0]);altered.position++;await denied(()=>stage(2,operation,[altered],0,2));
  await denied(()=>stage(2,uuid(),[]),'40001');assert.deepEqual((await read()).data,next);
  const delta=await read(A,3,2);assert.equal(delta.rows.length,2,'delta contains changed keys, not the complete log');
  // A pinned page stays at its revision while another save commits.
  const first=await rpc('planner_records_page',{p_owner:A,p_revision:3,p_limit:2});
  let edited=copy(next);edited.craftingLog.items[1].rows[0].value=19;await save(3,edited,next);
  const pinned=[...first.records];let cursor=first.next;while(cursor){const page=await rpc('planner_records_page',{p_owner:A,p_revision:3,p_after:cursor,p_limit:2});assert.equal(page.head.revision,3);pinned.push(...page.records);cursor=page.next;}
  assert.deepEqual(copy(R.workspace(pinned)),next);
  // Keep/archive/order state is one operation, with an explicit tombstone.
  let archived=copy(edited),removed=archived.craftingLog.items.pop();archived.craftingLog.ledger.archived.push(copy(H.facts(removed)));archived.craftingLog.items.reverse();
  await save(4,archived,edited);assert.deepEqual((await read()).data,archived);
  assert((await read(A,5,4)).rows.some(row=>row.deleted&&row.kind==='craft'));
  // Privacy failures and missing parent/root state never publish partial data.
  const bad={kind:'craft',scope:'',key:'craft-0',position:0,data:{...archived.craftingLog.items.find(i=>i.id==='craft-0'),nested:{image:null}}};
  await denied(()=>stage(5,uuid(),[bad]));
  await denied(()=>stage(5,uuid(),[{...changes[0],image:'private'}]));
  for(const key of ['access_token','image','artworkDescriptor'])await denied(()=>stage(5,uuid(),[{kind:'setting',scope:'',key,position:0,data:'private'}]));
  await denied(()=>stage(5,uuid(),[{kind:'craft',scope:'',key:'broken',position:0,data:{id:'broken',rows:null}}]));
  operation=uuid();const duplicateOrder=copy(R.rows(archived).find(row=>row.kind==='craft'));duplicateOrder.position=1-duplicateOrder.position;
  await stage(5,operation,[duplicateOrder]);await denied(()=>commit(5,operation));assert.deepEqual((await read()).data,archived);
  operation=uuid();await stage(5,operation,[{kind:'workspace',scope:'',key:'root',position:0,data:null,deleted:true}]);await denied(()=>commit(5,operation));assert.deepEqual((await read()).data,archived);
  // Current and every retained snapshot can be exported without stale legacy data.
  const exported=await rpc('planner_export_account');assert.equal(exported.workspace,null);assert.equal(exported.workspace_records.revision,5);assert.equal(exported.workspace_record_history.length,3);
  for(const snapshot of exported.workspace_record_history)assert((await read(A,snapshot.revision)).data);
  // Nullable/nested artwork references are checked again at commit, including
  // untouched records after a catalog entry is removed.
  const approved=JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8')).entries[0].id;
  let artwork=copy(archived);artwork.artworkSchema=1;artwork.craftingLog.items[0].artworkId=approved;await save(5,artwork,archived);
  let settingsOnly=copy(artwork);settingsOnly.settings['dn-p:main:dn-artifact-score-mode']='"potential"';operation=uuid();await stage(6,operation,copy(R.changes(R.rows(settingsOnly),R.rows(artwork))));
  await db.exec('reset role');await query('delete from public.planner_artwork_catalog where id=$1',[approved]);await user(A);
  await denied(()=>commit(6,operation));assert.equal((await rpc('planner_records_metadata',{p_owner:A})).revision,6);
  await db.exec('reset role');await query('insert into public.planner_artwork_catalog values($1)',[approved]);await user(A);await commit(6,operation);
  // A single oversized legacy-compatible setting is paged alone; ordinary
  // multi-row batches still obey the bounded transfer limit.
  let large=copy(settingsOnly);large.settings['dn-p:main:dn-strategies']=JSON.stringify({text:'x'.repeat(600000)});
  await save(7,large,settingsOnly);assert.deepEqual((await read()).data,large);
  await exactBytes(large);
  const largeRow=copy(R.rows(large).find(row=>row.key==='dn-p:main:dn-strategies'));
  await denied(()=>stage(8,uuid(),[largeRow,{...largeRow,key:'dn-p:main:dn-army-presets'}]));
  await denied(()=>rpc('planner_records_page',{p_owner:A,p_revision:1}),'40001');
  // Periodic pruning preserves the anchor version of unchanged keys.
  await db.exec('reset role');await rpc('planner_prune_expired_data');await user(A);
  assert.deepEqual((await read()).data,large);for(const s of await rpc('planner_records_history',{p_owner:A}))assert((await read(A,s.revision)).data);
  // An empty activation reserves the owner, closing the old/new first-save race.
  await user(B);assert.equal(await rpc('planner_records_activate',{p_owner:B,p_expected_revision:0}),null);
  await denied(()=>rpc('planner_save_workspace_v2',{p_owner:B,p_expected_revision:0,p_operation_id:uuid(),p_data:workspace()}),'55000');
  await save(0,workspace(),null,B);assert.equal((await read(B)).head.revision,1);
  const obsolete=Array.from({length:4},()=>uuid());for(const op of obsolete)await stage(1,op,[],0,2,B);
  await db.exec('reset role');await query("update public.planner_record_operations set created_at=now()-interval '1 minute' where owner_id=$1 and operation_id=$2",[B,obsolete[0]]);await user(B);
  const fifth=uuid();await stage(1,fifth,[],0,1,B);
  await denied(()=>commit(1,obsolete[0],B));assert.equal((await rpc('planner_records_metadata',{p_owner:B})).revision,1,'lost staging cannot partially commit');
  await stage(1,obsolete[0],[],1,2,B);await denied(()=>commit(1,obsolete[0],B));
  await stage(1,obsolete[0],[],0,2,B);await commit(1,obsolete[0],B);
  await stage(1,obsolete[0],[],1,2,B);await denied(()=>commit(1,fifth,B),'40001');
  const incoming=uuid();await stage(2,incoming,[],0,2,B);
  await db.exec('reset role');assert.equal((await query('select count(*)::int n from public.planner_record_operations where owner_id=$1',[B]))[0].n,1,'a successful commit removes obsolete pending operations immediately');await user(B);
  const pressure=uuid();await stage(2,pressure,[],0,2,B);
  // Exercise the quota-pressure branch with recorded accounting, without
  // allocating 64 MiB of irrelevant fixture strings in the test runtime.
  await db.exec('reset role');await query('update public.planner_record_operations set staged_bytes=67108864 where owner_id=$1 and operation_id=$2',[B,pressure]);await user(B);
  await stage(2,incoming,[],1,2,B);
  await db.exec('reset role');assert.deepEqual((await query('select operation_id from public.planner_record_operations where owner_id=$1',[B])).map(row=>row.operation_id),[incoming],'byte pressure evicts only the other incomplete operation');
  assert.equal((await query('select operation_id from public.planner_record_receipts where owner_id=$1',[B]))[0].operation_id,obsolete[0],'staging eviction never removes the committed receipt');await user(B);
  await commit(2,incoming,B);
  await denied(()=>rpc('planner_records_page',{p_owner:A}),'42501');
  // Conversion failure is atomic: no head/fence survives and legacy remains usable.
  await user(D);const malformed=workspace(),duplicate={id:'same',name:'Duplicate',type:'Weapon',hall:'main',rows:[{name:'Aircraft Damage',value:5}]};malformed.records[0].items=[duplicate,copy(duplicate)];
  await rpc('planner_save_workspace_v3',{p_owner:D,p_expected_revision:0,p_operation_id:uuid(),p_data:malformed,p_items_delta:null});
  await denied(()=>rpc('planner_records_activate',{p_owner:D,p_expected_revision:1}),'23505');
  assert.equal((await rpc('planner_records_metadata',{p_owner:D})).format,3);assert.equal((await query('select count(*)::int n from public.planner_workspaces'))[0].n,1);
  // The legacy rollback copy survives for thirty days, then is removed without
  // removing normalized data or touching an unactivated owner's workspace.
  await db.exec('reset role');assert.equal((await query('select count(*)::int n from public.planner_workspaces where owner_id=$1',[A]))[0].n,1);
  await query("update public.planner_record_heads set activated_at=now()-interval '31 days' where owner_id=$1",[A]);
  await rpc('planner_prune_expired_data');
  assert.equal((await query('select count(*)::int n from public.planner_workspaces where owner_id=$1',[A]))[0].n,0);
  assert.equal((await query('select count(*)::int n from public.planner_workspace_save_receipts where owner_id=$1',[A]))[0].n,0);
  assert.equal((await query('select count(*)::int n from public.planner_workspaces where owner_id=$1',[D]))[0].n,1);
  await user(A);assert.deepEqual((await read()).data,large);for(const s of await rpc('planner_records_history',{p_owner:A}))assert((await read(A,s.revision)).data);
  // Audit reconstructed settings-object keys against the actual legacy whole-
  // document trigger. Encoded JSON strings retain their original semantics.
  await db.exec('reset role');await db.exec('create temp table records_privacy_probe(data jsonb);create trigger records_privacy_probe_check before insert on records_privacy_probe for each row execute function public.planner_validate_artwork_workspace();');
  const forbidden=['image','artwork','artworkMatch','artworkDescriptor','artworkFingerprint','artworkEmbedding','screenshot','screenshots','frame','frames','canvas','raw','rawType','observations','access_token','refresh_token','authorization'];
  const parityCases=[...forbidden.map(key=>[key,'private']),...['data:','DATA:image/png;base64,AAA','blob:private','BlOb:'].map(value=>['dn-p:main:dn-strategies',value]),
   ['dn-p:main:dn-strategies','ordinary text'],['dn-p:main:dn-strategies','{"image":"encoded JSON is still a string"}'],['dn-p:main:dn-strategies','prefix data:text'],['data:key-name','ordinary text'],['artworkId',approved],['artworkId','not-in-catalog']];
  for(const [key,value] of parityCases){
   const candidate=workspace();candidate.settings[key]=value;let legacyCode=null,recordCode=null;
   await db.exec('reset role');try{await query('insert into records_privacy_probe values($1)',[candidate]);}catch(error){legacyCode=error.code;}
   await user(B);const revision=(await rpc('planner_records_metadata',{p_owner:B})).revision,op=uuid();
   try{await stage(revision,op,[{kind:'setting',scope:'',key,position:0,data:value}],0,1,B);await commit(revision,op,B);}catch(error){recordCode=error.code;}
   assert.equal(recordCode,legacyCode,'legacy/record privacy parity: '+key+' '+value.slice(0,30));
   if(recordCode===null){const cleanup=uuid();await stage(revision+1,cleanup,[{kind:'setting',scope:'',key,position:0,data:null,deleted:true}],0,1,B);await commit(revision+1,cleanup,B);}
  }
  const unversioned=uuid();await db.exec('reset role');await query('insert into auth.users values($1)',[unversioned]);await user(unversioned);
  await rpc('planner_records_activate',{p_owner:unversioned,p_expected_revision:0});const noSchema=workspace();delete noSchema.artworkSchema;await save(0,noSchema,null,unversioned);
  const artSetting=uuid();await stage(1,artSetting,[{kind:'setting',scope:'',key:'artworkId',position:0,data:approved}],0,1,unversioned);await denied(()=>commit(1,artSetting,unversioned));
  // Every new table cascades on verified account deletion, including staged data.
  await db.exec('reset role');await query('delete from auth.users where id=$1',[A]);
  for(const name of ['heads','snapshots','versions','current','operations','batches','receipts','artwork_refs','groups'])assert.equal((await query('select count(*)::int n from public.planner_record_'+name+' where owner_id=$1',[A]))[0].n,0,name+' cascades');
  console.log('Record SQL passed: activation/rollback, legacy fencing, ownership, atomic batches, strict retries, CAS, pinned pages/deltas, history/retention, privacy/artwork, oversized records, export and deletion.');
 }finally{await db.close();}
}
module.exports={createFixture,migrations,A,B,D};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
