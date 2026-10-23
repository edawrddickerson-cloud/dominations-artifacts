/* Read-only production asset/API checks. No user session or privileged key. */
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const commit=process.argv.find(a=>a.startsWith('--commit='))?.slice(9);
if(!/^[a-f0-9]{7,40}$/i.test(commit || ''))throw Error('Supply --commit=HASH.');
const origin='https://dominations-planner.ededed84.workers.dev';
const files=['scanner.html','config.html','services.js','service-config.js','integration-core.js','cloud.js','cloud-sync.js','research.js','scanner-collection.js','scanner-reading.js','crafted-log-stats.js','crafted-log-stats-ui.js','crafting-history.js','crafting-community.js','crafting-community-ui.js','crafting-result-context.js','crafting-statistics.html','privacy.html'];
(async()=>{
  const checks=[];let config;
  for(const file of files){
    const response=await fetch(origin+'/'+file+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(20000)}),body=await response.text();
    const expected=cp.execFileSync('git',['show',commit+':ui/'+file],{encoding:'utf8',maxBuffer:10*1024*1024});
    checks.push({file,status:response.status,matchesCommit:response.ok && body.replace(/\r\n/g,'\n')===expected.replace(/\r\n/g,'\n')});
    if(file==='service-config.js'){const context={window:{},location:new URL(origin)};vm.runInNewContext(body,context);config=context.window.DNServiceConfig;}
  }
  if(checks.some(c=>!c.matchesCommit))throw Error('Deployed assets do not all match the release commit. Retry after Cloudflare finishes.');
  if(config.researchEnabled!==false || config.ocrFeedbackEnabled!==false)throw Error('Optional contribution rollout flags changed.');
  const headers={apikey:config.supabasePublishableKey,'Content-Type':'application/json'};
  const report=await fetch(config.supabaseUrl+'/rest/v1/rpc/planner_crafting_report',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(20000)});
  const aggregate=await report.json();if(!report.ok || aggregate.status!=='insufficient-sample')throw Error('Empty community report was not safely suppressed.');
  for(const table of ['planner_workspaces','planner_crafting_evidence']){
    const result=await fetch(config.supabaseUrl+'/rest/v1/'+table+'?select=*&limit=1',{headers,signal:AbortSignal.timeout(20000)});
    if(![401,403].includes(result.status))throw Error('Anonymous private-table access was not denied.');
    checks.push({privateTable:table,anonymousDenied:true,status:result.status});
  }
  const result={checkedAt:new Date().toISOString(),commit,origin,passed:true,checks,researchEnabled:false,ocrFeedbackEnabled:false,communityReportStatus:aggregate.status,realGameAcceptance:'pending'};
  fs.writeFileSync('data/temp/crafting-v2-public-release.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
