/* Reviewed read-only aggregate endpoint. Preserve account data and every other
 * planner function; rehearse under anonymous access before committing. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),migration='supabase/migrations/202610250006_crafting_probability_model.sql',sql=fs.readFileSync(path.join(root,migration),'utf8');
const signature='public.planner_crafting_probability_model(text,text)',body=text=>text.slice(text.indexOf('as $$')+5,text.lastIndexOf('$$;')).replace(/\r\n/g,'\n').trim();
setLog(path.join(root,'data/temp/crafting-probability-deployment.log'));
const fingerprint=`jsonb_build_object(
 'workspace',(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by owner_id),'')) from public.planner_workspaces t),
 'history',(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by owner_id,revision),'')) from public.planner_workspace_history t),
 'evidence',(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by owner_id,id),'')) from public.planner_crafting_evidence t),
 'consent',(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by owner_id),'')) from public.planner_crafting_consent t),
 'functions',(select md5(coalesce(string_agg(pg_get_functiondef(p.oid),'' order by p.oid),'')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'planner_%' and p.proname<>'planner_crafting_probability_model'))`;
const verification=`reset role;set local statement_timeout='60s';
do $verify$ begin
 if (select value from probability_release_before)<>${fingerprint} then raise exception 'Existing account data or planner functions changed'; end if;
 if has_table_privilege('anon','public.planner_workspaces','select') or has_table_privilege('anon','public.planner_crafting_evidence','select')
  or not has_function_privilege('anon','${signature}','execute') or not has_function_privilege('authenticated','${signature}','execute') then raise exception 'Unexpected report access'; end if;
end $verify$;`;
try{
 const source=sourceEnvironment(),config=fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(config)?.[1];
 if(!project || source.PGUSER!=='postgres.'+project && source.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
 const exists=query(source,`select to_regprocedure('${signature}') is not null`)==='t';
 const original=exists?query(source,`select pg_get_functiondef('${signature}'::regprocedure)`):null;
 if(exists && query(source,`select prosrc from pg_proc where oid='${signature}'::regprocedure`).replace(/\r\n/g,'\n').trim()!==body(sql))throw Error('Existing probability endpoint differs from the reviewed migration.');
 const writable={...source,PGAPPNAME:'planner-probability-release',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'};
 function transaction(commit){return `begin isolation level repeatable read;
 create temporary table probability_release_before on commit drop as select ${fingerprint} value;
 ${sql}
 set local role anon;set local statement_timeout='3s';
 select json_build_object('mainArtifacts',public.planner_crafting_probability_model('main','weapon')->'artifacts','warArtifacts',public.planner_crafting_probability_model('war','weapon')->'artifacts');
 ${verification}
 ${commit?"notify pgrst, 'reload schema';commit;":'rollback;'}`;}
 const rehearsed=query(writable,transaction(false));
 const rehearsal={passed:true,anonymousBudgetSeconds:3,counts:JSON.parse(rehearsed.split(/\r?\n/).find(line=>line.startsWith('{')))};
 let applied=false;
 if(process.argv.includes('--apply')&&!exists){
  const backupOption=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);if(!backupOption)throw Error('Supply a freshly verified --backup=FOLDER before applying.');
  const folder=fs.realpathSync(path.resolve(root,backupOption));if(!folder.startsWith(path.join(root,'data/temp/database-backups')+path.sep))throw Error('Expected a local verified backup folder.');
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
  if(!manifest.restoreVerified || Date.now()-Date.parse(manifest.restoredAt)>3600000)throw Error('A verified backup from the past hour is required.');
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,manifest.archive))).digest('hex')!==manifest.sha256)throw Error('Backup checksum mismatch.');
  fs.writeFileSync(path.join(root,'data/temp/crafting-probability-rollback.sql'),original || `drop function if exists ${signature};\n`);
  query(writable,transaction(true));applied=true;
 }
 const deployed=query(source,`select to_regprocedure('${signature}') is not null`)==='t';
 const report={checkedAt:new Date().toISOString(),migration,sha256:crypto.createHash('sha256').update(sql).digest('hex'),rehearsal,applied,deployed,accountDataModified:false,existingPlannerFunctionsUnchanged:true};
 fs.writeFileSync(path.join(root,'data/temp/crafting-probability-database-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
