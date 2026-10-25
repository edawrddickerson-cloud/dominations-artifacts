/* Guarded, reversible function-only release. The live rehearsal saves and all
 * history changes roll back; applying the migration never saves account data. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),file='supabase/migrations/202610250008_workspace_save_validation.sql',migration=fs.readFileSync(path.join(root,file),'utf8');
const sql=migration.replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,'');
const signatures=['planner_save_workspace(bigint,uuid,jsonb)','planner_validate_artwork_workspace()'];
const body=(text,name)=>{const start=text.indexOf('function public.'+name+'('),open=text.indexOf('as $$',start),end=text.indexOf('$$;',open+5);if(start<0||open<0||end<0)throw Error('Missing function body');return text.slice(open+5,end).replace(/\r\n/g,'\n').trim();};
setLog(path.join(root,'data/temp/workspace-save-deployment.log'));
try{
 const source=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync('ui/service-config.js','utf8'))?.[1];
 if(!project||source.PGUSER!=='postgres.'+project&&source.PGHOST!=='db.'+project+'.supabase.co')throw Error('Project mismatch');
 const originals=[fs.readFileSync('supabase/migrations/202610180001_planner_backend.sql','utf8'),fs.readFileSync('supabase/migrations/202610240007_shared_artwork.sql','utf8')];
 const functions=JSON.parse(query(source,`select json_agg(json_build_object('signature',oid::regprocedure::text,'definition',pg_get_functiondef(oid),'body',prosrc)) from pg_proc where oid in (${signatures.map(s=>"'public."+s+"'::regprocedure").join(',')})`));
 let alreadyApplied=true;
 for(let i=0;i<signatures.length;i++){
  const name=signatures[i].split('(')[0],found=functions.find(f=>f.signature.endsWith(signatures[i]));if(!found)throw Error('Missing production function');
  const current=found.body.replace(/\r\n/g,'\n').trim(),candidate=body(migration,name);
  if(current!==body(originals[i],name)&&current!==candidate)throw Error('Unexpected production implementation: '+name);
  if(current!==candidate)alreadyApplied=false;
 }
 const env={...source,PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000',PGAPPNAME:'planner-workspace-save-release'};
 const owner=query(source,'select owner_id from public.planner_workspaces order by owner_id limit 1');if(!/^[a-f0-9-]{36}$/.test(owner))throw Error('A real workspace is required for release rehearsal');
 const snapshots=`create temp table workspace_before on commit drop as select * from public.planner_workspaces;create temp table history_before on commit drop as select * from public.planner_workspace_history;create temp table permissions_before on commit drop as select oid,proacl,prosecdef,proconfig from pg_proc where oid in (${signatures.map(s=>"'public."+s+"'::regprocedure").join(',')});`;
 const unchanged=`do $check$ begin
 if exists((select * from workspace_before except select * from public.planner_workspaces) union all (select * from public.planner_workspaces except select * from workspace_before)) or exists((select * from history_before except select * from public.planner_workspace_history) union all (select * from public.planner_workspace_history except select * from history_before)) then raise exception 'Workspace or history data changed'; end if;
 if exists(select 1 from permissions_before b join pg_proc a on a.oid=b.oid where b.proacl is distinct from a.proacl or b.prosecdef is distinct from a.prosecdef or b.proconfig is distinct from a.proconfig) then raise exception 'Function security changed'; end if;
 end $check$;`;
 const rest=`select octet_length((select coalesce(json_agg(t.scalar)->0,'null') from (select public.planner_save_workspace_v2(p_owner,p_expected_revision,p_operation_id,p_data) scalar from request_input cross join lateral json_to_record(payload) as args(p_owner uuid,p_expected_revision bigint,p_operation_id uuid,p_data jsonb)) t)::text);`;
 const rehearsal=`begin;${snapshots}${sql}${unchanged}
 create temp table request_input on commit drop as select json_build_object('p_owner',owner_id,'p_expected_revision',revision,'p_operation_id',gen_random_uuid(),'p_data',data) payload from public.planner_workspaces where owner_id='${owner}';grant select on request_input to authenticated;
 select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;set local statement_timeout='8s';
 ${rest}${rest}
 do $cas$ declare args record;begin
 select * into args from request_input cross join lateral json_to_record(payload) as p(p_owner uuid,p_expected_revision bigint,p_operation_id uuid,p_data jsonb);
 begin perform public.planner_save_workspace_v2(args.p_owner,args.p_expected_revision,gen_random_uuid(),args.p_data);raise exception 'CAS conflict accepted';exception when serialization_failure then null;end;
 begin perform public.planner_save_workspace_v2(args.p_owner,args.p_expected_revision,args.p_operation_id,args.p_data||'{"releaseProbe":true}'::jsonb);raise exception 'Operation reuse accepted';exception when invalid_parameter_value then null;end;
 end $cas$;
 reset role;set local statement_timeout='60s';rollback;`;
 const started=Date.now();query(env,rehearsal);const rehearsalMs=Date.now()-started;
 let applied=false,backup;
 if(process.argv.includes('--apply')&&!alreadyApplied){
  const option=process.argv.find(a=>a.startsWith('--backup='));if(!option)throw Error('Applying requires --backup=<restore-verified backup folder>');
  backup=path.resolve(root,option.slice('--backup='.length));const boundary=path.join(root,'data/temp/database-backups')+path.sep;
  if(!backup.startsWith(boundary))throw Error('Backup must be inside the database backup folder');
  const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
  if(!manifest.restoreVerified||!manifest.verification?.tableChecksumsMatch||!manifest.verification?.plannerFunctionsMatch||!manifest.verification?.rowSecurityPoliciesMatch)throw Error('Backup restoration verification is incomplete');
  if(Date.now()-Date.parse(manifest.createdAt)>8*60*60*1000)throw Error('Backup is older than eight hours');
  const archive=path.resolve(backup,manifest.archive);if(!archive.startsWith(backup+path.sep)||crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==manifest.sha256)throw Error('Backup archive checksum mismatch');
  fs.writeFileSync('data/temp/workspace-save-rollback.sql','begin;\n'+functions.map(f=>f.definition+';').join('\n')+"\nnotify pgrst,'reload schema';\ncommit;\n");
  query(env,`begin;${snapshots}${sql}${unchanged}commit;`);applied=true;
 }
 const report={checkedAt:new Date().toISOString(),migration:file,sha256:crypto.createHash('sha256').update(migration).digest('hex'),applied,alreadyApplied,rehearsalPassed:true,rehearsalMs,postgrestParseAndSerialization:true,authenticatedStatementTimeoutSeconds:8,retryIdempotency:true,casAndOperationReuseRejection:true,accountDataModified:false,...(backup?{backup:path.relative(root,backup)}:{})};
 fs.writeFileSync('data/temp/workspace-save-release.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
