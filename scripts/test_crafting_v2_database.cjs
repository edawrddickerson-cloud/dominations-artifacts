/* Executes draft migrations in disposable PostgreSQL with real RLS roles. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(),ids=Array.from({length:6},(_,i)=>'11111111-1111-4111-8111-'+String(i+1).padStart(12,'0'));
const app={window:{}};vm.createContext(app);for(const f of ['data/artifact_stat_context','crafting-history','crafted-log-stats','crafting-community'])vm.runInContext(fs.readFileSync('ui/'+f+'.js','utf8'),app);
const S=app.window.DNCraftingCommunity;
const names=['Armored Car Damage','Armored Car Hitpoints','Attack Helicopter Damage','Attack Helicopter Hitpoints','APC Hitpoints'];
const evidence=(id,values=[11,11,6,1,1])=>({id,revision:1,writer:'device-a',deleted:false,observed_at:new Date().toISOString(),hall:'main',category:'weapon',event_id:null,exclusion:null,rows:names.map((perk,i)=>({perk,value:values[i]}))});
const payload=records=>({version:2,policy:S.POLICY,rules:S.RULES,records});
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']);await db.exec('set role '+role);}
async function call(name,args=[]){return (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;}
const denied=(fn,code='42501')=>assert.rejects(fn,error=>error.code===code);
(async()=>{
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;");
  for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
  for(const file of ['202610180001_planner_backend.sql','202610220002_ocr_feedback.sql','202610230001_crafting_statistics_v2.sql','202610230002_crafting_starting_rules.sql','202610240001_community_first_contributor.sql','202610240003_remove_game_version.sql','202610250001_crafting_distributions.sql','202610250002_crafting_perk_repeats.sql','202610250003_crafting_inferred_evidence.sql','202610250004_crafting_complete_stat_rules.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await user(null,'anon');await denied(()=>call('planner_submit_crafting',[crypto.randomUUID(),payload([])]));await denied(()=>db.query('select * from public.planner_crafting_evidence'));
  assert.equal((await call('planner_crafting_summary')).status,'insufficient-sample');
  assert.equal((await call('planner_crafting_summary')).minimumContributors,1);
  await user(ids[0]);
  const privateLog=app.window.DNCraftingHistory.project({version:2,items:[],lifetimeStatistics:{version:1,archived:{logged:363,kept:0,main:363,war:0,threeUnlocked:0},sinceLastKept:363}});
  const workspace={kind:'dominations-cloud-workspace',version:1,game:'dominations',settings:{'dn-profiles':'{"activeId":"main","profiles":[{"id":"main","name":"Main"}]}'},records:[{id:'items',items:[]},{id:'collection:main',items:[]}],craftingLog:privateLog};
  await denied(()=>call('planner_save_workspace_v2',[ids[1],0,crypto.randomUUID(),workspace]));
  const saveOperation=crypto.randomUUID();await call('planner_save_workspace_v2',[ids[0],0,saveOperation,workspace]);
  assert.equal((await call('planner_save_workspace_v2',[ids[0],0,saveOperation,workspace])).revision,1);
  assert.equal((await call('planner_read_workspace')).data.craftingLog.ledger.baseline.counts.logged,363,'private history works before any research consent');
  assert.equal((await call('planner_export_account')).crafting_evidence.length,0);
  await user(ids[1]);assert.equal(await call('planner_read_workspace'),null,'private crafting history remains account isolated');
  const records=[],receipts=[];
  for(let i=0;i<5;i++){
    await user(ids[i]);const op=crypto.randomUUID(),receipt=await call('planner_set_crafting_consent',[true,S.POLICY,op]);receipts.push(receipt);
    assert.equal((await call('planner_set_crafting_consent',[true,S.POLICY,op])).epoch,receipt.epoch,'lost consent response is idempotent');
    const item=evidence('craft-'+i,i===0?[11,11,6,1,1]:i===1?[11,6,1,1,1]:[1,1,1,1,1]);
    if(i===2)item.rows[1].perk=item.rows[0].perk;
    if(i===4){item.exclusion='incomplete';item.rows=[];}
    records.push(item);await call('planner_submit_crafting',[receipt.epoch,payload([item])]);await call('planner_submit_crafting',[receipt.epoch,payload([item])]);
    if(i===0){const first=await call('planner_crafting_summary');assert.equal(first.status,'ready');assert.equal(first.recorded,1);assert.equal(first.metrics.rows11.hits,2);assert.equal(first.metrics.rows11.total,5);assert.equal(first.metrics.two11.hits,1);assert.equal(first.metrics.two11.total,1);assert(!JSON.stringify(first).includes(ids[0]));assert(!JSON.stringify(first).includes(item.id));}
    assert.equal((await db.query('select count(*)::int n from public.planner_crafting_evidence')).rows[0].n,1,'RLS exposes only the caller, retries remain one record');
  }
  await user(ids[5]);assert.equal((await db.query('select count(*)::int n from public.planner_crafting_evidence')).rows[0].n,0);
  await denied(()=>db.query('insert into public.planner_crafting_evidence(owner_id,id,revision,writer,deleted,data) values($1,$2,1,$3,false,$4)',[ids[0],'illegal','attacker',{}]));
  await user(null,'anon');const report=await call('planner_crafting_summary'),expected=S.analyze(records);
  assert.equal(report.recorded,5);assert.equal(report.excluded,1);
  assert.equal(Object.hasOwn(report.contexts,'version'),false,'game versions are absent from reporting metadata');
  const legacy=await call('planner_crafting_report',['main','weapon',null,'obsolete-version']);
  assert.equal(legacy.recorded,report.recorded,'cached clients cannot split the sample by obsolete game-version data');
  for(const key of ['rows11','any11','two11','duplicate']){
    assert.equal(report.metrics[key].hits,expected.metrics[key].hits);assert.equal(report.metrics[key].total,expected.metrics[key].total);
    assert(Math.abs(report.metrics[key].rate-expected.metrics[key].rate)<1e-12);
    assert(Math.abs(report.metrics[key].bounds[0]-expected.metrics[key].bounds[0])<1e-12);
  }
  assert.equal((await call('planner_crafting_summary',['main','weapon','unknown'])).recorded,5);
  assert.equal((await call('planner_crafting_summary',['war'])).status,'insufficient-sample');
  assert(!JSON.stringify(report).includes('craft-'));assert(!JSON.stringify(report).includes(ids[0]));
  // Compare every expanded aggregate against the client reference, including
  // repeated positions, signed rolls, split groups and colliding account IDs.
  const extra=[];
  for(const n of [3,4,5]){
    const item=evidence('repeat-'+n,Array(5).fill(1));
    item.rows=item.rows.map((row,i)=>({...row,perk:i<n?names[0]:names[i],value:i<n?11:1}));extra.push(item);
  }
  const split=evidence('split',[11,11,11,11,11]);split.rows=split.rows.map((row,i)=>({...row,perk:i<2?names[0]:names[1]}));extra.push(split);
  const signed=evidence('signed');signed.rows[0]={perk:'Enemy Air Defense Damage',value:-11};extra.push(signed);
  const war=evidence('war',Array(5).fill(3));war.hall='war';war.rows=war.rows.map(row=>({...row,perk:'Heavy Tank Damage'}));extra.push(war);
  await user(ids[0]);await call('planner_submit_crafting',[receipts[0].epoch,payload(extra)]);
  const collision=evidence('repeat-5',Array(5).fill(6));await user(ids[1]);await call('planner_submit_crafting',[receipts[1].epoch,payload([collision])]);
  await user(null,'anon');
  const expanded=await call('planner_crafting_summary');
  const reference=S.analyze([...records,...extra, {...collision,id:'account-b:'+collision.id}]);
  for(const kind of ['eleven','six','duplicates'])for(let i=0;i<reference.distributions[kind].length;i++){
    const actual=expanded.distributions[kind][i],expected=reference.distributions[kind][i];assert.equal(actual.count,expected.count);
    for(const mode of ['exact','atLeast']){assert.equal(actual[mode].hits,expected[mode].hits);assert.equal(actual[mode].total,expected[mode].total);assert(Math.abs(actual[mode].rate-expected[mode].rate)<1e-12);}
  }
  const normalize=value=>JSON.parse(JSON.stringify(value), (key,value)=>key==='bounds'?undefined:value).sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(normalize(expanded.frequencies),normalize(reference.frequencies));
  assert.equal(expanded.distributions.eleven[3].exact.hits,1);
  assert.equal(expanded.distributions.duplicates[1].exact.hits,2,'a 2+3 split has largest group 3');
  const warReport=await call('planner_crafting_summary',['war']);assert.equal(warReport.distributions.eleven[1].atLeast.total,0);assert.equal(warReport.distributions.duplicates[3].exact.hits,1);
  const empty=await call('planner_crafting_summary',['main','pottery']);assert.equal(empty.status,'insufficient-sample');
  assert(!JSON.stringify(expanded).includes('repeat-'));assert(!JSON.stringify(expanded).includes(ids[0]));
  await user(ids[0]);const epoch=receipts[0].epoch;
  const oldProjection={...evidence('projection'),exclusion:'starting-unknown',rows:[]};await call('planner_submit_crafting',[epoch,payload([oldProjection])]);
  const projected={...evidence('projection'),projection:2};await call('planner_submit_crafting',[epoch,payload([projected])]);
  const findProjection=async()=>((await call('planner_export_account')).crafting_evidence.find(row=>row.id==='projection'));
  assert.equal((await findProjection()).exclusion,null,'new eligibility reprojects an existing canonical revision');
  await call('planner_submit_crafting',[epoch,payload([{...oldProjection,revision:99}])]);assert.equal((await findProjection()).projection,2,'stale projection cannot replace new eligibility');
  await call('planner_submit_crafting',[epoch,payload([{...projected,revision:2,exclusion:'manual',rows:[]}])]);assert.equal((await findProjection()).exclusion,'manual');
  await denied(()=>call('planner_submit_crafting',[epoch,payload([{...projected,id:'bad-projection',projection:3}])]),'22023');
  const bad={...evidence('bad'),image:'data:image/png;base64,YQ=='};await denied(()=>call('planner_submit_crafting',[epoch,payload([bad])]),'22023');
  const sign=evidence('sign');sign.rows[0].value=-11;await denied(()=>call('planner_submit_crafting',[epoch,payload([sign])]),'22023');
  const upgrade=evidence('upgrade');upgrade.rows[0].value=12;await denied(()=>call('planner_submit_crafting',[epoch,payload([upgrade])]),'22023');
  const corrected={...records[0],revision:2,rows:records[0].rows.map(r=>({...r,value:1}))};await call('planner_submit_crafting',[epoch,payload([corrected])]);
  assert.equal((await call('planner_export_account')).crafting_evidence[0].rows[0].value,1);
  await call('planner_submit_crafting',[epoch,payload([records[0]])]);assert.equal((await call('planner_export_account')).crafting_evidence[0].revision,2);
  const concurrent={...corrected,writer:'device-b',rows:corrected.rows.map(r=>({...r,value:6}))};await call('planner_submit_crafting',[epoch,payload([concurrent])]);
  assert.equal((await call('planner_export_account')).crafting_evidence[0].exclusion,'conflict');
  await call('planner_submit_crafting',[epoch,payload([{...corrected,revision:3}])]);
  const archived={...corrected,deleted:true,exclusion:'archived',rows:[]};await call('planner_submit_crafting',[epoch,payload([archived])]);
  await call('planner_submit_crafting',[epoch,payload([{...corrected,revision:999}])]);assert.equal((await call('planner_export_account')).crafting_evidence[0].deleted,true,'clear tombstones defeat stale devices');
  const opt=crypto.randomUUID();const enabled=await call('planner_set_crafting_consent',[true,S.POLICY,opt]);
  await call('planner_set_crafting_consent',[false,S.POLICY,crypto.randomUUID()]);
  await denied(()=>call('planner_submit_crafting',[enabled.epoch,payload([records[0]])]));
  const replay=await call('planner_set_crafting_consent',[true,S.POLICY,opt]);await denied(()=>call('planner_submit_crafting',[replay.epoch,payload([records[0]])]));
  assert.equal((await call('planner_export_account')).crafting_evidence.length,0);
  await user(ids[1]);await call('planner_delete_research');assert.equal((await call('planner_export_account')).crafting_evidence.length,0);
  await user(null,'service_role');await call('planner_prune_expired_data');
  const expired={...evidence('expired'),observed_at:new Date(Date.now()-731*86400000).toISOString()};
  await user(ids[2]);await call('planner_submit_crafting',[receipts[2].epoch,payload([expired])]);
  assert.equal((await call('planner_export_account')).crafting_evidence.length,1,'expired evidence never reappears as fresh');
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[ids[2]]);
  assert.equal((await db.query('select count(*)::int n from public.planner_crafting_evidence where owner_id=$1',[ids[2]])).rows[0].n,0);
  console.log('V2 SQL migrations, real RLS, independent consent, metric parity, exclusions, signed ranges, idempotency, corrections, clear/delete, withdrawal receipts, export and retention passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
