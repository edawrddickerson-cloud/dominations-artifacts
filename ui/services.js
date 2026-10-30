/* Optional-service bootstrap. Local planner code never imports a cloud SDK.
 * Failures here are isolated from capture, scoring and local persistence. */
(() => {
  'use strict';
  if(window.DNServicesReady)return;
  const base=new URL('.',document.currentScript.src);
  const loads=new Map();
  const preloads=new Set();
  function preload(path,as='script') {
    const url=new URL(path,base).href;
    if(preloads.has(url))return;
    preloads.add(url);
    const node=document.createElement('link');node.rel='preload';node.as=as;node.href=url;
    document.head.appendChild(node);
  }
  function script(path) {
    const url=new URL(path,base).href;
    if(!loads.has(url))loads.set(url,new Promise((resolve,reject)=>{
      let settled=false;
      const failed=()=>{if(settled)return;settled=true;clearTimeout(timer);node.remove();loads.delete(url);reject(Error('Optional service could not load.'));};
      const node=document.createElement('script'),timer=setTimeout(failed,15000);
      node.src=url;node.async=true;
      node.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();};node.onerror=failed;
      document.head.appendChild(node);
    }));
    return loads.get(url);
  }
  window.DNServiceLoader={script};
  async function boot() {
    if(!window.DN)return;
    // Fetch later dependencies now, but execute them only after their owners.
    // This removes serial round trips without racing classic-script globals.
    for(const path of ['service-config.js?v=20261025-probability-release','integration-core.js?v=20261024-artwork',
      'service-store.js?v=2','local-artwork-recovery.js?v=20261025-image-recovery','consent.js?v=1',
      'crafting-community.js?v=20261025-inferred','crafting-result-context.js?v=1',
      'cloud-sync.js?v=20261025-reviewed-choice','workspace-records.js?v=20261030-records','cloud-record-transport.js?v=20261030-records','research.js?v=20261023-automatic-v2',
      'cloud.js?v=20261025-save-timeout','ocr-feedback.js?v=20261024-ocr-matching','services-ui.js?v=20261025-slate'])preload(path);
    for(const [present,path] of [[window.DNArtworkIds,'data/artwork_ids.js?v=20261024-artwork'],
      [window.DNCraftingHistory,'crafting-history.js?v=20261024-artwork'],[window.DN_ARTIFACT_STAT_CONTEXT,'data/artifact_stat_context.js?v=1'],
      [window.DNCraftedLogStats,'crafted-log-stats.js?v=20261025-tiers'],[window.DNStoredArtifacts,'stored-artifacts.js?v=20261025-image-recovery'],
      [window.DNLocalBackupCore,'local-backup.js?v=3']])if(!present)preload(path);
    preload('services.css?v=20261025-slate','style');
    await Promise.all([
      script('service-config.js?v=20261025-probability-release'),script('integration-core.js?v=20261024-artwork'),
      script('service-store.js?v=2'),script('local-artwork-recovery.js?v=20261025-image-recovery'),
      !window.DNArtworkIds && script('data/artwork_ids.js?v=20261024-artwork'),
      !window.DNCraftingHistory && script('crafting-history.js?v=20261024-artwork'),
      !window.DN_ARTIFACT_STAT_CONTEXT && script('data/artifact_stat_context.js?v=1'),
      !window.DNStoredArtifacts && script('stored-artifacts.js?v=20261025-image-recovery')
    ]);
    await Promise.all([script('consent.js?v=1'),script('cloud-sync.js?v=20261025-reviewed-choice'),
      !window.DNCraftedLogStats && script('crafted-log-stats.js?v=20261025-tiers'),
      !window.DNLocalBackupCore && script('local-backup.js?v=3')]);
    // Analytics has its own readiness promise and cannot hold up account UI.
    window.DNTelemetryReady=script('telemetry.js?v=20261022-ocr-feedback').catch(()=>{});
    await Promise.all([script('crafting-community.js?v=20261025-inferred'),script('crafting-result-context.js?v=1')]);
    await script('workspace-records.js?v=20261030-records');
    await script('cloud-record-transport.js?v=20261030-records');
    await script('research.js?v=20261023-automatic-v2');
    await script('cloud.js?v=20261025-save-timeout');
    await script('ocr-feedback.js?v=20261024-ocr-matching');
    await script('services-ui.js?v=20261025-slate');
    if(document.body.classList.contains('page-crafting-stats')){
      if(!window.DNCraftingStatsTables)await script('crafting-stats-tables.js?v=20261025-page-filters');
      await script('crafting-community-ui.js?v=20261025-page-filters');
    }
  }
  window.DNServicesReady=new Promise(resolve=>{
    const run=()=>boot().catch(()=>{ /* Optional services cannot break the local application. */ }).finally(resolve);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  });
})();
