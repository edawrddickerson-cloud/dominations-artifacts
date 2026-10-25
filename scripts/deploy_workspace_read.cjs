/* Reversible serialization-only optimization. Existing rows, invoker security
 * and execute grants must be identical before and after this deployment. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),file='supabase/migrations/202610250007_workspace_read_serialization.sql',sql=fs.readFileSync(path.join(root,file),'utf8');
setLog(path.join(root,'data/temp/workspace-read-deployment.log'));
const body=text=>text.slice(text.indexOf('as $$')+5,text.lastIndexOf('$$;')).replace(/\r\n/g,'\n').trim();
try{
 const source=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync('ui/service-config.js','utf8'))?.[1];
 if(!project||source.PGUSER!=='postgres.'+project&&source.PGHOST!=='db.'+project+'.supabase.co')throw Error('Project mismatch');
 const old=query(source,"select pg_get_functiondef('public.planner_read_workspace()'::regprocedure)"),current=query(source,"select prosrc from pg_proc where oid='public.planner_read_workspace()'::regprocedure").replace(/\r\n/g,'\n').trim();
 const original=fs.readFileSync('supabase/migrations/202610180001_planner_backend.sql','utf8'),start=original.indexOf('create function public.planner_read_workspace()'),end=original.indexOf('$$;',start)+3;
 if(current!==body(original.slice(start,end))&&current!==body(sql))throw Error('Unexpected read implementation');
 const owner=query(source,'select owner_id from public.planner_workspaces limit 1');if(!/^[a-f0-9-]{36}$/.test(owner))throw Error('Expected one account for parity verification');
 const env={...source,PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000',PGAPPNAME:'planner-workspace-read-release'};
 const transaction=commit=>`begin isolation level repeatable read;
 create temporary table read_before on commit drop as select owner_id,data,revision,operation_id,updated_at,game_key from public.planner_workspaces;
 create temporary table read_privileges on commit drop as select proacl,prosecdef from pg_proc where oid='public.planner_read_workspace()'::regprocedure;
 ${sql}
 do $check$ begin
  if exists((select * from read_before except select owner_id,data,revision,operation_id,updated_at,game_key from public.planner_workspaces) union all (select owner_id,data,revision,operation_id,updated_at,game_key from public.planner_workspaces except select * from read_before)) then raise exception 'Workspace data changed'; end if;
  if exists(select 1 from read_privileges before join pg_proc after on after.oid='public.planner_read_workspace()'::regprocedure where before.proacl is distinct from after.proacl or after.prosecdef) then raise exception 'Read access changed'; end if;
 end $check$;
 select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;set local statement_timeout='8s';
 select public.planner_read_workspace()=(select to_jsonb(w)-'owner_id' from public.planner_workspaces w where owner_id=auth.uid()) parity;
 reset role;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);set local role authenticated;
 do $isolation$ begin if public.planner_read_workspace() is not null then raise exception 'Cross-account workspace exposed'; end if; end $isolation$;reset role;
 ${commit?"notify pgrst,'reload schema';commit;":'rollback;'}`;
 const rehearsal=query(env,transaction(false));if(!rehearsal.split(/\r?\n/).includes('t'))throw Error('Read envelope parity failed');
 let applied=false;if(process.argv.includes('--apply')&&current!==body(sql)){fs.writeFileSync('data/temp/workspace-read-rollback.sql',old+'\n');query(env,transaction(true));applied=true;}
 const report={checkedAt:new Date().toISOString(),migration:file,sha256:crypto.createHash('sha256').update(sql).digest('hex'),applied,rehearsalPassed:true,readEnvelopeUnchanged:true,accountIsolationVerified:true,accountDataModified:false};
 fs.writeFileSync('data/temp/workspace-read-release.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
