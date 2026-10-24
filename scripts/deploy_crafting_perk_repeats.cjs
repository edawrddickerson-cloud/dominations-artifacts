/* Report-only release: preserve the exact definition for rollback, check the
 * deployed predecessor, and leave account data and privileges untouched. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),migration='supabase/migrations/202610250002_crafting_perk_repeats.sql';
const sql=fs.readFileSync(path.join(root,migration),'utf8');
const prior=fs.readFileSync(path.join(root,'supabase/migrations/202610250001_crafting_distributions.sql'),'utf8');
const body=text=>text.slice(text.indexOf('as $$')+5,text.lastIndexOf('$$;')).replace(/\r\n/g,'\n').trim();
const signature='public.planner_crafting_summary(text,text,text)';
setLog(path.join(root,'data/temp/crafting-perk-repeats-deployment.log'));
try{
  const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
  if(!project || env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
  const current=query(env,"select prosrc from pg_proc where oid='"+signature+"'::regprocedure").replace(/\r\n/g,'\n').trim();
  if(current!==body(prior) && current!==body(sql))throw Error('Deployed report differs from the reviewed predecessor and migration.');
  let applied=false;
  if(process.argv.includes('--apply') && current!==body(sql)){
    fs.writeFileSync(path.join(root,'data/temp/crafting-perk-repeats-rollback.sql'),query(env,"select pg_get_functiondef('"+signature+"'::regprocedure)")+'\n');
    const writable={...env,PGAPPNAME:'planner-crafting-perk-repeats',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'};
    const checks="do $$ declare r jsonb; begin r:=public.planner_crafting_summary(); if r->>'status'='ready' and (jsonb_array_length(r->'distributions'->'six')<>6 or jsonb_array_length(r->'distributions'->'eleven')<>6 or jsonb_array_length(r->'distributions'->'duplicates')<>4 or jsonb_typeof(r->'frequencies')<>'array') then raise exception 'Expanded aggregates invalid'; end if; if has_table_privilege('anon','public.planner_crafting_evidence','select') or not has_function_privilege('anon','"+signature+"','execute') then raise exception 'Unexpected report access'; end if; end $$;";
    query(writable,'begin;\n'+sql+'\n'+checks+'\nrollback;');
    query(writable,'begin;\n'+sql+'\n'+checks+"\nnotify pgrst, 'reload schema';\ncommit;");applied=true;
  }
  const deployed=query(env,"select prosrc from pg_proc where oid='"+signature+"'::regprocedure").replace(/\r\n/g,'\n').trim();
  if(deployed!==body(sql))throw Error('Migration not applied; use --apply.');
  const checks=JSON.parse(query(env,"select json_build_object('anonymousRawDenied',not has_table_privilege('anon','public.planner_crafting_evidence','select'),'aggregateAvailable',has_function_privilege('anon','"+signature+"','execute'),'legacyCompatible',public.planner_crafting_report()=public.planner_crafting_summary(),'emptyStatus',public.planner_crafting_summary('__no_matches__')->>'status','status',public.planner_crafting_summary()->>'status')"));
  if(!checks.anonymousRawDenied || !checks.aggregateAvailable || !checks.legacyCompatible || checks.emptyStatus!=='insufficient-sample')throw Error('Report verification failed.');
  const report={checkedAt:new Date().toISOString(),migration,sha256:crypto.createHash('sha256').update(sql).digest('hex'),applied,passed:true,accountDataModified:false,checks};
  fs.writeFileSync(path.join(root,'data/temp/crafting-perk-repeats-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
