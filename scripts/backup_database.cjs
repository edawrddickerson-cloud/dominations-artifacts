/* Read-only hosted export; restoration is restricted to a fresh loopback cluster.
 * Credentials, archives, local database files and detailed logs stay Git-ignored.
 * This covers planner, reporting and Auth schemas, not Supabase project settings,
 * managed service schemas, function secrets, or Storage objects.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const net=require('node:net');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp');
const bin=process.env.PLANNER_PG_BIN || path.join(scratch,'postgresql-tools/pgsql/bin');
const schemas=['public','auth','research_reporting'];
const values={};
for(const line of fs.readFileSync(path.join(scratch,'database-backup-credentials.txt'),'utf8').split(/\r?\n/)) {
  const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)values[match[1]]=match[2].trim();
}
function sourceEnvironment() {
  let url;try{url=new URL(values.SUPABASE_DB_URL);}catch{throw Error('The saved database URL is invalid.');}
  if(!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.supabase.com') && !url.hostname.endsWith('.supabase.co'))throw Error('Expected a Supabase database connection URL.');
  if(!values.SUPABASE_DB_PASSWORD)throw Error('The saved database password is missing.');
  if(url.hostname.includes('.pooler.') && url.port!=='5432')throw Error('Select Session pooler on port 5432.');
  return {...process.env,PGHOST:url.hostname,PGPORT:url.port || '5432',PGUSER:decodeURIComponent(url.username),PGDATABASE:url.pathname.slice(1) || 'postgres',PGPASSWORD:values.SUPABASE_DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15',PGAPPNAME:'planner-backup',PGOPTIONS:'-c default_transaction_read_only=on -c timezone=UTC'};
}
let directory,log;
function run(tool,args,env,input) {
  // A daemon started by pg_ctl can retain pipe handles on Windows. Use files
  // rather than captured pipes for that launcher, so completion does not wait
  // for the database server itself to exit.
  const output=tool==='pg_ctl'?fs.openSync(log,'a'):null;
  let result;
  try{result=spawnSync(path.join(bin,tool+'.exe'),args,{env,input,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024,timeout:180000,...(output!==null?{stdio:['ignore',output,output]}:{})});}
  finally{if(output!==null)fs.closeSync(output);}
  if(result.error || result.status!==0) {
    let details=String(result.stderr || result.error?.message || 'Unknown tool failure');
    for(const value of Object.values(values))if(value)details=details.split(value).join('[redacted]');
    if(log)fs.appendFileSync(log,tool+': '+details+'\n');
    const reason=/password authentication failed/i.test(details)?' Database password authentication failed.':/could not translate host|could not connect|connection.*failed|timeout|timed out/i.test(details)?' Database connection failed.':'';
    throw Error(tool+' failed.'+reason+' Details are in the ignored execution log.');
  }
  return result.stdout || '';
}
function query(env,sql){
  const args=['-X','-w','-A','-t','-v','ON_ERROR_STOP=1'];
  // Large release migrations exceed Windows' command-line limit. Callers of
  // this path supply their own explicit BEGIN/COMMIT transaction.
  return (sql.length>16000?run('psql',[...args,'-f','-'],env,sql):run('psql',[...args,'-c',sql],env)).trim();
}
const quote=value=>'"'+value.replaceAll('"','""')+'"';
function inventory(env) {
  return JSON.parse(query(env,`select coalesce(json_agg(json_build_object('schema',schemaname,'name',tablename) order by schemaname,tablename),'[]') from pg_tables where schemaname in ('public','auth','research_reporting')`));
}
function fingerprints(env,tables) {
  const statements=tables.map(table=>`select json_build_object('schema',${"'"+table.schema.replaceAll("'","''")+"'"},'name',${"'"+table.name.replaceAll("'","''")+"'"},'rows',count(*),'checksum',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),''))) from ${quote(table.schema)}.${quote(table.name)} t;`);
  return query(env,statements.join('\n')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}
function security(env) {
  return JSON.parse(query(env,`select json_build_object(
    'tables',(select json_agg(json_build_array(c.relname,c.relrowsecurity,c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'planner_%' and c.relkind='r'),
    'policies',(select json_agg(json_build_array(tablename,policyname,roles::text,cmd,qual,with_check) order by tablename,policyname) from pg_policies where schemaname='public' and tablename like 'planner_%'),
    'functions',(select json_agg(json_build_array(p.proname,p.prosecdef,pg_get_functiondef(p.oid)) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'planner_%'))`));
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function main() {
  const stopOption=process.argv.find(arg=>arg.startsWith('--stop-local='));
  if(stopOption) {
    directory=path.resolve(root,stopOption.slice('--stop-local='.length));
    if(!directory.startsWith(path.join(scratch,'database-backups')+path.sep) || !fs.existsSync(path.join(directory,'manifest.json')))throw Error('Expected an existing local backup restore folder.');
    log=path.join(directory,'execution.log');
    run('pg_ctl',['-D',path.join(directory,'restore-cluster'),'-m','fast','-w','stop'],process.env);
    console.log('Isolated local restore database stopped.');return;
  }
  const source=sourceEnvironment();
  directory=path.join(scratch,'database-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
  fs.mkdirSync(directory,{recursive:true});log=path.join(directory,'execution.log');
  const version=query(source,'show server_version');
  console.log('Database connection verified. PostgreSQL '+version.split(' ')[0]+'.');
  if(process.argv.includes('--test-maintenance')) {
    if(query(source,"select (select count(*) from public.planner_workspace_history where saved_at<now()-interval '30 days')+(select count(*) from public.planner_research_sessions where received_at<now()-interval '730 days')")!=='0')throw Error('Expired records exist. Review them before the live scheduler acceptance test.');
    if(query(source,"select count(*) from cron.job where jobname='planner-prune-expired-data' and active and schedule='15 3 * * *' and btrim(command,' ;'||chr(10)||chr(13))='select public.planner_prune_expired_data()'")!=='1')throw Error('The expected daily retention job is not active.');
    const writable={...source,PGOPTIONS:'-c timezone=UTC'},jobName='planner-prune-acceptance-'+crypto.randomBytes(6).toString('hex');
    const id=query(writable,`select cron.schedule('${jobName}','5 seconds',$job$select public.planner_prune_expired_data(); select cron.unschedule('${jobName}');$job$)`);
    if(!/^\d+$/.test(id))throw Error('Unexpected acceptance job identifier.');
    let result;
    try {
      for(let attempt=0;attempt<30;attempt++) {
        await new Promise(resolve=>setTimeout(resolve,1000));
        result=JSON.parse(query(source,`select coalesce((select json_build_object('status',status,'started',start_time,'ended',end_time) from cron.job_run_details where jobid=${id} order by runid desc limit 1),'null'::json)`));
        if(result?.status==='succeeded')break;
        if(result && !['running','starting','connecting','sending'].includes(result.status))throw Error('The scheduled retention acceptance run failed.');
      }
      if(result?.status!=='succeeded')throw Error('No successful scheduled retention run was observed before timeout.');
      fs.writeFileSync(path.join(scratch,'database-maintenance-acceptance.json'),JSON.stringify({dailySchedule:'15 3 * * *',expiredRecordsBeforeTest:0,scheduledTestRun:result},null,2));
      console.log('Actual scheduled retention run succeeded. No expired records existed before the test.');
    } finally {
      query(writable,`select cron.unschedule(jobid) from cron.job where jobid=${id} and jobname='${jobName}'`);
    }
    return;
  }
  if(process.argv.includes('--configure-maintenance')) {
    const definition=query(source,"select prosrc from pg_proc where oid='public.planner_prune_expired_data()'::regprocedure");
    const hasOCRFeedback=query(source,"select to_regclass('public.planner_ocr_feedback_samples') is not null")==='t';
    const migration=fs.readFileSync(path.join(root,'supabase/migrations',hasOCRFeedback?'202610220002_ocr_feedback.sql':'202610180001_planner_backend.sql'),'utf8');
    const expected=migration.match(/create (?:or replace )?function public\.planner_prune_expired_data\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1];
    const normalized=value=>value?.replace(/\s+/g,' ').trim();
    if(!expected || normalized(definition)!==normalized(expected))throw Error('The deployed retention function differs from the reviewed migration.');
    const writable={...source,PGOPTIONS:'-c timezone=UTC'};
    const existing=query(source,"select exists(select 1 from pg_extension where extname='pg_cron')")==='t';
    if(existing && query(source,"select count(*) from cron.job where command like '%planner_prune_expired_data%' and jobname is distinct from 'planner-prune-expired-data'")!=='0')throw Error('Another retention job exists; review before changing schedules.');
    query(writable,fs.readFileSync(path.join(root,'supabase/migrations/202610220001_planner_retention_cron.sql'),'utf8'));
    console.log('Daily retention job enabled at 03:15 in the cron scheduler timezone.');return;
  }
  if(process.argv.includes('--check-maintenance')) {
    const result=JSON.parse(query(source,`select json_build_object(
      'cronEnabled',exists(select 1 from pg_extension where extname='pg_cron'),
      'pruneFunctionPresent',to_regprocedure('public.planner_prune_expired_data()') is not null,
      'expiredHistory',(select count(*) from public.planner_workspace_history where saved_at<now()-interval '30 days'),
      'expiredResearchSessions',(select count(*) from public.planner_research_sessions where received_at<now()-interval '730 days'))`));
    if(result.cronEnabled) {
      result.timezone=query(source,"select coalesce(current_setting('cron.timezone',true),'GMT')");
      result.jobs=JSON.parse(query(source,`select coalesce(json_agg(json_build_object('id',jobid,'schedule',schedule,'active',active,'matchesExpectedCommand',btrim(command,' ;'||chr(10)||chr(13))='select public.planner_prune_expired_data()') order by jobid),'[]') from cron.job where command like '%planner_prune_expired_data%'`));
      result.recentRuns=JSON.parse(query(source,`select coalesce(json_agg(t order by t.started desc),'[]') from (select r.jobid,r.status,r.start_time as started,r.end_time as ended from cron.job_run_details r join cron.job j on j.jobid=r.jobid where j.command like '%planner_prune_expired_data%' order by r.start_time desc limit 5) t`));
    }
    fs.writeFileSync(path.join(scratch,'database-maintenance-check.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));return;
  }
  if(process.argv.includes('--check'))return;
  const tables=inventory(source),before=fingerprints(source,tables),securityBefore=security(source);
  const roles=query(source,"select rolname from pg_roles where rolname !~ '^pg_' and rolname <> 'planner_restore' order by rolname").split(/\r?\n/).filter(Boolean);
  const archive=path.join(directory,'planner-auth.dump');
  run('pg_dump',['-w','--format=custom','--no-owner','--lock-wait-timeout=15000',...schemas.flatMap(schema=>['--schema',schema]),'--file',archive],source);
  const after=fingerprints(source,tables);
  if(JSON.stringify(before)!==JSON.stringify(after) || JSON.stringify(securityBefore)!==JSON.stringify(security(source)))throw Error('Source data changed during the backup. The unverified archive is retained; retry while planner tabs are idle.');
  const manifest={createdAt:new Date().toISOString(),serverVersion:version,schemas,tables:before,security:securityBefore,archive:'planner-auth.dump',sha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),restoreVerified:false,limitations:['Supabase project/provider settings, deployed Edge Functions, server secrets, managed service schemas and Storage objects require separate recovery.','Local PostgreSQL restoration does not test the Supabase Auth service, Discord authorization, or managed encrypted credentials.','Keep an independent off-device copy; this local export is not a scheduled or off-site backup.']};
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log('Read-only export complete: '+tables.length+' tables.');
  if(!process.argv.includes('--verify')) {console.log('Backup folder: '+directory);return;}
  const cluster=path.join(directory,'restore-cluster'),password=crypto.randomBytes(32).toString('hex'),passwordFile=path.join(directory,'restore-password.txt');
  const port=await freePort();
  const local={...process.env,PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:'postgres',PGUSER:'planner_restore',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c timezone=UTC',PGAPPNAME:'planner-local-restore'};
  fs.writeFileSync(passwordFile,password,{mode:0o600});
  let started=false;
  try {
    run('initdb',['-D',cluster,'-U','planner_restore','--auth=scram-sha-256','--pwfile',passwordFile,'--encoding=UTF8','--locale=C'],local);
    started=true;run('pg_ctl',['-D',cluster,'-l',path.join(directory,'restore-postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],local);
    if(local.PGHOST!=='127.0.0.1' || !cluster.startsWith(path.join(scratch,'database-backups')+path.sep))throw Error('Local restore boundary failed.');
    query(local,roles.map(role=>'create role '+quote(role)+' nologin;').join('\n')+'\ndrop schema public;');
    run('pg_restore',['-w','--exit-on-error','--single-transaction','--no-owner','--dbname','postgres',archive],local);
    const restored=fingerprints(local,tables),securityAfter=security(local);
    if(JSON.stringify(before)!==JSON.stringify(restored)) {
      fs.writeFileSync(path.join(directory,'restore-comparison.json'),JSON.stringify({expected:before,actual:restored},null,2));
      throw Error('Restored table checksums do not match the live export.');
    }
    if(JSON.stringify(securityBefore)!==JSON.stringify(securityAfter))throw Error('Restored planner functions or isolation policies differ from the live source.');
    const owner=query(local,'select owner_id from public.planner_workspaces order by owner_id limit 1');
    if(owner && !/^[a-f0-9-]{36}$/.test(owner))throw Error('Unexpected restored owner identifier.');
    const checkOwner=(id,expected)=>query(local,`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);do $$ begin if (select count(*) from public.planner_workspaces) <> ${expected} then raise exception 'Restored account isolation failed'; end if; end $$;rollback;`);
    if(owner)checkOwner(owner,1);
    checkOwner(crypto.randomUUID(),0);
    if(query(local,"select has_table_privilege('anon','public.planner_workspaces','select') or has_function_privilege('anon','public.planner_read_workspace()','execute')")!=='f')throw Error('Restored anonymous workspace access is not denied.');
    manifest.restoreVerified=true;manifest.restoredAt=new Date().toISOString();
    manifest.verification={tableChecksumsMatch:true,plannerFunctionsMatch:true,rowSecurityPoliciesMatch:true,restoredAccountIsolation:true,anonymousWorkspaceAccessDenied:true,restoredTables:tables.length};
    if(process.argv.includes('--rehearse-crafting-v2')) {
      // Only the newly created loopback restore is writable. The source remains
      // read-only, and the original archive is unchanged by this rehearsal.
      if(local.PGHOST!=='127.0.0.1' || !process.argv.includes('--verify'))throw Error('Crafting rehearsal requires an isolated restore.');
      const files=['202610230001_crafting_statistics_v2.sql','202610230002_crafting_starting_rules.sql'];
      const sql=files.map(file=>fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8')).join('\n');
      query(local,'begin;'+sql+'\ncommit;');
      if(JSON.stringify(before)!==JSON.stringify(fingerprints(local,tables)))throw Error('Crafting rehearsal changed existing account data.');
      const checks=JSON.parse(query(local,"select json_build_object('rules',(select count(*) from public.planner_crafting_rules),'anonymousRawDenied',not has_table_privilege('anon','public.planner_crafting_evidence','select'),'anonymousPrivateSaveDenied',not has_function_privilege('anon','public.planner_save_workspace_v2(uuid,bigint,uuid,jsonb)','execute'),'aggregateAvailable',has_function_privilege('anon','public.planner_crafting_report(text,text,text,text)','execute'),'emptyReportSuppressed',(public.planner_crafting_report()->>'status')='insufficient-sample')"));
      if(checks.rules!==514 || !checks.anonymousRawDenied || !checks.anonymousPrivateSaveDenied || !checks.aggregateAvailable || !checks.emptyReportSuppressed)throw Error('Crafting rehearsal checks failed.');
      manifest.craftingV2Rehearsal={passed:true,migrationHash:crypto.createHash('sha256').update(sql).digest('hex'),existingRowsUnchanged:true,...checks};
      console.log('Crafting v2 migration rehearsal passed against the isolated live-data restore.');
    }
    fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
    console.log('Isolated local restore passed: table contents, planner functions and row security policies match.');
  } finally {
    if(started)run('pg_ctl',['-D',cluster,'-m','fast','-w','stop'],local);
    fs.unlinkSync(passwordFile);
  }
  console.log('Backup folder: '+directory);
}
module.exports={sourceEnvironment,query,setLog:file=>{log=file;}};
if(require.main===module)main().catch(error=>{console.error(error.message);if(directory)console.error('Local report folder: '+directory);process.exitCode=1;});
