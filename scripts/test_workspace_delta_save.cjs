/* Isolated real-Postgres semantics (PGlite). Never opens a hosted connection. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const app={window:{},TextEncoder,crypto:crypto.webcrypto};vm.createContext(app);
for(const name of ['crafting-history','integration-core'])vm.runInContext(fs.readFileSync('ui/'+name+'.js','utf8'),app);
const C=app.window.DNIntegrationCore,H=app.window.DNCraftingHistory,copy=v=>JSON.parse(JSON.stringify(v)),uuid=()=>crypto.randomUUID();
const item=id=>({id,firstSeen:'2026-10-30T00:00:00Z',revision:1,writer:'test-device',hall:'main',rows:Array.from({length:5},()=>({name:'Aircraft Damage',known:true,value:11,hasPercent:true,level:1,levelSource:'observed',tier:3,tierSource:'colour',colour:'gold',base:11,max:20,rangeSource:'rules',assumed:false,inferred:false,conflict:false,tierConflict:false,outOfRange:false,nameSource:'ocr',valueSource:'ocr',unlocked:true,rerollEligible:true,rerollSource:'dice'}))});
const workspace=items=>C.createWorkspace({'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]})},[{id:'items',items:[]},{id:'collection:main',items:[]}],{version:2,items});
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function user(id,role='authenticated'){await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']);await db.exec('set role '+role);}
async function save(revision,operation,request,owner=A){return (await query('select public.planner_save_workspace_v3($1,$2,$3,$4,$5) result',[owner,revision,operation,request.p_data,request.p_items_delta]))[0].result;}
const full=data=>({p_data:data,p_items_delta:null});
const denied=(fn,code='22023')=>assert.rejects(fn,e=>e.code===code);
async function row(){return (await query('select data,revision,operation_id from public.planner_workspaces'))[0];}
async function history(){return query('select revision,data from public.planner_workspace_history order by revision');}
async function unchanged(fn,code='22023'){const before=await row(),prior=await history();await denied(fn,code);assert.deepEqual(await row(),before);assert.deepEqual(await history(),prior);}
(async()=>{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;");
  await query('insert into auth.users values($1),($2)',[A,B]);
  for(const name of ['202610180001_planner_backend.sql','202610230001_crafting_statistics_v2.sql','202610240007_shared_artwork.sql','202610250008_workspace_save_validation.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  const migration=fs.readFileSync('supabase/migrations/202610300001_workspace_delta_save.sql','utf8');
  await db.exec('begin;'+migration.replace(/^begin;\r?$/m,'').replace(/^commit;\r?$/m,'')+'rollback;');
  assert.equal((await query("select to_regclass('public.planner_workspace_save_receipts') name"))[0].name,null,'candidate DDL rolls back');
  await db.exec(migration);
  await db.exec(fs.readFileSync('supabase/migrations/202610300002_workspace_save_memory.sql','utf8'));
  const initial=copy(workspace([item('one'),item('two'),item('three')]));
  await user(null,'anon');await denied(()=>save(0,uuid(),full(initial)),'42501');
  await user(A);await denied(()=>save(0,uuid(),full(initial),B),'42501');
  let operation=uuid(),saved=await save(0,operation,full(initial));assert.equal(saved.revision,1);assert.equal(saved.data,undefined);
  assert.deepEqual((await row()).data,initial);assert.equal((await save(0,operation,full(initial))).revision,1);assert.equal((await history()).length,0);
  const changedFull=copy(initial);changedFull.craftingLog.items[0].rows[0].value=20;await unchanged(()=>save(0,operation,full(changedFull)));
  await denied(()=>query('select * from public.planner_workspace_save_receipts'),'42501');
  await denied(()=>query('insert into public.planner_workspace_save_receipts values($1,$2,$3)',[A,uuid(),Buffer.from('x')]),'42501');
  let base=initial,next=copy(base);next.craftingLog.items[1].keptId='kept-two';next.craftingLog.items[1].rows[0].value=15;
  next.craftingLog.ledger.sinceBaseline={id:'baseline',value:17,covered:['one']};
  let request=copy(C.workspaceSaveRequest(next,base));assert(request.p_items_delta);assert.equal(Object.keys(request.p_items_delta.changes).length,1);
  operation=uuid();saved=await save(1,operation,request);assert.equal(saved.revision,2);assert.deepEqual((await row()).data,next);
  assert.deepEqual((await history())[0].data,base,'complete pre-edit snapshot remains');
  assert.equal((await save(1,operation,request)).revision,2,'lost response retry is exactly once');
  const omitted=copy(request);omitted.p_items_delta.changes={};await unchanged(()=>save(1,operation,omitted));
  await unchanged(()=>save(0,operation,request));
  await unchanged(()=>save(1,uuid(),request),'40001');
  await unchanged(()=>save(2,uuid(),{p_data:next,p_items_delta:request.p_items_delta}));
  const bad=(length,changes)=>({p_data:request.p_data,p_items_delta:{length,changes}});
  for(const malformed of [bad(-1,{}),bad(1.5,{}),bad(null,{}),bad(100001,{}),bad(3,{'01':{}}),bad(3,{'3':{}}),bad(3,{'0':null}),bad(3,{'0':[]}),bad(5,{})])await unchanged(()=>save(2,uuid(),malformed));
  const forbidden=copy(request);forbidden.p_items_delta.changes['1'].rows[0].image='forbidden';await unchanged(()=>save(2,uuid(),forbidden));
  const unknownArtwork=copy(request);unknownArtwork.p_items_delta.changes['1'].artworkId='not-in-catalog';await unchanged(()=>save(2,uuid(),unknownArtwork));
  const embedded=copy(request);embedded.p_items_delta.changes['1'].name='data:private';await unchanged(()=>save(2,uuid(),embedded));
  // A failing update must also roll back its pre-update history insert.
  let revision=2;
  async function update(data){const before=await row(),req=copy(C.workspaceSaveRequest(data,before.data));const result=await save(revision,uuid(),req);revision++;assert.equal(result.revision,revision);assert.deepEqual((await row()).data,data);return req;}
  next=copy(next);next.craftingLog.items.push(copy(H.project({version:2,items:[item('four')]}).items[0]));await update(next);
  next=copy(next);next.craftingLog.items.reverse();await update(next);
  next=copy(next);const removed=next.craftingLog.items.pop();next.craftingLog.ledger.archived.push(copy(H.facts(removed)));await update(next);
  next=copy(next);next.craftingLog.items=[];await update(next);
  next=copy(next);next.craftingLog.items.push(copy(H.project({version:2,items:[item('empty-append')]}).items[0]));await update(next);
  next=copy(next);next.craftingLog.items=copy(initial.craftingLog.items);await update(next);
  const factsBefore=copy(next.craftingLog);next=copy(next);next.settings['dn-p:main:dn-artifact-score-mode']='"potential"';
  const settingsRequest=await update(next);assert.deepEqual(settingsRequest.p_items_delta.changes,{});assert.deepEqual((await row()).data.craftingLog,factsBefore);
  // Larger partial edits retain all untouched records and the same save rules.
  next=copy(next);next.craftingLog.items=copy(H.project({version:2,items:Array.from({length:20},(_,i)=>item('partial-'+i))}).items);await update(next);
  for(const count of [8,9]){
    next=copy(next);for(let i=0;i<count;i++)next.craftingLog.items[i].rows[0].value+=1;
    const partial=await update(next);assert(partial.p_items_delta);assert.equal(Object.keys(partial.p_items_delta.changes).length,count);
  }
  // A sparse edit must revalidate artwork references in untouched records too.
  const artworkId=JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8')).entries[0].id;
  next=copy(next);next.artworkSchema=1;next.craftingLog.items[0].artworkId=artworkId;await update(next);
  next=copy(next);next.craftingLog.items[1].rows[0].value+=1;
  const unrelatedEdit=copy(C.workspaceSaveRequest(next,(await row()).data));
  assert(unrelatedEdit.p_items_delta);assert.deepEqual(Object.keys(unrelatedEdit.p_items_delta.changes),['1']);
  await db.exec('reset role');await query('delete from public.planner_artwork_catalog where id=$1',[artworkId]);await user(A);
  await unchanged(()=>save(revision,uuid(),unrelatedEdit));
  await db.exec('reset role');await query('insert into public.planner_artwork_catalog values($1)',[artworkId]);await user(A);
  await update(next);
  assert.equal((await history()).length,3,'history remains bounded to three complete snapshots');
  await db.exec('reset role');await query("update public.planner_workspace_history set saved_at=now()-interval '31 days' where owner_id=$1 and revision=(select max(revision) from public.planner_workspace_history where owner_id=$1)",[A]);await user(A);
  await update(next);assert.equal((await history()).length,2,'30-day expiry also removes a revision inside the newest-three window');
  // Even a small delta cannot reconstruct a document beyond the original cap.
  const tooLarge=copy(C.workspaceSaveRequest(next,(await row()).data));tooLarge.p_items_delta.changes['0']={...next.craftingLog.items[0],extra:'x'.repeat(16*1024*1024)};
  await unchanged(()=>save(revision,uuid(),tooLarge));
  // Legacy writers/readers continue operating on exactly the same document.
  const legacy=copy(next);legacy.settings['dn-p:main:dn-artifact-score-mode']='"current"';
  const legacyResult=(await query('select public.planner_save_workspace_v2($1,$2,$3,$4) result',[A,revision,uuid(),legacy]))[0].result;revision++;
  assert.deepEqual(legacyResult.data,legacy);assert.deepEqual((await row()).data,legacy);
  // Two contenders use one base revision: only the first can commit.
  const contender=copy(legacy);contender.craftingLog.items.push(copy(H.project({version:2,items:[item('five')]}).items[0]));
  const competing=await Promise.allSettled([save(revision,uuid(),copy(C.workspaceSaveRequest(contender,legacy))),save(revision,uuid(),copy(C.workspaceSaveRequest(contender,legacy)))]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.find(r=>r.status==='rejected').reason.code,'40001');revision++;
  // A legacy writer reusing an older v3 UUID cannot make its stale receipt
  // acknowledge the newer document as though the original operation retried.
  const snapshot=(await row()).data,oldRevision=revision,receiptOperation=uuid(),receiptRequest=copy(C.workspaceSaveRequest(snapshot,snapshot));
  await save(revision,receiptOperation,receiptRequest);revision++;
  await query('select public.planner_save_workspace_v2($1,$2,$3,$4)',[A,revision,uuid(),snapshot]);revision++;
  const later=copy(snapshot);later.settings['dn-artifact-perk-ratings-global']='{"test":1}';
  await query('select public.planner_save_workspace_v2($1,$2,$3,$4)',[A,revision,receiptOperation,later]);revision++;
  await unchanged(()=>save(oldRevision,receiptOperation,receiptRequest));
  await user(B);assert.equal((await row()),undefined);await denied(()=>save(revision,uuid(),full(contender),A),'42501');
  await save(0,uuid(),full(workspace([])),B);await user(null);await denied(()=>save(0,uuid(),full(initial)),'42501');
  await db.exec('reset role');await query('delete from auth.users where id=$1',[A]);
  assert.equal((await query('select count(*)::int n from public.planner_workspace_save_receipts where owner_id=$1',[A]))[0].n,0);
  assert.equal((await query('select count(*)::int n from public.planner_workspace_history where owner_id=$1',[A]))[0].n,0);
  assert.equal((await query('select count(*)::int n from public.planner_workspaces where owner_id=$1',[B]))[0].n,1);
  // Large synthetic history: measure actual transport, not compression ratio.
  const large=copy(workspace(Array.from({length:2930},(_,i)=>item('synthetic-'+i))));const edited=copy(large);edited.craftingLog.items[1500].rows[0].value=20;
  const small=C.workspaceSaveRequest(edited,large),bytes=value=>Buffer.byteLength(JSON.stringify(value));
  assert(bytes(small)<bytes(full(edited))/100);assert.equal(Object.keys(small.p_items_delta.changes).length,1);
  assert.equal(C.workspaceSaveRequest(edited,null).p_items_delta,null,'first upload has no assumed base');
  assert.equal(C.workspaceSaveRequest({...edited,craftingLog:null},large).p_items_delta,null,'explicit absent history remains a full-document save');
  const many={craftingLog:{items:Array(100001)}};assert.equal(C.workspaceSaveRequest(many,many).p_items_delta,null,'larger histories use the unchanged full protocol');
  console.log(JSON.stringify({fullRequestBytes:bytes(full(edited)),deltaRequestBytes:bytes(small),reductionPercent:100*(1-bytes(small)/bytes(full(edited)))}));
  console.log('Delta saves: ownership/RLS, complete snapshots, strict retries, CAS, lost acknowledgements, edits, Keep, ledger, ordering, archiving, empty/legacy data, size/security validation, rollback and deletion passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
