/* Rehearse and apply only the reviewed contribution projection update. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),migration='supabase/migrations/202610250003_crafting_inferred_evidence.sql';
const sql=fs.readFileSync(path.join(root,migration),'utf8'),original=fs.readFileSync(path.join(root,'supabase/migrations/202610230001_crafting_statistics_v2.sql'),'utf8');
const registryMigration='supabase/migrations/202610250004_crafting_complete_stat_rules.sql',registry=fs.readFileSync(path.join(root,registryMigration),'utf8');
const start=original.indexOf('create function public.planner_submit_crafting('),end=original.indexOf('end $$;',start)+7;
const body=text=>text.slice(text.indexOf('as $$')+5,text.lastIndexOf('$$;')).replace(/\r\n/g,'\n').trim();
const signature='public.planner_submit_crafting(uuid,jsonb)';
setLog(path.join(root,'data/temp/crafting-eligibility-deployment.log'));
try{
  const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
  if(!project || env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
  const current=query(env,"select prosrc from pg_proc where oid='"+signature+"'::regprocedure").replace(/\r\n/g,'\n').trim();
  if(current!==body(original.slice(start,end)) && current!==body(sql))throw Error('Deployed submission function differs from reviewed versions.');
  let applied=false;
  if(process.argv.includes('--apply') && (current!==body(sql) || Number(query(env,'select count(*) from public.planner_crafting_rules'))<1600)){
    fs.writeFileSync(path.join(root,'data/temp/crafting-eligibility-rollback.sql'),query(env,"select pg_get_functiondef('"+signature+"'::regprocedure)")+'\n');
    const writable={...env,PGAPPNAME:'planner-crafting-eligibility',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'};
    const checks="do $$ begin if has_function_privilege('anon','"+signature+"','execute') or not has_function_privilege('authenticated','"+signature+"','execute') or has_table_privilege('anon','public.planner_crafting_evidence','select') then raise exception 'Unexpected contribution access'; end if; end $$;";
    query(writable,'begin;\n'+sql+'\n'+registry+'\n'+checks+'\nrollback;');
    query(writable,'begin;\n'+sql+'\n'+registry+'\n'+checks+"\nnotify pgrst, 'reload schema';\ncommit;");applied=true;
  }
  if(query(env,"select prosrc from pg_proc where oid='"+signature+"'::regprocedure").replace(/\r\n/g,'\n').trim()!==body(sql))throw Error('Migration not applied; use --apply.');
  const rules=Number(query(env,'select count(*) from public.planner_crafting_rules'));if(rules<1600)throw Error('Complete stat registry is missing.');
  const report={checkedAt:new Date().toISOString(),migration,registryMigration,rules,sha256:crypto.createHash('sha256').update(sql+registry).digest('hex'),applied,passed:true,accountDataModified:false};
  fs.writeFileSync(path.join(root,'data/temp/crafting-eligibility-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
