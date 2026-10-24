const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(),A=crypto.randomUUID(),B=crypto.randomUUID();
const files=['202610180001_planner_backend.sql','202610230001_crafting_statistics_v2.sql','202610230002_crafting_starting_rules.sql','202610240001_community_first_contributor.sql','202610240002_ocr_matching_feedback.sql','202610240003_remove_game_version.sql','202610240004_ocr_weekly_reports.sql','202610240005_ocr_matching_names.sql'];
async function role(value,id=null){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+value);}
async function call(name,args=[]){return (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;}
const denied=(fn,code='42501')=>assert.rejects(fn,e=>e.code===code);
async function seed(text,target,{owner=A,kind='perk-name',resolution='user-correction',conflict=false,received,updated,observed,encounter=crypto.randomUUID()}={}){
 const id=crypto.randomUUID();const data={kind,observed_text:text,corrected_name:resolution==='user-correction'?target:null,resolved_name:target,matched_name:null,resolution,match_status:'accepted',match_method:'ocr-glyphs',scanner:'crafting',hall:'main',category:'Weapon',encounter,app_build:'PERSONAL-UNTRUSTED-BUILD',conflict};
 await db.query('insert into public.planner_ocr_feedback_samples(owner_id,id,data,observed_at,received_at,updated_at) values($1,$2,$3,$4,$5,$6)',[owner,id,data,observed||received,received,updated||received]);return id;
}
(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;");
 await db.query('insert into auth.users values($1),($2)',[A,B]);for(const f of files)await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const week=(await db.query("select (date_trunc('week',now() at time zone 'UTC')-interval '7 days')::date::text w")).rows[0].w;
 const when=(await db.query("select ($1::date::timestamp at time zone 'UTC'+interval '2 days')::text t",[week])).rows[0].t;
 await seed('Heavy Tnak Damage','Heavy Tank Damage',{received:when});await seed('Heavy Tnak Damage','Heavy Tank Damage',{owner:B,received:when});await seed('Heavy Tnak Damage','Heavy Tank Damage',{received:when});
 await seed('Tower Damage','Heavy Tank Damage',{received:when});await seed('Ambiguous typo','Heavy Tank Damage',{received:when});await seed('Ambiguous typo','Fighter Damage',{received:when});
 await seed('Unknown title','Corrected Watch',{received:when,kind:'artifact-name'});await seed('UNRECOGNISED SECRET PHRASE',null,{received:when,resolution:'unresolved'});
 await seed('Conflicting glyphs','Heavy Tank Damage',{received:when,conflict:true});
 await seed('Heavy Tank Damage','Heavy Tank Damage',{received:when,resolution:'later-ocr'});
 await seed('Heavy Tank Dantage','Fighter Damage',{received:when});
 await role('anon');await denied(()=>call('planner_read_ocr_weekly_reports'));await denied(()=>call('planner_generate_ocr_weekly_report',[week]));
 await role('authenticated',A);await denied(()=>call('planner_read_ocr_weekly_reports'));await denied(()=>call('planner_inspect_ocr_weekly_candidate',[crypto.randomUUID()]));await denied(()=>db.query('select * from research_reporting.ocr_weekly_reports'));
 await role('service_role');const rulesBefore=(await db.query('select md5(string_agg(t::text,\'\' order by t::text)) h from public.planner_crafting_rules t')).rows[0].h;
 const first=await call('planner_generate_ocr_weekly_report',[week]);assert.equal(first.created,true);assert.equal((await call('planner_generate_ocr_weekly_report',[week])).created,false,'lost response/repeated cron is idempotent');
 let report=await call('planner_read_ocr_weekly_reports',[week]);assert.equal(report.reports[0].summary.samples,11);
 const serialized=JSON.stringify(report);for(const text of [A,B,'Heavy Tnak','Unknown title','Corrected Watch','SECRET PHRASE','PERSONAL-UNTRUSTED-BUILD'])assert(!serialized.includes(text),'unreviewed raw text and identity must not enter permanent reports: '+text);
 const candidates=report.reports[0].candidates,alias=candidates.find(c=>c.screening==='review-exact-alias');assert.equal(alias.occurrences,3);assert.equal(alias.checks.repeatEvidence,true);assert.equal(alias.checks.canonicalNamesChanged,0);assert(alias.checks.canonicalNamesChecked>100);
 for(const gate of ['canonical-collision','ambiguous-target','title-review','unknown-target','conflicting-evidence','already-matched','fixture-collision'])assert(candidates.some(c=>c.screening===gate),gate);
 const review=await call('planner_inspect_ocr_weekly_candidate',[alias.id]);assert.equal(review.examples[0].observedText,'Heavy Tnak Damage');assert(!JSON.stringify(review).includes(A));assert(!JSON.stringify(review).includes(B));assert(review.examples[0].expiresAt);
 await denied(()=>call('planner_review_ocr_weekly_candidate',[alias.id,'approved','x','Heavy Tank Damage']),'22023');await denied(()=>call('planner_review_ocr_weekly_candidate',[alias.id,'approved','independent fixture review',null]),'22023');
 await call('planner_review_ocr_weekly_candidate',[alias.id,'approved','independently checked capture tests/fixtures/tank','Heavy Tank Damage']);
 report=await call('planner_read_ocr_weekly_reports',[week]);assert.equal(report.reports[0].decisions.length,1);assert.equal(report.reports[0].candidates.find(c=>c.id===alias.id).fixture.observedText,'Heavy Tnak Damage');
 assert.equal((await db.query('select md5(string_agg(t::text,\'\' order by t::text)) h from public.planner_crafting_rules t')).rows[0].h,rulesBefore,'neither reporting nor approval changes rules');
 await denied(()=>call('planner_review_ocr_weekly_candidate',[alias.id,'released','invalid release',null]),'22023');
 await call('planner_review_ocr_weekly_candidate',[alias.id,'released','commit:'+'a'.repeat(40),null]);assert.equal((await call('planner_read_ocr_weekly_reports',[week])).reports[0].candidates.find(c=>c.id===alias.id).fixture.releaseCommit,'a'.repeat(40));
 await call('planner_review_ocr_weekly_candidate',[alias.id,'needs-evidence','additional negative cases needed',null]);report=await call('planner_read_ocr_weekly_reports',[week]);assert.equal(report.reports[0].decisions.length,3,'review history remains append-only');assert.equal(report.reports[0].candidates.find(c=>c.id===alias.id).fixture,null);
 await role('authenticated',A);await call('planner_delete_ocr_feedback');await role('service_role');
 assert.equal((await call('planner_read_ocr_weekly_reports',[week])).reports[0].summary.samples,11,'deletion leaves deidentified aggregate history');assert.equal((await call('planner_inspect_ocr_weekly_candidate',[alias.id])).examples.length,1,'deleted account evidence removed; independent remaining example is available');
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[B]);await role('service_role');assert.equal((await call('planner_inspect_ocr_weekly_candidate',[alias.id])).examples.length,0,'account cascade removes all raw review links');
 assert.equal((await call('planner_read_ocr_weekly_reports',[week])).reports[0].decisions[0].fixture.expectedName,'Heavy Tank Damage','approved fixture persists without account links');
 await denied(()=>call('planner_review_ocr_weekly_candidate',[alias.id,'approved','new review without surviving raw data','Heavy Tank Damage']),'22023');
 await db.exec('reset role');await db.query('insert into auth.users values($1) on conflict do nothing',[A]);await role('service_role');
 const expired=await seed('Expired label','Heavy Tank Damage',{received:when,observed:'2020-01-01T00:00:00Z'});await db.exec('reset role');await db.query('insert into research_reporting.ocr_weekly_sources values($1,$2,$3)',[alias.id,A,expired]);await role('service_role');
 const run=await call('planner_run_ocr_weekly_reports');assert(Array.isArray(run));await call('planner_prune_expired_data');assert.equal((await db.query('select count(*)::int n from research_reporting.ocr_weekly_sources where sample_id=$1',[expired])).rows[0].n,0,'retention cascades through weekly source links');assert.equal((await db.query('select count(*)::int n from public.planner_ocr_feedback_samples where id=$1',[expired])).rows[0].n,0);
 await denied(()=>call('planner_generate_ocr_weekly_report',['2020-01-06']),'22023');
 await db.close();console.log('Weekly OCR PostgreSQL passed: private/idempotent reports, aggregate minimization, candidate screening, explicit reviewed fixtures/history, deletion/cascade, unchanged matching rules, retention and catch-up.');
})().catch(async e=>{console.error(e);process.exitCode=1;await db.close();});
