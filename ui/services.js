/* Optional-service bootstrap. Local planner code never imports a cloud SDK.
 * Failures here are isolated from capture, scoring and local persistence. */
(() => {
  'use strict';
  if(window.DNServicesReady)return;
  const base=new URL('.',document.currentScript.src);
  const loads=new Map();
  function script(path) {
    const url=new URL(path,base).href;
    if(!loads.has(url))loads.set(url,new Promise((resolve,reject)=>{
      const node=document.createElement('script'),timer=setTimeout(()=>{node.remove();reject(Error('Optional service could not load.'));},15000);
      node.src=url;node.async=true;
      node.onload=()=>{clearTimeout(timer);resolve();};node.onerror=()=>{clearTimeout(timer);loads.delete(url);reject(Error('Optional service could not load.'));};
      document.head.appendChild(node);
    }));
    return loads.get(url);
  }
  window.DNServiceLoader={script};
  async function boot() {
    if(!window.DN)return;
    await script('service-config.js?v=20261024-artwork');
    if(!window.DNArtworkIds)await script('data/artwork_ids.js?v=20261024-artwork');
    if(!window.DNCraftingHistory)await script('crafting-history.js?v=20261024-artwork');
    await script('integration-core.js?v=20261024-artwork');
    await script('service-store.js?v=2');
    await script('telemetry.js?v=20261022-ocr-feedback');
    if(!window.DN_ARTIFACT_STAT_CONTEXT)await script('data/artifact_stat_context.js?v=1');
    if(!window.DNCraftedLogStats)await script('crafted-log-stats.js?v=20261025-distributions');
    await script('crafting-community.js?v=20261025-distributions');
    await script('crafting-result-context.js?v=1');
    await Promise.all([script('cloud-sync.js?v=20261023-history-v2'),script('research.js?v=20261023-automatic-v2')]);
    if(!window.DNStoredArtifacts)await script('stored-artifacts.js?v=23');
    if(!window.DNLocalBackupCore)await script('local-backup.js?v=3');
    await script('cloud.js?v=20261024-events-only');
    await script('ocr-feedback.js?v=20261024-ocr-matching');
    await script('services-ui.js?v=20261024-consent-drafts');
    if(document.body.classList.contains('page-crafting-stats')){
      if(!window.DNCraftingStatsTables)await script('crafting-stats-tables.js?v=20261025-distributions');
      await script('crafting-community-ui.js?v=20261025-distributions');
    }
  }
  window.DNServicesReady=new Promise(resolve=>{
    const run=()=>boot().catch(()=>{ /* Optional services cannot break the local application. */ }).finally(resolve);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  });
})();
