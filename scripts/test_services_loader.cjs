/* Exercise real loader dependency ordering, network stalls and retry cleanup. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui/services.js','utf8');
function harness({fail,statistics=false,present=false}={}) {
  const nodes=[],timers=new Map(),executed=[],globals={DN:{}},events={};let nextTimer=0;
  if(present)Object.assign(globals,{DNArtworkIds:[],DNCraftingHistory:{},DN_ARTIFACT_STAT_CONTEXT:{},DNCraftedLogStats:{},DNStoredArtifacts:{},DNLocalBackupCore:{}});
  const owners={'service-config.js':'DNServiceConfig','integration-core.js':'DNIntegrationCore','service-store.js':'DNServiceStore',
    'artwork_ids.js':'DNArtworkIds','crafting-history.js':'DNCraftingHistory','artifact_stat_context.js':'DN_ARTIFACT_STAT_CONTEXT',
    'stored-artifacts.js':'DNStoredArtifacts','consent.js':'DNConsent','cloud-sync.js':'DNCloudSyncCore','crafted-log-stats.js':'DNCraftedLogStats',
    'local-backup.js':'DNLocalBackupCore','crafting-community.js':'DNCraftingCommunity','research.js':'DNResearch',
    'cloud.js':'DNCloud','ocr-feedback.js':'DNOCRFeedback','services-ui.js':'DNServiceUI','telemetry.js':'DNTelemetry','crafting-stats-tables.js':'DNCraftingStatsTables'};
  const prerequisites={'consent.js':['DNServiceConfig','DNIntegrationCore'],'crafted-log-stats.js':['DN_ARTIFACT_STAT_CONTEXT'],
    'local-backup.js':['DNStoredArtifacts'],'cloud-sync.js':['DNIntegrationCore'],'telemetry.js':['DNConsent','DNIntegrationCore'],
    'crafting-community.js':['DNCraftedLogStats','DNCraftingHistory'],'research.js':['DNConsent','DNServiceStore','DNCraftingCommunity'],
    'cloud.js':['DNResearch','DNConsent','DNCloudSyncCore','DNLocalBackupCore','DNStoredArtifacts','DNCraftingHistory','DNArtworkIds'],
    'ocr-feedback.js':['DNCloud','DNConsent'],'services-ui.js':['DNCloud','DNConsent','DNOCRFeedback'],
    'crafting-community-ui.js':['DNResearch','DNCraftingStatsTables']};
  function finish(node) {
    const file=new URL(node.src).pathname.split('/').pop();
    if(file===fail){node.onerror();return;}
    for(const name of prerequisites[file] || [])assert.ok(globals[name],`${file} ran before ${name}`);
    if(owners[file])globals[owners[file]]={};executed.push(file);node.onload();
  }
  const document={readyState:'loading',currentScript:{src:'https://planner.example/static/release/services.js'},
    body:{classList:{contains:value=>statistics && value==='page-crafting-stats'}},
    addEventListener:(event,callback)=>events[event]=callback,
    createElement:tag=>({tag,remove(){this.removed=true;}}),
    head:{appendChild(node){nodes.push(node);if(node.tag==='script' && !node.src.includes('telemetry.js') && !node.src.includes('retry.js'))queueMicrotask(()=>finish(node));}}};
  const context={window:globals,document,URL,Promise,Map,Set,Error,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,context);
  return {globals,nodes,timers,executed,start:()=>events.DOMContentLoaded(),finish};
}
(async()=>{
  const h=harness({statistics:true});assert.equal(h.nodes.length,0,'optional work waits for the local document');h.start();
  await h.globals.DNServicesReady;
  assert.ok(h.globals.DNServiceUI,'account UI becomes ready while telemetry is stalled');
  assert.ok(h.globals.DNCraftingStatsTables,'statistics dependencies remain available');
  assert.ok(!h.globals.DNTelemetry,'telemetry was deliberately held');
  const scripts=h.nodes.filter(n=>n.tag==='script');
  assert.equal(new Set(scripts.map(n=>n.src)).size,scripts.length,'no duplicate script requests');
  for(const node of scripts.filter(n=>!n.src.includes('telemetry.js') && !n.src.includes('crafting-stats-tables') && !n.src.includes('crafting-community-ui')))
    assert.ok(h.nodes.some(n=>n.tag==='link' && n.href===node.src),'dependency fetches are preloaded');
  assert.ok(h.nodes.some(n=>n.as==='style' && n.href.endsWith('services.css?v=20261025-slate')),'account stylesheet fetched early');
  const telemetry=scripts.find(n=>n.src.includes('telemetry.js'));telemetry.onerror();await h.globals.DNTelemetryReady;
  assert.ok(h.globals.DNServiceUI,'failed telemetry leaves account controls available');
  const first=h.globals.DNServiceLoader.script('retry.js'),same=h.globals.DNServiceLoader.script('retry.js');
  assert.equal(first,same,'concurrent loads share one promise');
  const staleNode=h.nodes.at(-1);
  const rejected=assert.rejects(first,/could not load/);[...h.timers.values()].at(-1)();await rejected;
  const retry=h.globals.DNServiceLoader.script('retry.js');assert.notEqual(first,retry,'timeouts release the failed cache entry');
  staleNode.onerror();assert.equal(h.globals.DNServiceLoader.script('retry.js'),retry,'late errors cannot evict a newer retry');
  h.nodes.at(-1).onload();await retry;
  const ready=harness({present:true});ready.start();await ready.globals.DNServicesReady;
  assert.ok(!ready.nodes.some(n=>n.src?.includes('crafting-history.js')),'already mounted owners are reused');
  ready.nodes.find(n=>n.src?.includes('telemetry.js')).onerror();await ready.globals.DNTelemetryReady;
  const failed=harness({fail:'service-config.js'});failed.start();await failed.globals.DNServicesReady;
  assert.ok(!failed.globals.DNServiceUI,'foundation failure is isolated from the local planner');
  console.log('Services loader: parallel fetches, dependency order, existing owners, analytics failure isolation and timeout retries passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
