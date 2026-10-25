/* Executes the real migration in embedded PostgreSQL, including real RLS roles.
 * Install @electric-sql/pglite@0.5.10 under data/temp/backend-tests first.
 * Supabase Auth's verified JWT-to-role boundary is represented by auth.uid(). */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const uuid=()=>crypto.randomUUID(),db=new PGlite();
const workspace=value=>({kind:'dominations-cloud-workspace',version:1,game:'dominations',settings:{'dn-profiles':'{"activeId":"main","profiles":[{"id":"main","name":"Main"}]}'},records:[{id:'items',items:[]},{id:'collection:main',items:[]}],testValue:value});
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']);await db.exec('set role '+role);}
async function call(name,values=[]){return (await db.query('select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') as result',values)).rows[0].result;}
async function denied(fn,code='42501'){await assert.rejects(fn,error=>error.code===code);}
(async()=>{
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;");
  await db.query('insert into auth.users values($1),($2)',[A,B]);
  await db.exec(fs.readFileSync('supabase/migrations/202610180001_planner_backend.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202610250007_workspace_read_serialization.sql','utf8'));
  await user(null,'anon');await denied(()=>call('planner_read_workspace'));await denied(()=>db.query('select * from public.planner_workspaces'));
  await user(A);assert.equal(await call('planner_read_workspace'),null);
  const operation=uuid(),saved=await call('planner_save_workspace',[0,operation,workspace(1)]);assert.equal(saved.revision,1);
  const direct=await db.query('select game_key,revision,operation_id,data,updated_at from public.planner_workspaces where owner_id=$1',[A]);
  const normalized=value=>({...value,updated_at:new Date(value.updated_at).toISOString()});
  assert.deepEqual(normalized(direct.rows[0]),normalized(saved),'owner-filtered direct read preserves the workspace RPC envelope');
  assert.equal((await call('planner_save_workspace',[0,operation,workspace(1)])).revision,1,'a repeated operation is idempotent');
  await denied(()=>call('planner_save_workspace',[0,uuid(),workspace(2)]),'40001');
  await denied(()=>db.query('insert into public.planner_workspaces(owner_id,revision,operation_id,data) values($1,1,$2,$3)',[B,uuid(),workspace(2)]));
  for(let revision=1;revision<6;revision++)await call('planner_save_workspace',[revision,uuid(),workspace(revision+1)]);
  assert.equal((await db.query('select count(*)::int as n from public.planner_workspace_history')).rows[0].n,3);
  await user(B);assert.equal(await call('planner_read_workspace'),null);
  assert.equal((await db.query('select game_key,revision,operation_id,data,updated_at from public.planner_workspaces where owner_id=$1',[A])).rows.length,0,'the fast read cannot bypass RLS when its owner filter disagrees with the authenticated session');
  assert.equal((await db.query('select count(*)::int as n from public.planner_workspaces where owner_id=$1',[A])).rows[0].n,0,'RLS hides another account');
  await call('planner_save_workspace',[0,uuid(),workspace('B')]);
  assert.equal((await call('planner_export_account')).workspace.data.testValue,'B');
  console.log('Real PostgreSQL migration, anonymous denial, RLS isolation, write grants, CAS conflicts, retry idempotency and bounded history passed.');

  await user(A);
  const session={id:uuid(),policy:'2026-10-18',revision:1,game_version:null,event_context:null,expected_crafts:3,encounters:2,started_at:'2026-10-18T12:00:00Z',ended_at:null};
  const outcome=()=>({id:uuid(),session_id:session.id,revision:1,source:'crafting',new_craft:true,identity_source:'user-confirmed',disposition:'unknown',expected_rows:5,hall:'main',category:'Weapon',first_read:[],revisions:[],perks:Array.from({length:5},(_,index)=>({position:index+1,name:'Damage',current_value:6,has_percent:true,conflict:false,inferred:false,sources:{value:'direct'}}))});
  const payload={version:1,policy:'2026-10-18',sessions:[session],outcomes:[outcome(),outcome()]};
  await denied(()=>call('planner_submit_research',[payload]));
  await call('planner_set_research_consent',[true,'2026-10-18']);await call('planner_set_research_consent',[true,'2026-10-18']);
  assert.equal((await db.query('select count(*)::int as n from public.planner_consent_events')).rows[0].n,1);
  await call('planner_submit_research',[payload]);await call('planner_submit_research',[payload]);
  assert.equal((await db.query('select count(*)::int as n from public.planner_research_outcomes')).rows[0].n,2);
  await denied(()=>call('planner_submit_research',[{...payload,outcomes:[{...outcome(),source:'storage'}]}]),'22023');
  await denied(()=>call('planner_submit_research',[{...payload,outcomes:[{...outcome(),identity_source:'unconfirmed'}]}]),'22023');
  await denied(()=>call('planner_submit_research',[{...payload,outcomes:[{...outcome(),image:'private screenshot'}]}]),'22023');
  await denied(()=>call('planner_submit_research',[{...payload,outcomes:[{...outcome(),revisions:[{image:'private screenshot'}]}]}]),'22023');
  await denied(()=>call('planner_submit_research',[{...payload,outcomes:[{...outcome(),expected_rows:null}]}]),'22023');
  const duplicatePosition=outcome();duplicatePosition.perks[1].position=1;
  await denied(()=>call('planner_submit_research',[{...payload,outcomes:[duplicatePosition]}]),'22023');
  const incomplete=outcome();incomplete.perks[0].has_percent=false;incomplete.perks[0].sources.value='unknown';
  await call('planner_submit_research',[{...payload,outcomes:[incomplete]}]);
  await denied(()=>call('planner_prune_expired_data'));
  await denied(()=>db.query('select * from research_reporting.qualifying_crafts'));
  await user(A,'service_role');
  assert.equal((await db.query('select count(*)::int as n from research_reporting.qualifying_crafts')).rows[0].n,2,'incomplete numeric candidates remain stored but cannot enter complete-outcome frequencies');
  assert.equal((await db.query('select count(*)::int as n from research_reporting.perk_slots')).rows[0].n,10,'ordered duplicate perks count as separate slots');
  await user(A);
  const correction=JSON.parse(JSON.stringify(payload));correction.outcomes[0].revision=2;correction.outcomes[0].perks[0].current_value=11;
  await call('planner_submit_research',[correction]);
  assert.equal((await db.query('select count(*)::int as n from public.planner_research_outcomes')).rows[0].n,3,'corrections revise rather than add outcomes');
  await denied(()=>call('planner_submit_research',[{...correction,outcomes:[{...correction.outcomes[0],disposition:'rejected'}]}]),'40001');
  await user(B);assert.equal((await call('planner_export_account')).research_outcomes.length,0);
  const crossSession=outcome();await call('planner_set_research_consent',[true,'2026-10-18']);
  await denied(()=>call('planner_submit_research',[{version:1,policy:'2026-10-18',sessions:[],outcomes:[crossSession]}]),'23503');
  await user(A);await call('planner_set_research_consent',[false,'2026-10-18']);await denied(()=>call('planner_submit_research',[payload]));
  await call('planner_delete_research');assert.equal((await call('planner_export_account')).research_outcomes.length,0);
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[A]);
  assert.equal((await db.query('select count(*)::int as n from public.planner_workspaces where owner_id=$1',[A])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from public.planner_consent_events where owner_id=$1',[A])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from public.planner_workspaces where owner_id=$1',[B])).rows[0].n,1);
  console.log('Server consent, idempotent research, storage exclusion, separate identical crafts, corrections, restricted reporting, cross-account links, export and deletion cascade passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
