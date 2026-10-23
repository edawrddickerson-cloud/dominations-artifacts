/* Read-only deployed asset comparison; this does not perform game acceptance. */
const fs=require('node:fs'),cp=require('node:child_process');
const commit=process.argv.find(a=>a.startsWith('--commit='))?.slice(9) || 'f2321e9';
if(!/^[a-f0-9]{7,40}$/i.test(commit))throw Error('Use a commit hash.');
const origin='https://dominations-planner.ededed84.workers.dev';
(async()=>{
  const checks=[];
  for(const file of ['scanner.html','scanner-collection.js','scanner-reading.js','crafted-log-stats.js','crafted-log-stats-ui.js']){
    const response=await fetch(origin+'/'+file+'?acceptance='+commit,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    const text=await response.text(),expected=cp.execFileSync('git',['show',commit+':ui/'+file],{encoding:'utf8',maxBuffer:10*1024*1024});
    checks.push({file,status:response.status,matchesCommit:response.ok && text.replace(/\r\n/g,'\n')===expected.replace(/\r\n/g,'\n')});
  }
  const report={checkedAt:new Date().toISOString(),commit,origin,checks,realGameAcceptance:'not verified'};
  fs.mkdirSync('data/temp/crafting-v1-acceptance',{recursive:true});fs.writeFileSync('data/temp/crafting-v1-acceptance/deployment.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(checks.some(c=>!c.matchesCommit))process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
