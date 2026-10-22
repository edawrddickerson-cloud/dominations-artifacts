const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('../data/temp/backend-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(),A=crypto.randomUUID(),B=crypto.randomUUID(),POLICY='2026-10-22-ocr-text-v1';
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
async function call(name,args=[]){return (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as result',args)).rows[0].result;}
const sample=()=>({id:crypto.randomUUID(),kind:'artifact-name',position:0,observed_text:'Poman der',matched_name:null,match_score:.42,corrected_name:null,hall:'main',category:'Jewelry',app_build:'test'});
const denied=async(fn,code)=>assert.rejects(fn,error=>!code || error.code===code);
(async()=>{
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;");
 await db.query('insert into auth.users values($1),($2)',[A,B]);
 await db.exec(fs.readFileSync('supabase/migrations/202610180001_planner_backend.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610220002_ocr_feedback.sql','utf8'));
 const item=sample();await user(null,'anon');await denied(()=>call('planner_submit_ocr_feedback',[[item]]),'42501');
 await user(A);await denied(()=>call('planner_submit_ocr_feedback',[[item]]),'42501');await denied(()=>call('planner_set_ocr_feedback_consent',[true,'old-policy']),'22023');
 await call('planner_set_ocr_feedback_consent',[true,POLICY]);await call('planner_submit_ocr_feedback',[[item]]);await call('planner_submit_ocr_feedback',[[item]]);
 assert.equal((await db.query('select count(*)::int as n from public.planner_ocr_feedback_samples')).rows[0].n,1);
 await denied(()=>call('planner_submit_ocr_feedback',[[{...sample(),image:'private screenshot'}]]),'22023');
 await denied(()=>call('planner_submit_ocr_feedback',[[{...sample(),observed_text:'x'.repeat(501)}]]),'22023');
 await denied(()=>call('planner_submit_ocr_feedback',[[{...sample(),matched_name:{image:'nested'}}]]),'22023');
 await denied(()=>call('planner_submit_ocr_feedback',[[{...sample(),kind:'perk-name',position:0}]]),'22023');
 await denied(()=>db.query('insert into public.planner_ocr_feedback_samples values($1,$2,$3,now(),now())',[B,sample().id,sample()]),'42501');
 const corrected={...item,corrected_name:'Pomander Watch'};await call('planner_submit_ocr_feedback',[[corrected]]);await call('planner_submit_ocr_feedback',[[item]]);
 assert.equal((await call('planner_export_account')).ocr_feedback_samples[0].corrected_name,'Pomander Watch','an older raw sample cannot erase a correction');
 await user(B);assert.equal((await db.query('select count(*)::int as n from public.planner_ocr_feedback_samples')).rows[0].n,0);assert.equal((await call('planner_export_account')).ocr_feedback_samples.length,0);
 await user(A);await call('planner_set_ocr_feedback_consent',[false,POLICY]);await denied(()=>call('planner_submit_ocr_feedback',[[sample()]]),'42501');
 await call('planner_delete_ocr_feedback');assert.equal((await call('planner_export_account')).ocr_feedback_samples.length,0);
 await call('planner_set_ocr_feedback_consent',[true,POLICY]);await call('planner_submit_ocr_feedback',[[sample()]]);
 await user(null,'service_role');await db.exec("update public.planner_ocr_feedback_samples set updated_at=now()-interval '91 days';");await call('planner_prune_expired_data');
 assert.equal((await db.query('select count(*)::int as n from public.planner_ocr_feedback_samples')).rows[0].n,0);
 await user(A);await call('planner_submit_ocr_feedback',[[sample()]]);await db.exec('reset role');await db.query('delete from auth.users where id=$1',[A]);
 assert.equal((await db.query('select count(*)::int as n from public.planner_ocr_feedback_samples')).rows[0].n,0);
 await db.close();console.log('OCR feedback PostgreSQL passed: consent, anonymous denial, RLS, field/size validation, retry idempotency, correction precedence, export, deletion, retention and account cascade.');
})().catch(async error=>{console.error(error);process.exitCode=1;await db.close();});
