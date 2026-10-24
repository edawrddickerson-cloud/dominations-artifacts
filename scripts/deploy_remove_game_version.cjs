/* Replace only community reporting functions. Keep all existing records and
 * leave concurrent OCR export/retention changes alone. */
const fs=require('node:fs'),path=require('node:path');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),migration='supabase/migrations/202610240003_remove_game_version.sql';
const sql=fs.readFileSync(path.join(root,migration),'utf8'),prior=fs.readFileSync(path.join(root,'supabase/migrations/202610240001_community_first_contributor.sql'),'utf8');
const body=text=>text.slice(text.indexOf('as $$')+5,text.lastIndexOf('$$;')).replace(/\r\n/g,'\n').trim();
setLog(path.join(root,'data/temp/remove-game-version-deployment.log'));
try {
  const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
  if(!project || env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
  const oldSignature='public.planner_crafting_report(text,text,text,text)',newSignature='public.planner_crafting_summary(text,text,text)';
  const current=query(env,"select prosrc from pg_proc where oid='"+oldSignature+"'::regprocedure").replace(/\r\n/g,'\n').trim();
  const compatible=current.includes('select public.planner_crafting_summary(p_hall,p_category,p_event)');
  if(current!==body(prior) && !compatible)throw Error('The deployed report differs from the reviewed versions.');
  if(process.argv.includes('--apply')) {
    if(!compatible)fs.writeFileSync(path.join(root,'data/temp/remove-game-version-rollback.sql'),query(env,"select pg_get_functiondef('"+oldSignature+"'::regprocedure)")+'\n');
    query({...env,PGAPPNAME:'planner-remove-game-version',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'},'begin;\n'+sql+"\nnotify pgrst, 'reload schema';\ncommit;");
  }
  const checks=JSON.parse(query(env,"select json_build_object('anonymousRawDenied',not has_table_privilege('anon','public.planner_crafting_evidence','select'),'aggregateAvailable',has_function_privilege('anon','"+newSignature+"','execute'),'emptyReport',public.planner_crafting_summary('__no_matches__'),'legacyCompatible',public.planner_crafting_report('__no_matches__',null,null,'ignored')=public.planner_crafting_summary('__no_matches__'))"));
  if(!checks.anonymousRawDenied || !checks.aggregateAvailable || !checks.legacyCompatible || Object.hasOwn(checks.emptyReport.contexts,'version'))throw Error('Version removal verification failed.');
  const report={checkedAt:new Date().toISOString(),migration,passed:true,accountDataModified:false,gameVersionIdentification:false,legacyClientsCompatible:checks.legacyCompatible,anonymousRawDenied:checks.anonymousRawDenied};
  fs.writeFileSync(path.join(root,'data/temp/remove-game-version-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
