/* Compatible OCR release: inspect actual wrappers, verified backup, transactional apply. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp'),file='202610240002_ocr_matching_feedback.sql';
const sql=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
setLog(path.join(scratch,'ocr-database-deployment.log'));
try{
 const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
 if(env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
 const functions=JSON.parse(query(env,"select json_object_agg(proname,pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and (proname like 'planner_export%' or proname like 'planner_prune%' or proname='planner_crafting_report')"));
 const present=query(env,"select to_regclass('public.planner_ocr_feedback_samples') is not null")==='t';
 fs.writeFileSync(path.join(scratch,'ocr-deployed-functions.json'),JSON.stringify(functions,null,2));
 if(!present){
  const v2=fs.readFileSync(path.join(root,'supabase/migrations/202610230001_crafting_statistics_v2.sql'),'utf8');
  for(const name of ['planner_export_account','planner_prune_expired_data']){
   const start=v2.indexOf('create function public.'+name+'()'),end=v2.indexOf('$$;',start)+3;
   const expected=v2.slice(start,end).split('as $$')[1]?.split('$$;')[0].replace(/\s+/g,' ').trim();
   const actual=query(env,"select prosrc from pg_proc where oid='public."+name+"()'::regprocedure").replace(/\s+/g,' ').trim();
   if(!expected || actual!==expected)throw Error('Unreviewed deployed function: '+name);
  }
 }
 const tables=JSON.parse(query(env,"select json_agg(tablename order by tablename) from pg_tables where schemaname in ('public','auth','research_reporting')"));
 function fingerprint(){return query(env,"select md5(coalesce(string_agg(row::text,'' order by row::text),'')) from ("+tables.filter(t=>t.startsWith('planner_')).map(t=>"select md5(to_jsonb(t)::text) row from public.\""+t+"\" t").join(' union all ')+") q");}
 const report={checkedAt:new Date().toISOString(),migrationHash:hash(sql),wasPresent:present,reviewedFunctions:Object.keys(functions)};
 if(process.argv.includes('--apply')){
  if(present)throw Error('OCR tables already exist; review rather than reapply.');
  const backup=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);if(!backup)throw Error('Verified backup manifest required.');
  const manifestPath=fs.realpathSync(path.resolve(root,backup));if(!manifestPath.startsWith(path.join(scratch,'database-backups')+path.sep))throw Error('Unexpected backup path.');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!manifest.restoreVerified || !manifest.ocrRehearsal?.passed || manifest.ocrRehearsal.migrationHash!==hash(sql) || Date.now()-Date.parse(manifest.createdAt)>3600000 || hash(fs.readFileSync(path.join(path.dirname(manifestPath),manifest.archive)))!==manifest.sha256)throw Error('Recent verified backup and matching OCR rehearsal required.');
  fs.writeFileSync(path.join(scratch,'ocr-feedback-rollback.sql'),`begin;\n${functions.planner_export_account};\n${functions.planner_prune_expired_data};\nnotify pgrst, 'reload schema';\ncommit;\n`);
  const before=fingerprint();query({...env,PGAPPNAME:'planner-ocr-release',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'},sql+"\nnotify pgrst, 'reload schema';");
  report.existingRowsUnchanged=before===fingerprint();if(!report.existingRowsUnchanged)throw Error('Existing data changed; inspect concurrent activity.');report.applied=true;report.backup=path.relative(root,manifestPath);
 }
 if(present || report.applied){
  report.verification=JSON.parse(query(env,"select json_build_object('anonymousDenied',not has_table_privilege('anon','public.planner_ocr_feedback_samples','select'),'directWriteDenied',not has_table_privilege('authenticated','public.planner_ocr_feedback_samples','insert'),'rpcAvailable',has_function_privilege('authenticated','public.planner_submit_ocr_feedback(uuid,jsonb)','execute'),'rowSecurity',(select relrowsecurity from pg_class where oid='public.planner_ocr_feedback_samples'::regclass),'retentionIntegrated',(select prosrc like '%planner_prune_before_ocr_v2%' from pg_proc where oid='public.planner_prune_expired_data()'::regprocedure),'dailyRetention',(select count(*) from cron.job where jobname='planner-prune-expired-data' and active),'enabledAccounts',(select count(*) from public.planner_ocr_feedback_consent where enabled))"));
  if(!report.verification.anonymousDenied || !report.verification.directWriteDenied || !report.verification.rpcAvailable || !report.verification.rowSecurity || !report.verification.retentionIntegrated || report.verification.dailyRetention!==1)throw Error('Deployment checks failed.');
 }
 fs.writeFileSync(path.join(scratch,'ocr-database-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
