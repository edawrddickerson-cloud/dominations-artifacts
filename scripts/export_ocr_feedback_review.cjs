/* Administrator-only structured review export. No account or encounter identifiers. */
const fs=require('node:fs'),path=require('node:path');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
setLog(path.resolve('data/temp/ocr-review-export.log'));
try{
 const rows=JSON.parse(query(sourceEnvironment(),`select coalesce(json_agg(r order by occurrences desc),'[]') from (
 select data->>'kind' kind,data->>'observed_text' observed_text,data->>'matched_name' proposed_name,
 data->>'match_method' match_method,data->>'match_status' match_status,data->>'resolution' resolution,
 data->>'corrected_name' user_correction,data->>'resolved_name' later_or_corrected_name,
 data->>'scanner' scanner,data->>'hall' hall,data->>'category' category,
 count(*) occurrences,count(distinct (owner_id,data->>'encounter')) encounters,
 min(observed_at) first_observed,max(observed_at) last_observed,
 jsonb_agg(distinct jsonb_build_object('position',data->'position','score',data->'match_score','pass',data->'pass','build',data->'app_build','capture',data->'capture_method','conflict',data->'conflict')) provenance
 from public.planner_ocr_feedback_samples where observed_at>=now()-interval '90 days'
 group by data->>'kind',data->>'observed_text',data->>'matched_name',data->>'match_method',data->>'match_status',data->>'resolution',data->>'corrected_name',data->>'resolved_name',data->>'scanner',data->>'hall',data->>'category') r`));
 const output=path.resolve('data/temp/ocr-feedback-review.json');fs.writeFileSync(output,JSON.stringify({exportedAt:new Date().toISOString(),status:'unreviewed-observations',groups:rows},null,2)+'\n');
 console.log('Private review export: '+output+' ('+rows.length+' groups).');
}catch(error){console.error(error.message);process.exitCode=1;}
