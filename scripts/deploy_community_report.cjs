/* Report-only migration. Save the original function for exact rollback;
 * do not modify account records, consent or contribution evidence. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),file='supabase/migrations/202610240001_community_first_contributor.sql';
const sql=fs.readFileSync(path.join(root,file),'utf8'),original=fs.readFileSync(path.join(root,'supabase/migrations/202610230001_crafting_statistics_v2.sql'),'utf8');
const start=original.indexOf('create function public.planner_crafting_report('),end=original.indexOf('end $$;',start)+7;
const body=text=>text.slice(text.indexOf('as $$')+5,text.lastIndexOf('$$;')).replace(/\r\n/g,'\n').trim();
setLog(path.join(root,'data/temp/community-report-deployment.log'));
try {
  const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
  if(!project || env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
  const signature='public.planner_crafting_report(text,text,text,text)';
  const current=query(env,"select prosrc from pg_proc where oid='"+signature+"'::regprocedure").replace(/\r\n/g,'\n').trim();
  if(current!==body(original.slice(start,end)) && current!==body(sql))throw Error('The deployed report differs from both reviewed versions.');
  if(process.argv.includes('--apply') && current!==body(sql)) {
    const definition=query(env,"select pg_get_functiondef('"+signature+"'::regprocedure)");
    fs.writeFileSync(path.join(root,'data/temp/community-report-rollback.sql'),definition+'\n');
    query({...env,PGAPPNAME:'planner-community-report-release',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'},'begin;\n'+sql+"\nnotify pgrst, 'reload schema';\ncommit;");
  }
  const updated=query(env,"select prosrc from pg_proc where oid='"+signature+"'::regprocedure").replace(/\r\n/g,'\n').trim();
  const checks=JSON.parse(query(env,"select json_build_object('anonymousRawDenied',not has_table_privilege('anon','public.planner_crafting_evidence','select'),'aggregateAvailable',has_function_privilege('anon','"+signature+"','execute'),'emptyReport',public.planner_crafting_report('__no_matches__'))"));
  if(updated!==body(sql) || !checks.anonymousRawDenied || !checks.aggregateAvailable || checks.emptyReport.minimumContributors!==1)throw Error('Report deployment verification failed.');
  const report={checkedAt:new Date().toISOString(),migration:file,sha256:crypto.createHash('sha256').update(sql).digest('hex'),minimumContributors:1,passed:true,accountDataModified:false,anonymousRawDenied:checks.anonymousRawDenied};
  fs.writeFileSync(path.join(root,'data/temp/community-report-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
