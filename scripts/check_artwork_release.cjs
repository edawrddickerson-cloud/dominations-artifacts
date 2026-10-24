// Read-only production verification. No user session or privileged credentials.
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process'),vm=require('node:vm');
const commit=process.argv.find(a=>a.startsWith('--commit='))?.slice(9);
if(!/^[a-f0-9]{7,40}$/i.test(commit||''))throw Error('Supply --commit=HASH.');
const origin='https://dominations-planner.ededed84.workers.dev',digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const catalog=JSON.parse(cp.execFileSync('git',['show',commit+':ui/data/artwork_catalog.json'],{encoding:'utf8',maxBuffer:8*1024*1024}));
const files=['scanner.html','storage-scanner.html','collection.html','config.html','artifacts.html','services.js','service-config.js','integration-core.js','crafting-history.js','stored-artifacts.js','scanner-collection.js','scanner-comparison.js','scanner-keep.js','scanner-reading.js','storage-scanner.js','collection.js','artwork.js','artwork-matcher.js','data/artwork_ids.js','data/artwork_catalog.json','assets/artwork/placeholder.svg',...catalog.entries.map(e=>'assets/artwork/'+e.file)];
(async()=>{
 const checks=[];let next=0;
 async function worker(){while(next<files.length){const file=files[next++],binary=/\.(jpg|png)$/.test(file);
  const r=await fetch(origin+'/'+file+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(30000)}),body=Buffer.from(await r.arrayBuffer());
  const expected=cp.execFileSync('git',['show',commit+':ui/'+file],{maxBuffer:8*1024*1024});
  const same=binary?digest(body)===digest(expected):body.toString().replace(/\r\n/g,'\n')===expected.toString().replace(/\r\n/g,'\n');
  checks.push({file,status:r.status,matchesCommit:r.ok&&same});
 }}
 await Promise.all(Array.from({length:6},worker));
 if(checks.some(c=>!c.matchesCommit))throw Error('Deployed files differ: '+checks.filter(c=>!c.matchesCommit).map(c=>c.file).join(', '));
 const context={window:{},location:new URL(origin)};vm.runInNewContext(cp.execFileSync('git',['show',commit+':ui/service-config.js'],{encoding:'utf8'}),context);
 const config=context.window.DNServiceConfig,headers={apikey:config.supabasePublishableKey};
 const r=await fetch(config.supabaseUrl+'/rest/v1/planner_artwork_catalog?select=id&order=id.asc',{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Public approved-ID registry unavailable.');
 const ids=(await r.json()).map(e=>e.id);if(JSON.stringify(ids)!==JSON.stringify(catalog.entries.map(e=>e.id).sort()))throw Error('Published assets and registry differ.');
 const privateRead=await fetch(config.supabaseUrl+'/rest/v1/planner_workspaces?select=owner_id&limit=1',{headers,signal:AbortSignal.timeout(20000)});
 if(![401,403].includes(privateRead.status))throw Error('Anonymous private workspace access was not denied.');
 const report={checkedAt:new Date().toISOString(),commit,origin,passed:true,files:checks.length,approvedImages:ids.length,anonymousWorkspaceDenied:true,artworkMatchingEnabled:config.artworkMatchingEnabled===true,checks};
 if(!report.artworkMatchingEnabled)throw Error('Artwork matching is not enabled.');
 fs.writeFileSync('data/temp/artwork-public-release.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,commit,origin,files:checks.length,approvedImages:ids.length,anonymousWorkspaceDenied:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
