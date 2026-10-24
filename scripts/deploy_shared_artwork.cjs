/* Authorized artwork release. Verify backup, protect existing rows, and apply
 * only the additive reviewed registry/validation migration in one transaction. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/202610240007_shared_artwork.sql'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'ui/data/artwork_catalog.json'),'utf8'));
setLog(path.join(scratch,'artwork-deployment.log'));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
try{
 const env=sourceEnvironment(),project=/supabaseUrl:\s*["']https:\/\/([a-z0-9]+)\.supabase\.co/.exec(fs.readFileSync(path.join(root,'ui/service-config.js'),'utf8'))?.[1];
 if(env.PGUSER!=='postgres.'+project&&env.PGHOST!=='db.'+project+'.supabase.co')throw Error('Database project mismatch.');
 const exists=query(env,"select to_regclass('public.planner_artwork_catalog') is not null")==='t';
 const report={checkedAt:new Date().toISOString(),migrationHash:hash(migration),alreadyPresent:exists};
 if(process.argv.includes('--apply')&&!exists){
  const backup=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);if(!backup)throw Error('Supply a verified backup manifest.');
  const file=fs.realpathSync(path.resolve(root,backup));if(!file.startsWith(path.join(scratch,'database-backups')+path.sep))throw Error('Unexpected backup directory.');
  const m=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!m.restoreVerified||Date.now()-Date.parse(m.createdAt)>3600000||hash(fs.readFileSync(path.join(path.dirname(file),m.archive)))!==m.sha256)throw Error('Recent verified backup required.');
  const protectedTables=JSON.parse(query(env,"select json_agg(tablename order by tablename) from pg_tables where schemaname='public' and tablename like 'planner_%'"));
  const fingerprintSQL="select md5(coalesce(string_agg(row::text,'' order by row::text),'')) from ("+protectedTables.map(t=>"select md5(to_jsonb(t)::text) row from public.\""+t+"\" t").join(' union all ')+") q";
  const before=query(env,fingerprintSQL);
  const checks=`do $$ begin if (select count(*) from public.planner_artwork_catalog)<>${catalog.entries.length} then raise exception 'Artwork registry count mismatch'; end if; if has_table_privilege('authenticated','public.planner_artwork_catalog','insert') then raise exception 'Public catalog write privilege'; end if; if (${fingerprintSQL})<>'${before}' then raise exception 'Existing account data changed'; end if; end $$;`;
  const body=migration.replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,'');
  const writable={...env,PGAPPNAME:'planner-artwork-release',PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'};
  // Rehearse the additive DDL and checks transactionally, leaving no objects.
  query(writable,'begin;\n'+body+'\n'+checks+'\nrollback;');
  report.transactionRehearsalPassed=true;
  query(writable,'begin;\n'+body+'\n'+checks+'\ncommit;');
  report.applied=true;report.existingRowsUnchanged=before===query(env,fingerprintSQL);report.backup=path.relative(root,file);
 }
 if(exists||report.applied){
  const actual=JSON.parse(query(env,"select json_agg(id order by id) from public.planner_artwork_catalog"));
  if(JSON.stringify(actual)!==JSON.stringify(catalog.entries.map(e=>e.id).sort()))throw Error('Deployed artwork IDs differ from reviewed assets.');
  const security=JSON.parse(query(env,"select json_build_object('rowSecurity',(select relrowsecurity from pg_class where oid='public.planner_artwork_catalog'::regclass),'directWriteDenied',not has_table_privilege('authenticated','public.planner_artwork_catalog','insert'),'triggerActive',exists(select 1 from pg_trigger where tgrelid='public.planner_workspaces'::regclass and tgname='planner_workspace_artwork' and tgenabled='O'))"));
  if(!Object.values(security).every(Boolean))throw Error('Artwork isolation checks failed.');
  report.security=security;report.approvedImages=actual.length;
 }
 fs.writeFileSync(path.join(scratch,'artwork-deployment.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
