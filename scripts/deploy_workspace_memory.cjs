/* Function-only workspace allocation fix. Requires the exact migration to have
 * passed a restore rehearsal; applying performs no account-data canary writes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),migrationFile='supabase/migrations/202610300002_workspace_save_memory.sql';
const signatures=['planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb)','planner_validate_artwork_workspace()'];
const originalFiles=['supabase/migrations/202610300001_workspace_delta_save.sql','supabase/migrations/202610250008_workspace_save_validation.sql'];
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalized=value=>value.replace(/\s+/g,' ').trim();
function body(sql,name){const start=sql.indexOf('function public.'+name+'('),open=sql.indexOf('as $$',start),end=sql.indexOf('$$;',open+5);if(start<0||open<0||end<0)throw Error('Missing reviewed function '+name);return normalized(sql.slice(open+5,end));}
setLog(path.join(root,'data/temp/workspace-memory-deployment-errors.log'));
try{
 const source={...sourceEnvironment(),PGAPPNAME:'planner-readonly-memory-release-check'};
 if(source.PGUSER!=='postgres.gdzfpyrtdhzxvwcxqzdv'&&source.PGHOST!=='db.gdzfpyrtdhzxvwcxqzdv.supabase.co')throw Error('Project mismatch');
 const migration=read(migrationFile),migrationHash=hash(migration),references=signatures.map(s=>"'public."+s+"'::regprocedure").join(',');
 const functions=JSON.parse(query(source,`select json_agg(json_build_object('signature',oid::regprocedure::text,'definition',pg_get_functiondef(oid),'body',prosrc,'raw_md5',md5(prosrc))) from pg_proc where oid in (${references})`));
 let alreadyApplied=true;
 for(let i=0;i<signatures.length;i++){
  const name=signatures[i].split('(')[0],current=functions.find(f=>f.signature.endsWith(signatures[i]));
  if(!current)throw Error('Missing deployed function '+name);
  const actual=normalized(current.body),candidate=body(migration,name),original=body(read(originalFiles[i]),name);
  if(actual!==original&&actual!==candidate)throw Error('Unexpected deployed definition '+name);
  if(actual!==candidate)alreadyApplied=false;
 }
 const report={checkedAt:new Date().toISOString(),migration:migrationFile,sha256:migrationHash,alreadyApplied,applied:false,accountDataModified:false};
 if(process.argv.includes('--apply')&&!alreadyApplied){
  const option=process.argv.find(a=>a.startsWith('--backup='));if(!option)throw Error('Applying requires --backup=<fresh restore-verified rehearsal folder>');
  const backup=path.resolve(root,option.slice(9)),boundary=path.join(root,'data/temp/database-backups')+path.sep;
  if(!backup.startsWith(boundary))throw Error('Backup outside expected directory');
  const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
  if(!manifest.restoreVerified||!manifest.verification?.tableChecksumsMatch||!manifest.verification?.plannerFunctionsMatch||!manifest.verification?.rowSecurityPoliciesMatch||Date.now()-Date.parse(manifest.createdAt)>2*60*60*1000)throw Error('Fresh verified backup required');
  const rehearsal=manifest.workspaceMemoryRehearsal;
  if(!rehearsal?.actualRestoredWorkspace||!rehearsal.settingsAndSparseSave||!rehearsal.strictRetryAndCAS||!rehearsal.rolledBack||rehearsal.sha256!==migrationHash)throw Error('Exact migration must pass the isolated restored-workspace rehearsal');
  const archive=path.resolve(backup,manifest.archive);if(!archive.startsWith(backup+path.sep)||hash(fs.readFileSync(archive))!==manifest.sha256)throw Error('Backup archive checksum mismatch');
  const active=Number(query(source,"select count(*) from pg_stat_activity where application_name like 'PostgREST%' and (state='active' or xact_start is not null)"));
  if(active!==0)throw Error('Application requests are active; retry during the agreed idle window');
  const metadata="jsonb_build_object('workspaces',(select jsonb_agg(jsonb_build_array(owner_id,revision,operation_id,updated_at,pg_column_size(data)) order by owner_id) from public.planner_workspaces),'history',(select jsonb_agg(jsonb_build_array(owner_id,revision,saved_at,pg_column_size(data)) order by owner_id,revision) from public.planner_workspace_history))";
  const security=`(select jsonb_agg(jsonb_build_array(oid,proowner,proacl,prosecdef,proconfig,prorettype,proargtypes::text) order by oid) from pg_proc where oid in (${references}))`;
  const guard=functions.map(f=>`if (select md5(prosrc) from pg_proc where oid='public.${f.signature.replace(/^public\./,'')}'::regprocedure)<>'${f.raw_md5}' then raise exception 'Function changed after review';end if;`).join('\n');
  const sql=migration.replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,'');
  fs.writeFileSync(path.join(root,'data/temp/workspace-memory-rollback.sql'),'begin;\n'+functions.map(f=>f.definition+';').join('\n')+'\ncommit;\n');
  const env={...source,PGAPPNAME:'planner-reviewed-workspace-memory-release',PGOPTIONS:'-c default_transaction_read_only=off -c timezone=UTC'};
  const statement=`begin;set local statement_timeout='30s';set local lock_timeout='3s';
   create temp table memory_release_before on commit drop as select ${metadata} as account_state,${security} as function_security;
   do $guard$ begin ${guard} end $guard$;
   ${sql}
   do $unchanged$ begin
    if (select account_state from memory_release_before) is distinct from ${metadata} then raise exception 'Workspace/history changed during function release';end if;
    if (select function_security from memory_release_before) is distinct from ${security} then raise exception 'Function privileges or security changed';end if;
   end $unchanged$;commit;`;
  query(env,statement);report.applied=true;report.backup=path.relative(root,backup);report.actualRestoreRehearsalPassed=true;
 }
 if(report.applied||alreadyApplied){
  const actual=JSON.parse(query(source,`select json_object_agg(proname,prosrc) from pg_proc where oid in (${references})`));
  for(const signature of signatures){const name=signature.split('(')[0];if(normalized(actual[name])!==body(migration,name))throw Error('Installed definition mismatch '+name);}
  report.installedDefinitionsVerified=true;
 }
 fs.writeFileSync(path.join(root,'data/temp/workspace-memory-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
