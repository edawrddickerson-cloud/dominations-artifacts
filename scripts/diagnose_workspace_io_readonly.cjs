/* Production-safe metadata only. No RPC saves, private values, query text, or OS files. */
const fs=require('node:fs'),path=require('node:path');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..');setLog(path.join(root,'data/temp/disk-io-followup-errors.log'));
const env={...sourceEnvironment(),PGAPPNAME:'planner-readonly-io-followup'};
if(env.PGUSER!=='postgres.gdzfpyrtdhzxvwcxqzdv'&&env.PGHOST!=='db.gdzfpyrtdhzxvwcxqzdv.supabase.co')throw Error('Project mismatch');
const output={checkedAt:new Date().toISOString(),limitations:['No host metrics or provider error-log tool is exposed in this session.','Rollback totals are not error counts. Failed statements may be absent from pg_stat_statements.','Field-size sampling may itself spill; counters are recorded before and after.']};
function read(name,statement){try{const result=query(env,`begin read only;set local statement_timeout='15s';set local lock_timeout='2s';select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb)::text from (${statement}) d;commit;`);output[name]=JSON.parse(result.split(/\r?\n/).find(line=>line.startsWith('[')));}catch(error){output[name]={error:error.message};}console.log(JSON.stringify({section:name,result:output[name]}));fs.writeFileSync(path.join(root,'data/temp/disk-io-followup.json'),JSON.stringify(output,null,2));}
const dbStats=`select now() sampled_at,pg_postmaster_start_time() server_started,stats_reset,temp_bytes,temp_files,xact_commit,xact_rollback,deadlocks,blks_read,blks_hit from pg_stat_database where datname=current_database()`;
read('before',dbStats);
read('statement_epoch',`select * from extensions.pg_stat_statements_info`);
read('temporary_io',`select queryid::text,calls,total_exec_time,mean_exec_time,temp_blks_read,temp_blks_written,wal_bytes,to_jsonb(s)->'stats_since' stats_since,
  query ilike '%explain%' is_explain,query ilike '%jsonb_each%' uses_jsonb_each,query ilike '%jsonb_array_elements%' expands_arrays,
  query ilike '%json_to_record%' parses_rpc,query ilike '%jsonb_path_query%' walks_json,
  query ilike '%planner_save_workspace%' workspace_save,query ilike '%planner_read_workspace%' workspace_read,
  query ilike '%pg_stat%' diagnostic,query ilike '%source: dashboard%' dashboard_tag,
  query ilike 'select%' select_statement,query ilike 'with%' with_statement,
  query ilike '%json_agg%' json_aggregate
  from extensions.pg_stat_statements s where temp_blks_written>0 order by temp_blks_written desc limit 30`);
read('statement_totals',`select count(*) statements,sum(calls) calls,sum(temp_blks_written)*8192 recorded_temp_write_bytes,sum(temp_blks_read)*8192 recorded_temp_read_bytes from extensions.pg_stat_statements`);
read('workspace',`select revision,updated_at,jsonb_array_length(data->'craftingLog'->'items') crafting_items from public.planner_workspaces`);
read('item_field_sizes',`select e.key field,count(*) occurrences,sum(octet_length(e.value::text)) json_bytes from public.planner_workspaces w cross join lateral jsonb_array_elements(w.data->'craftingLog'->'items') i cross join lateral jsonb_each(i) e group by e.key order by json_bytes desc`);
read('row_field_sizes',`select e.key field,count(*) occurrences,sum(octet_length(e.value::text)) json_bytes from public.planner_workspaces w cross join lateral jsonb_array_elements(w.data->'craftingLog'->'items') i cross join lateral jsonb_array_elements(i->'rows') r cross join lateral jsonb_each(r) e group by e.key order by json_bytes desc`);
read('db_settings',`select name,setting from pg_settings where name in ('track_io_timing','track_wal_io_timing','pg_stat_statements.track','logging_collector','log_destination','log_min_messages','log_min_error_statement')`);
read('waits',`select state,wait_event_type,wait_event,count(*) sessions,count(*) filter(where cardinality(pg_blocking_pids(pid))>0) blocked from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() group by state,wait_event_type,wait_event`);
read('cron_outcomes',`select status,count(*) runs,min(start_time) first_seen,max(start_time) last_seen from cron.job_run_details where start_time>now()-interval '7 days' group by status`);
read('after',dbStats);
