/* Administrator review only. Inspect prints live evidence; no raw report file. */
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
const path=require('node:path');
setLog(path.resolve('data/temp/ocr-weekly-review.log'));
try{
 const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');if(i<0)throw Error('Use --key=value arguments.');return [a.slice(2,i),a.slice(i+1)];}));
 if(!/^[a-f0-9-]{36}$/i.test(args.id || ''))throw Error('Supply --id=CANDIDATE_UUID from a weekly report.');
 const quote=s=>s==null?'null':"'"+s.replaceAll("'","''")+"'";
 if(!args.decision){console.log(JSON.stringify(JSON.parse(query(sourceEnvironment(),'select public.planner_inspect_ocr_weekly_candidate('+quote(args.id)+'::uuid)')),null,2));}
 else{
  if(!['approved','rejected','needs-evidence','released'].includes(args.decision) || !args.reference)throw Error('Supply --decision=approved|rejected|needs-evidence|released and --reference=INDEPENDENT_EVIDENCE. Approval also needs --expected=VERIFIED_NAME.');
  const result=query({...sourceEnvironment(),PGOPTIONS:'-c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000'},'select public.planner_review_ocr_weekly_candidate('+[args.id,args.decision,args.reference,args.expected].map(quote).join(',')+')');
  console.log(result);
 }
}catch(e){console.error(e.message);process.exitCode=1;}
