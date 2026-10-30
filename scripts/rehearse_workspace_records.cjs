/* Invoked only inside the backup helper's fresh loopback restore. All candidate
 * DDL, account conversion and sparse writes roll back in one SQL transaction. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
function rehearse({local,query,root}) {
  if(local.PGHOST!=='127.0.0.1' || local.PGAPPNAME!=='planner-local-restore')throw Error('Record rehearsal requires the isolated restore.');
  const migration='supabase/migrations/202610300003_workspace_records.sql',source=fs.readFileSync(path.join(root,migration),'utf8');
  const original=JSON.parse(query(local,"select json_build_object('owner',owner_id,'revision',revision,'data',data) from public.planner_workspaces order by owner_id limit 1"));
  if(!/^[a-f0-9-]{36}$/.test(original.owner))throw Error('Restored workspace required.');
  const app={window:{},TextEncoder,crypto:crypto.webcrypto};vm.createContext(app);
  for(const name of ['crafting-history','integration-core','workspace-records'])vm.runInContext(fs.readFileSync(path.join(root,'ui',name+'.js'),'utf8'),app);
  app.window.DNArtworkIds=JSON.parse(fs.readFileSync(path.join(root,'ui/data/artwork_catalog.json'),'utf8')).entries.map(entry=>entry.id);
  const R=app.window.DNWorkspaceRecords,C=app.window.DNIntegrationCore,next=JSON.parse(JSON.stringify(original.data));
  if(next.craftingLog?.items?.length)next.craftingLog.items[0].writer='isolated-record-rehearsal';
  else {const profiles=JSON.parse(next.settings['dn-profiles']);profiles.profiles[0].name+=' rehearsal';next.settings['dn-profiles']=JSON.stringify(profiles);}
  const changes=JSON.parse(JSON.stringify(R.changes(R.rows(next),R.rows(original.data))));
  if(changes.length!==1)throw Error('Rehearsal sparse change was not one record.');
  const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb",operation=crypto.randomUUID();
  const pages=(label,revision)=>`do $pages$ declare cursor jsonb:=null;page jsonb;begin loop
    page:=public.planner_records_page('${original.owner}',${revision},null,cursor,128,524288);
    insert into pg_temp.record_rehearsal_pages values('${label}',page);
    exit when (page->>'complete')::boolean;cursor:=page->'next';end loop;end $pages$;`;
  const sql=`begin;set local statement_timeout='120s';
    ${source.replace(/^begin;\r?$/gm,'').replace(/^commit;\r?$/gm,'')}
    create temp table record_rehearsal_pages(label text,payload jsonb) on commit drop;
    grant select,insert on pg_temp.record_rehearsal_pages to authenticated;
    set local role authenticated;select set_config('request.jwt.claim.sub','${original.owner}',true);
    select public.planner_records_activate('${original.owner}',${original.revision});
    ${pages('before',original.revision)}
    select public.planner_records_stage('${original.owner}',${original.revision},'${operation}',0,1,${literal(changes)});
    do $retry$ declare a jsonb;b jsonb;begin
      a:=public.planner_records_commit('${original.owner}',${original.revision},'${operation}');
      b:=public.planner_records_commit('${original.owner}',${original.revision},'${operation}');
      if a<>b or (a->>'revision')::bigint<>${original.revision+1} then raise exception 'Record retry mismatch';end if;
      begin perform public.planner_records_stage('${original.owner}',${original.revision},'${operation}',0,1,'[]'::jsonb);raise exception 'Altered record retry accepted';exception when invalid_parameter_value then null;end;
    end $retry$;
    ${pages('after',original.revision+1)}
    reset role;
    select json_build_object('recordRehearsal',label,'page',payload) from pg_temp.record_rehearsal_pages;
    select json_build_object('recordStorage',json_build_object(
      'normalizedTableAndIndexBytes',(select sum(pg_total_relation_size(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'planner_record_%'),
      'retainedLegacyTableAndIndexBytes',pg_total_relation_size('public.planner_workspaces')+pg_total_relation_size('public.planner_workspace_history')));
    rollback;`;
  const parsed=query(local,sql).split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  const output=parsed.filter(row=>row.recordRehearsal);
  for(const [label,expected] of [['before',original.data],['after',next]]) {
    const records=output.filter(row=>row.recordRehearsal===label).flatMap(row=>row.page.records);
    if(C.canonical(R.workspace(records))!==C.canonical(expected))throw Error('Restored record workspace mismatch: '+label);
  }
  return {migration,sha256:crypto.createHash('sha256').update(source).digest('hex'),actualRestoredWorkspace:true,losslessConversion:true,sparseSave:true,strictRetry:true,rolledBack:true,pages:output.length,storage:parsed.find(row=>row.recordStorage)?.recordStorage};
}
module.exports={rehearse};
