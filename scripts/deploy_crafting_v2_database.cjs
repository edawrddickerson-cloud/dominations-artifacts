/* Authorized release utility. Credentials remain in the existing ignored file.
 * --inspect is read-only; --apply requires a verified current backup rehearsal.
 * Both migrations run in one transaction and existing account data is checked. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp');
const files=['202610230001_crafting_statistics_v2.sql','202610230002_crafting_starting_rules.sql'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sources=files.map(file=>fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
const migrationHash=hash(sources.join('\n'));
setLog(path.join(scratch,'crafting-v2-deployment-database.log'));
function inventory(env) {
  return JSON.parse(query(env,"select json_build_object('baseReady',to_regprocedure('public.planner_save_workspace(bigint,uuid,jsonb)') is not null,'ocrReady',to_regprocedure('public.planner_delete_ocr_feedback()') is not null,'v2Present',to_regclass('public.planner_crafting_evidence') is not null,'cronReady',exists(select 1 from pg_extension where extname='pg_cron'))"));
}
function existingRows(env) {
  const tables=['planner_workspaces','planner_workspace_history','planner_research_consent','planner_consent_events','planner_research_sessions','planner_research_outcomes'];
  return query(env,tables.map(table=>"select '"+table+"' || ':' || count(*) || ':' || md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from public."+table+' t;').join('\n'));
}
function verify(env) {
  const checks=JSON.parse(query(env,"select json_build_object('rules',(select count(*) from public.planner_crafting_rules),'anonymousRawDenied',not has_table_privilege('anon','public.planner_crafting_evidence','select'),'anonymousPrivateSaveDenied',not has_function_privilege('anon','public.planner_save_workspace_v2(uuid,bigint,uuid,jsonb)','execute'),'privateSaveAvailable',has_function_privilege('authenticated','public.planner_save_workspace_v2(uuid,bigint,uuid,jsonb)','execute'),'rowSecurity',(select relrowsecurity from pg_class where oid='public.planner_crafting_evidence'::regclass),'reportStatus',public.planner_crafting_report()->>'status','newEvidenceRows',(select count(*) from public.planner_crafting_evidence),'enabledContributors',(select count(*) from public.planner_crafting_consent where enabled))"));
  if(checks.rules!==514 || !checks.anonymousRawDenied || !checks.anonymousPrivateSaveDenied || !checks.privateSaveAvailable || !checks.rowSecurity)throw Error('Deployed crafting isolation checks failed.');
  return checks;
}
try {
  const env=sourceEnvironment(),before=inventory(env);
  const project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
  if(!project || env.PGUSER!=='postgres.'+project && env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Saved database credentials do not match the configured Supabase project.');
  if(!before.baseReady)throw Error('Existing planner backend is missing.');
  const report={checkedAt:new Date().toISOString(),migrationHash,before};
  if(process.argv.includes('--apply')) {
    if(before.v2Present)throw Error('V2 already exists; use --verify and review migration history rather than reapplying.');
    const option=process.argv.find(arg=>arg.startsWith('--backup='));
    if(!option)throw Error('Supply --backup=PATH for the verified pre-deployment manifest.');
    const manifestPath=fs.realpathSync(path.resolve(root,option.slice(9)));
    if(!manifestPath.startsWith(path.join(scratch,'database-backups')+path.sep))throw Error('Backup must be in the private backup directory.');
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if(!manifest.restoreVerified || !manifest.craftingV2Rehearsal?.passed || manifest.craftingV2Rehearsal.migrationHash!==migrationHash || Date.now()-Date.parse(manifest.createdAt)>3600000)throw Error('A recent verified backup and matching migration rehearsal are required.');
    const archive=path.join(path.dirname(manifestPath),manifest.archive);
    if(hash(fs.readFileSync(archive))!==manifest.sha256)throw Error('Backup checksum changed.');
    const writable={...env,PGAPPNAME:'planner-crafting-v2-release',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'};
    const initial=existingRows(env);
    query(writable,'begin;'+sources.join('\n')+"\nnotify pgrst, 'reload schema';\ncommit;");
    report.applied=true;report.existingRowsUnchanged=initial===existingRows(env);
    if(!report.existingRowsUnchanged)throw Error('Account data changed during deployment; inspect the backup and concurrent activity.');
    report.backup=path.relative(root,manifestPath);
  }
  if(process.argv.includes('--verify') || report.applied)report.verification=verify(env);
  fs.writeFileSync(path.join(scratch,'crafting-v2-database-release.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
