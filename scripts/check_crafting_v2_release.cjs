/* Read-only production asset/API checks. No user session or privileged key. */
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const commit=process.argv.find(a=>a.startsWith('--commit='))?.slice(9);
if(!/^[a-f0-9]{7,40}$/i.test(commit || ''))throw Error('Supply --commit=HASH.');
const origin='https://dominations-planner.ededed84.workers.dev';
const files=['scanner.html','collection.html','strategies.css','crafting-stats.html','crafting-stats-tables.js','crafted-log-stats.css','navigation.js','scanner-session.js','profiles-ui.js','config.html','services.js','service-config.js','integration-core.js','cloud.js','cloud-sync.js','research.js','scanner-collection.js','scanner-reading.js','crafted-log-stats.js','crafted-log-stats-ui.js','crafting-history.js','crafting-community.js','crafting-community-ui.js','crafting-result-context.js','crafting-statistics.html','privacy.html','storage-scanner.html','storage-scanner.js','ocr-feedback.js','services-ui.js'];
const changedAssets=cp.execFileSync('git',['diff-tree','--no-commit-id','--name-only','-r',commit],{encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>file.startsWith('ui/')&&/\.(?:html|css|js|json)$/.test(file)).map(file=>file.slice(3));
for(const file of [...changedAssets,'crafting-probability.js','crafting-probability-ui.js','data/crafting_probability_calibration.js','local-artwork-recovery.js','collection-image-recovery.js'])if(!files.includes(file))files.push(file);
(async()=>{
  const checks=[];let config,expectedConfig;
  for(const file of files){
    const response=await fetch(origin+'/'+file+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(20000)}),body=await response.text();
    const expected=cp.execFileSync('git',['show',commit+':ui/'+file],{encoding:'utf8',maxBuffer:10*1024*1024});
    checks.push({file,status:response.status,matchesCommit:response.ok && body.replace(/\r\n/g,'\n')===expected.replace(/\r\n/g,'\n')});
    if(file==='service-config.js'){const context={window:{},location:new URL(origin)},expectedContext={window:{},location:new URL(origin)};vm.runInNewContext(body,context);vm.runInNewContext(expected,expectedContext);config=context.window.DNServiceConfig;expectedConfig=expectedContext.window.DNServiceConfig;}
  }
  if(checks.some(c=>!c.matchesCommit))throw Error('Deployed assets do not all match the release commit. Retry after Cloudflare finishes.');
  if(config.researchEnabled!==expectedConfig.researchEnabled || config.ocrFeedbackEnabled!==expectedConfig.ocrFeedbackEnabled)throw Error('Optional contribution rollout flags differ from the reviewed release.');
  const headers={apikey:config.supabasePublishableKey,'Content-Type':'application/json'};
  const report=await fetch(config.supabaseUrl+'/rest/v1/rpc/planner_crafting_summary',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(20000)});
  const aggregate=await report.json();if(!report.ok || !['ready','insufficient-sample'].includes(aggregate.status))throw Error('Community report is unavailable.');
  if(aggregate.status==='ready' && (!Array.isArray(aggregate.frequencies) || aggregate.frequencies.some(entry=>entry.repeats?.length!==4 || entry.tiers?.length!==3) || aggregate.distributions?.six?.length!==6 || aggregate.distributions?.eleven?.length!==6 || aggregate.distributions?.duplicates?.length!==4))throw Error('Expanded crafting distributions are not deployed.');
  if(Object.hasOwn(aggregate.contexts || {},'version'))throw Error('Obsolete game-version reporting metadata is still present.');
  const empty=await fetch(config.supabaseUrl+'/rest/v1/rpc/planner_crafting_summary',{method:'POST',headers,body:JSON.stringify({p_hall:'__no_matches__'}),signal:AbortSignal.timeout(20000)});
  const emptySample=await empty.json();if(!empty.ok || emptySample.status!=='insufficient-sample' || emptySample.minimumContributors!==1)throw Error('First-contributor threshold is not deployed.');
  const probability=await fetch(config.supabaseUrl+'/rest/v1/rpc/planner_crafting_probability_model',{method:'POST',headers,body:JSON.stringify({p_hall:'main',p_category:'weapon'}),signal:AbortSignal.timeout(20000)});
  const model=await probability.json();if(!probability.ok || model.version!==1 || !Array.isArray(model.perks) || !model.profiles?.event || !model.profiles?.normal)throw Error('Probability model endpoint is unavailable.');
  if(model.artifacts && model.rows!==5*model.artifacts)throw Error('Probability model row denominator is invalid.');
  if(model.perks.some(entry=>Object.keys(entry).some(key=>!['name','rows'].includes(key))))throw Error('Probability model exposed nonaggregate fields.');
  checks.push({probabilityModelAvailable:true,artifacts:model.artifacts,calibration:model.calibration?.id});
  for(const table of ['planner_workspaces','planner_crafting_evidence',...(config.ocrFeedbackEnabled?['planner_ocr_feedback_samples','planner_ocr_feedback_consent','planner_ocr_feedback_operations']:[])]){
    const result=await fetch(config.supabaseUrl+'/rest/v1/'+table+'?select=*&limit=1',{headers,signal:AbortSignal.timeout(20000)});
    if(![401,403].includes(result.status))throw Error('Anonymous private-table access was not denied.');
    checks.push({privateTable:table,anonymousDenied:true,status:result.status});
  }
  const result={checkedAt:new Date().toISOString(),commit,origin,passed:true,checks,researchEnabled:config.researchEnabled,ocrFeedbackEnabled:config.ocrFeedbackEnabled,minimumContributors:1,communityReportStatus:aggregate.status,realGameAcceptance:'pending'};
  fs.writeFileSync('data/temp/crafting-v2-public-release.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
