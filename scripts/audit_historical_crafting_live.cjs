/* Read-only snapshot for overlap checks. Private payload stays Git-ignored. */
const fs=require('node:fs');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
setLog('data/temp/historical-crafting-readonly.log');
const snapshot=JSON.parse(query(sourceEnvironment(),`select json_build_object(
  'workspaces',(select coalesce(json_agg(json_build_object('owner_id',owner_id,'revision',revision,'data',data)),'[]') from public.planner_workspaces),
  'consent',(select coalesce(json_agg(c),'[]') from public.planner_crafting_consent c),
  'evidence',(select coalesce(json_agg(e),'[]') from public.planner_crafting_evidence e),
  'summary',public.planner_crafting_summary())`));
const target=process.argv.includes('--after')?'data/temp/historical-crafting/after-restore.json':'data/temp/historical-crafting-live-snapshot.json';
fs.writeFileSync(target,JSON.stringify(snapshot));
console.log(JSON.stringify({workspaces:snapshot.workspaces.map(w=>({revision:w.revision,items:w.data.craftingLog?.items?.length,archived:w.data.craftingLog?.ledger?.archived?.length,baseline:w.data.craftingLog?.ledger?.baseline?.counts})),contributors:snapshot.consent.filter(c=>c.enabled).length,evidence:snapshot.evidence.length},null,2));
