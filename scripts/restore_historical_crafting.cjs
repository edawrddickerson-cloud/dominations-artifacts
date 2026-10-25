/* Explicit additive restoration through existing owner-bound RPCs. Rehearse
 * with ROLLBACK by default; --apply commits the reviewed recovery plan. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data/temp/historical-crafting');
const planRaw=fs.readFileSync(path.join(dir,'plan.json'),'utf8'),plan=JSON.parse(planRaw);
const snapshotRaw=fs.readFileSync(path.join(root,'data/temp/historical-crafting-live-snapshot.json'),'utf8'),snapshot=JSON.parse(snapshotRaw);
const before=snapshot.workspaces.find(w=>w.owner_id===plan.owner),consent=snapshot.consent.find(c=>c.owner_id===plan.owner&&c.enabled);
if(!before||!consent||before.revision!==plan.expectedRevision)throw Error('Matching account snapshot and existing community consent required.');
const lit=value=>{const text=typeof value==='string'?value:JSON.stringify(value),tag='$restore_'+crypto.randomBytes(12).toString('hex')+'$';if(text.includes(tag))throw Error('Unexpected delimiter.');return tag+text+tag;};
const q=value=>lit(value)+'::jsonb',owner=lit(plan.owner)+'::uuid';
const apply=process.argv.includes('--apply'),reportPath=path.join(dir,'validation.json');
const digest=crypto.createHash('sha256').update(planRaw).digest('hex');
if(apply){const rehearsal=JSON.parse(fs.readFileSync(reportPath,'utf8'));if(!rehearsal.passed||rehearsal.planSha256!==digest)throw Error('Rehearse this exact plan before committing.');}
// Independent full before-image, retained outside rotating workspace history.
const backup=path.join(dir,'before-restore.json');
if(!fs.existsSync(backup))fs.writeFileSync(backup,snapshotRaw,{flag:'wx'});
else if(fs.readFileSync(backup,'utf8')!==snapshotRaw)throw Error('Existing restore backup belongs to a different snapshot.');
const batches=[];
for(let start=0;start<plan.evidence.length;start+=100){
  const payload={version:2,policy:'2026-10-23',rules:'complete-stats-2026-10-25',records:plan.evidence.slice(start,start+100)};
  if(Buffer.byteLength(JSON.stringify(payload))>240000)throw Error('Contribution batch too large.');
  batches.push(`select public.planner_submit_crafting(${lit(consent.epoch)}::uuid,${q(payload)})->>'accepted';`);
}
const verify=`do $verify$ begin
  if (select revision from public.planner_workspaces where owner_id=${owner})<>${plan.expectedRevision+1} then raise exception 'Revision check failed'; end if;
  if (select data from public.planner_workspaces where owner_id=${owner})<>${q(plan.workspace)} then raise exception 'Workspace verification failed'; end if;
  if (select count(*) from public.planner_crafting_evidence where owner_id=${owner})<>${snapshot.evidence.filter(e=>e.owner_id===plan.owner).length+plan.added} then raise exception 'Evidence count mismatch'; end if;
  if exists(select 1 from jsonb_array_elements(${q(plan.evidence)}) item left join public.planner_crafting_evidence e on e.owner_id=${owner} and e.id=item->>'id' where e.data is distinct from item) then raise exception 'Evidence differs from plan'; end if;
  if exists(select 1 from jsonb_array_elements(${q(snapshot.evidence.filter(e=>e.owner_id===plan.owner))}) prior left join public.planner_crafting_evidence e on e.owner_id=${owner} and e.id=prior->>'id' where to_jsonb(e) is distinct from prior) then raise exception 'Existing evidence changed'; end if;
  if (public.planner_crafting_summary()->>'recorded')::int<>${snapshot.summary.recorded+plan.added}
    or (public.planner_crafting_summary()->>'excluded')::int<>${snapshot.summary.excluded+plan.contribution.excluded}
    then raise exception 'Aggregate totals differ from expected'; end if;
end $verify$;`;
const sql=`begin;
set local lock_timeout='5s';set local statement_timeout='90s';
do $guard$ begin
  if not exists(select 1 from public.planner_workspaces where owner_id=${owner} and revision=${plan.expectedRevision} and data=${q(before.data)}) then raise exception 'Workspace changed; refresh and prepare a new plan'; end if;
  if not exists(select 1 from public.planner_crafting_consent where owner_id=${owner} and enabled and epoch=${lit(consent.epoch)}::uuid) then raise exception 'Consent changed'; end if;
end $guard$;
select set_config('request.jwt.claim.sub',${lit(plan.owner)},true);
set local role authenticated;
select public.planner_save_workspace_v2(${owner},${plan.expectedRevision},${lit(plan.operationId)}::uuid,${q(plan.workspace)})->>'revision';
${batches.join('\n')}
reset role;
${verify}
select json_build_object('recorded',public.planner_crafting_summary()->'recorded','excluded',public.planner_crafting_summary()->'excluded','eligible',(public.planner_crafting_summary()->>'recorded')::int-(public.planner_crafting_summary()->>'excluded')::int);
${apply?'commit':'rollback'};`;
setLog(path.join(dir,'execution.log'));
const env={...sourceEnvironment(),PGAPPNAME:'planner-historical-crafting-restore',PGOPTIONS:'-c timezone=UTC'};
try{
  const output=query(env,sql),aggregate=JSON.parse(output.split(/\r?\n/).find(s=>s.startsWith('{')));
  const report={checkedAt:new Date().toISOString(),passed:true,committed:apply,planSha256:digest,added:plan.added,personalTotal:plan.after.logged,aggregate,originalRecordsUnchanged:true,settingsAndCollectionsUnchanged:true,independentBackup:'data/temp/historical-crafting/before-restore.json'};
  fs.writeFileSync(apply?path.join(dir,'applied.json'):reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
