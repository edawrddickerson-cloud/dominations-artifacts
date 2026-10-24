/* Additive weekly OCR reports. Inspect, verified native-restore rehearsal, then apply. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp');
const files=['202610240004_ocr_weekly_reports.sql','202610240005_ocr_matching_names.sql'];
const sql='begin;\n'+files.map(f=>fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8')).join('\n').replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,'')+'\ncommit;\n',hash=s=>crypto.createHash('sha256').update(s).digest('hex');
setLog(path.join(scratch,'ocr-weekly-deployment.log'));
try{
 const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
 if(env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
 const before=JSON.parse(query(env,"select json_build_object('ocrReady',to_regclass('public.planner_ocr_feedback_samples') is not null,'weeklyPresent',to_regclass('research_reporting.ocr_weekly_reports') is not null,'cronTimezone',coalesce(current_setting('cron.timezone',true),'GMT'),'retentionActive',(select count(*) from cron.job where jobname='planner-prune-expired-data' and active),'schedule',(select json_build_object('id',jobid,'schedule',schedule,'command',command,'active',active) from cron.job where jobname='planner-ocr-weekly-report'))"));
 if(!before.ocrReady || before.retentionActive!==1)throw Error('OCR or existing retention is not ready.');
 if(!['GMT','UTC','Etc/UTC'].includes(before.cronTimezone))throw Error('Review scheduler timezone before installing a UTC job.');
 const definitions=query(env,"select json_object_agg(proname,pg_get_functiondef(oid) order by proname) from pg_proc where pronamespace='public'::regnamespace and (proname like 'planner_export%' or proname like 'planner_prune%' or proname in ('planner_delete_ocr_feedback','planner_submit_ocr_feedback','planner_crafting_summary'))");
 fs.writeFileSync(path.join(scratch,'ocr-weekly-inspected-functions.json'),definitions);
 const report={checkedAt:new Date().toISOString(),migrationHash:hash(sql),before};
 if(process.argv.includes('--apply')){
  if(before.weeklyPresent)throw Error('Weekly report tables already exist; inspect rather than reapply.');
  const backup=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);if(!backup)throw Error('Supply verified --backup=.../manifest.json.');
  const manifestPath=fs.realpathSync(path.resolve(root,backup));if(!manifestPath.startsWith(path.join(scratch,'database-backups')+path.sep))throw Error('Unexpected backup path.');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!manifest.restoreVerified || !manifest.ocrWeeklyRehearsal?.passed || manifest.ocrWeeklyRehearsal.migrationHash!==hash(sql) || Date.now()-Date.parse(manifest.createdAt)>3600000 || hash(fs.readFileSync(path.join(path.dirname(manifestPath),manifest.archive)))!==manifest.sha256)throw Error('Recent verified backup and matching weekly-report rehearsal required.');
  fs.writeFileSync(path.join(scratch,'ocr-weekly-prior-functions.json'),definitions);
  fs.writeFileSync(path.join(scratch,'ocr-weekly-rollback.sql'),"-- Stop weekly generation. Existing reports and reviewed fixtures are preserved.\nselect cron.unschedule(jobid) from cron.job where jobname='planner-ocr-weekly-report';\n");
  const writable={...env,PGAPPNAME:'planner-ocr-weekly-release',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=120000'};
  query(writable,sql);
  if(query(env,"select json_object_agg(proname,pg_get_functiondef(oid) order by proname) from pg_proc where pronamespace='public'::regnamespace and (proname like 'planner_export%' or proname like 'planner_prune%' or proname in ('planner_delete_ocr_feedback','planner_submit_ocr_feedback','planner_crafting_summary'))")!==definitions)throw Error('Existing account/research/retention functions changed.');
  query(writable,fs.readFileSync(path.join(root,'supabase/migrations/202610240006_ocr_weekly_schedule.sql'),'utf8')+"\nselect public.planner_run_ocr_weekly_reports();\nnotify pgrst, 'reload schema';");
  report.applied=true;report.backup=path.relative(root,manifestPath);report.existingFunctionsUnchanged=true;
 }
 if(before.weeklyPresent || report.applied){
  report.verification=JSON.parse(query(env,"select json_build_object('privateTables',not has_table_privilege('authenticated','research_reporting.ocr_weekly_reports','select') and not has_table_privilege('anon','research_reporting.ocr_weekly_candidates','select'),'privateFunctions',not has_function_privilege('authenticated','public.planner_read_ocr_weekly_reports(date)','execute') and not has_function_privilege('anon','public.planner_inspect_ocr_weekly_candidate(uuid)','execute'),'serviceCanExport',has_function_privilege('service_role','public.planner_read_ocr_weekly_reports(date)','execute'),'schedule',(select json_build_object('schedule',schedule,'command',command,'active',active) from cron.job where jobname='planner-ocr-weekly-report'),'reports',(select count(*) from research_reporting.ocr_weekly_reports),'catalogueNames',(select count(*) from research_reporting.ocr_matching_names),'baselineCases',(select count(*) from research_reporting.ocr_matching_cases))"));
  const v=report.verification;if(!v.privateTables || !v.privateFunctions || !v.serviceCanExport || !v.schedule?.active || v.schedule.schedule!=='0 4 * * 1' || v.schedule.command.trim()!=='select public.planner_run_ocr_weekly_reports();' || v.catalogueNames<100 || v.baselineCases<v.catalogueNames)throw Error('Weekly report verification failed.');
 }
 if(process.argv.includes('--test-schedule')){
  if(!report.verification)throw Error('Deploy the report before testing its schedule.');
  const writable={...env,PGAPPNAME:'planner-ocr-weekly-acceptance',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=120000'},name='planner-ocr-weekly-acceptance-'+crypto.randomBytes(6).toString('hex');
  const id=query(writable,"select cron.schedule('"+name+"','5 seconds',$job$select public.planner_run_ocr_weekly_reports();select cron.unschedule('"+name+"');$job$)");
  if(!/^\d+$/.test(id))throw Error('Unexpected test job identifier.');
  const awaitRun=async()=>{
   try{
    let result;
    for(let attempt=0;attempt<45;attempt++){
     await new Promise(resolve=>setTimeout(resolve,1000));
     result=JSON.parse(query(env,"select coalesce((select json_build_object('status',status,'started',start_time,'ended',end_time) from cron.job_run_details where jobid="+id+" order by runid desc limit 1),'null'::json)"));
     if(result?.status==='succeeded')break;
     if(result && !['running','starting','connecting','sending'].includes(result.status))throw Error('Scheduled OCR acceptance failed.');
    }
    if(result?.status!=='succeeded')throw Error('Scheduled OCR acceptance timed out.');
    report.schedulerAcceptance=result;
   }finally{query(writable,"select cron.unschedule(jobid) from cron.job where jobid="+id+" and jobname='"+name+"'");}
   fs.writeFileSync(path.join(scratch,'ocr-weekly-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  };
  awaitRun().catch(e=>{console.error(e.message);process.exitCode=1;});
 }else{fs.writeFileSync(path.join(scratch,'ocr-weekly-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
}catch(e){console.error(e.message);process.exitCode=1;}
