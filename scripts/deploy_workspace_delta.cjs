/* Reviewed v3 rollout: verified backup, rollback rehearsal, additive DDL only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),migrationFile='supabase/migrations/202610300001_workspace_delta_save.sql';
setLog(path.join(root,'data/temp/workspace-delta-deployment.log'));
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8'),normalized=value=>value.replace(/\s+/g,' ').trim();
const body=(text,name)=>{const match=text.match(new RegExp('function public\\.'+name+'\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;','i'));if(!match)throw Error('Missing reviewed function '+name);return normalized(match[1]);};
try{
 const source=sourceEnvironment();if(source.PGUSER!=='postgres.gdzfpyrtdhzxvwcxqzdv'&&source.PGHOST!=='db.gdzfpyrtdhzxvwcxqzdv.supabase.co')throw Error('Project mismatch');
 const migration=read(migrationFile),sql=migration.replace(/^begin;\r?$/m,'').replace(/^commit;\r?$/m,'');
 const existing=JSON.parse(query(source,"select jsonb_object_agg(p.proname,p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('planner_save_workspace','planner_save_workspace_v2','planner_validate_artwork_workspace')"));
 for(const [name,file] of [['planner_save_workspace','supabase/migrations/202610250008_workspace_save_validation.sql'],['planner_validate_artwork_workspace','supabase/migrations/202610250008_workspace_save_validation.sql'],['planner_save_workspace_v2','supabase/migrations/202610230001_crafting_statistics_v2.sql']])if(normalized(existing[name]||'')!==body(read(file),name))throw Error('Unexpected deployed definition: '+name);
 const deployed=query(source,"select coalesce((select prosrc from pg_proc where oid=to_regprocedure('public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb)')),'')");
 if(deployed){if(normalized(deployed)!==body(migration,'planner_save_workspace_v3'))throw Error('Unexpected existing v3 function');console.log('Reviewed v3 function is already installed.');process.exit(0);}
 const backupOption=process.argv.find(arg=>arg.startsWith('--backup='));if(!backupOption)throw Error('Requires --backup=<restore-verified folder>');
 const backup=path.resolve(root,backupOption.slice(9)),boundary=path.join(root,'data/temp/database-backups')+path.sep;
 if(!backup.startsWith(boundary))throw Error('Backup path outside expected folder');
 const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
 if(!manifest.restoreVerified||!manifest.verification?.tableChecksumsMatch||!manifest.verification?.plannerFunctionsMatch||!manifest.verification?.rowSecurityPoliciesMatch||Date.now()-Date.parse(manifest.createdAt)>8*60*60*1000)throw Error('A fresh verified backup is required');
 const archive=path.resolve(backup,manifest.archive);if(!archive.startsWith(backup+path.sep)||crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==manifest.sha256)throw Error('Backup archive verification failed');
 const env={...source,PGOPTIONS:'-c default_transaction_read_only=off -c timezone=UTC',PGAPPNAME:'planner-reviewed-delta-release'};
 const limits="set local statement_timeout='30s';set local lock_timeout='3s';";
 const metadata=`jsonb_build_object('workspaces',(select jsonb_agg(jsonb_build_array(owner_id,revision,operation_id,updated_at,pg_column_size(data)) order by owner_id) from public.planner_workspaces),'history',(select jsonb_agg(jsonb_build_array(owner_id,revision,saved_at,pg_column_size(data)) order by owner_id,revision) from public.planner_workspace_history))`;
 const snapshots=`create temp table delta_release_metadata on commit drop as select ${metadata} value;`;
 const unchanged=`do $guard$ begin if (select value from delta_release_metadata) is distinct from ${metadata} then raise exception 'Account metadata changed during DDL';end if;end $guard$;`;
 // The real account's document stays inside PostgreSQL. All canary writes,
 // snapshots and receipts roll back together with the candidate DDL.
 const rehearsal=`begin;${limits}${sql}
 do $canary$ declare w public.planner_workspaces%rowtype;payload jsonb;delta jsonb;op uuid:=gen_random_uuid();a jsonb;b jsonb;begin
 select * into w from public.planner_workspaces order by owner_id limit 1;if not found then raise exception 'No workspace for rehearsal';end if;
 payload:=w.data#-'{craftingLog,items}';delta:=jsonb_build_object('length',jsonb_array_length(w.data->'craftingLog'->'items'),'changes','{}'::jsonb);
 perform set_config('request.jwt.claim.sub',w.owner_id::text,true);
 execute 'set local role authenticated';
 a:=public.planner_save_workspace_v3(w.owner_id,w.revision,op,payload,delta);
 b:=public.planner_save_workspace_v3(w.owner_id,w.revision,op,payload,delta);
 if a<>b or (a->>'revision')::bigint<>w.revision+1 or a?'data' then raise exception 'Invalid v3 acknowledgement/retry';end if;
 begin perform public.planner_save_workspace_v3(w.owner_id,w.revision,gen_random_uuid(),payload,delta);raise exception 'Stale revision accepted';exception when serialization_failure then null;end;
 begin perform public.planner_save_workspace_v3(w.owner_id,w.revision,op,payload||'{"releaseProbe":true}'::jsonb,delta);raise exception 'Altered retry accepted';exception when invalid_parameter_value then null;end;
 execute 'reset role';end $canary$;rollback;`;
 const started=Date.now();query(env,rehearsal);const rehearsalMs=Date.now()-started;
 if(query(source,"select to_regclass('public.planner_workspace_save_receipts') is null and to_regprocedure('public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb)') is null")!=='t')throw Error('Rehearsal did not roll back DDL');
 let applied=false;
 if(process.argv.includes('--apply')){query(env,`begin;${limits}${snapshots}${sql}${unchanged}commit;`);applied=true;}
 const report={checkedAt:new Date().toISOString(),migration:migrationFile,sha256:crypto.createHash('sha256').update(migration).digest('hex'),backup:path.relative(root,backup),rehearsalMs,rehearsalRolledBack:true,applied,accountDataModified:false};
 if(applied){report.permissions=JSON.parse(query(source,"select jsonb_build_object('authenticatedExecute',has_function_privilege('authenticated','public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb)','execute'),'anonymousExecute',has_function_privilege('anon','public.planner_save_workspace_v3(uuid,bigint,uuid,jsonb,jsonb)','execute'),'receiptReadable',has_table_privilege('authenticated','public.planner_workspace_save_receipts','select'),'receiptRLS',(select relrowsecurity from pg_class where oid='public.planner_workspace_save_receipts'::regclass))"));if(!report.permissions.authenticatedExecute||report.permissions.anonymousExecute||report.permissions.receiptReadable||!report.permissions.receiptRLS)throw Error('Post-migration permissions failed');}
 fs.writeFileSync(path.join(root,'data/temp/workspace-delta-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
