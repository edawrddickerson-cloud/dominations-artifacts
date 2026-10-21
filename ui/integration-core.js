/* Authority: Approved persistence/telemetry brief and simplified first release.
 * Ownership: Pure workspace serialization, conflict decisions and consent.
 * Invariants: No scoring, OCR or networking; no screenshots, auth or consent in
 * cloud workspaces. Unknown schema versions fail before any local mutation. */
(() => {
  'use strict';
  const VERSION=1,POLICY='2026-10-18',MAX_BYTES=16*1024*1024;
  const globals=new Set(['dn-profiles','dn-artifact-perk-ratings-global','dn-perk-ratings-layer-migrated','dn_perk_group_defaults_v1','dn-general-ratings-2026-10-16']);
  const profileKeys=new Set(['dn-artifact-collected','dn-artifact-loadout','dn-artifact-perk-levels','dn-artifact-perk-edits','dn-artifact-collection-ui','dn-army-presets','dn-strategies','dn-crafting-purposes','dn-artifact-ranking-targets','dn-artifact-perk-ratings','dn-artifact-pref-sort-axes','dn-artifact-hide-collected','dn-artifact-score-mode','dn-artifact-hall-filter','dn-artifact-grade-filter','dn-artifact-perk-match-mode','dn-council-owned','dn-council-active','dn-council-stat-ratings','dn-council-ui','dn-council-pref-sort-axes','dn-council-hide-owned','dn-council-score-mode']);
  const forbidden=new Set(['__proto__','prototype','constructor','image','artwork','screenshot','screenshots','frame','frames','canvas','raw','rawType','observations','percentageReads','samples','access_token','refresh_token','authorization','api_key']);
  function clean(value,depth=0) {
    if(depth>20)throw Error('Workspace data is nested too deeply.');
    if(typeof value==='string')return /^data:|^blob:/i.test(value)?null:value;
    if(value===null || typeof value==='boolean' || typeof value==='number' && Number.isFinite(value))return value;
    if(Array.isArray(value))return value.map(v=>clean(v,depth+1));
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!forbidden.has(key)).map(([key,v])=>[key,clean(v,depth+1)]));
    return null;
  }
  function isSyncedSetting(key) {
    if(globals.has(key))return true;
    if(/^dn-primary-filters:[^:]+$/.test(key))return true;
    const match=/^dn-p:([^:]+):(.+)$/.exec(key);
    return !!match && (profileKeys.has(match[2]) || /^dn-scanner-artifact-type:[^:]+:(main|war)$/.test(match[2]));
  }
  function settingsSnapshot(storage) {
    const out={};
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if(isSyncedSetting(key))out[key]=storage.getItem(key);
    }
    return out;
  }
  function sanitizeItem(item) {
    // Preserve structured perk attributes, including range candidates and
    // provenance added by newer local readers. Redact pixels and raw OCR at
    // every depth, including historical revisions and recognition metadata.
    return clean(item);
  }
  function validate(workspace) {
    const fail=()=>{throw Error('Unsupported or invalid cloud workspace. Local data was left unchanged.');};
    if(workspace?.kind!=='dominations-cloud-workspace' || workspace.version!==VERSION || workspace.game!=='dominations' || !workspace.settings || typeof workspace.settings!=='object' || Array.isArray(workspace.settings) || !Array.isArray(workspace.records))fail();
    for(const [key,value] of Object.entries(workspace.settings))if(!isSyncedSetting(key) || typeof value!=='string')fail();
    let profiles;
    try {profiles=JSON.parse(workspace.settings['dn-profiles']);}catch{fail();}
    if(!Array.isArray(profiles?.profiles) || !profiles.profiles.length || profiles.profiles.some(p=>typeof p.id!=='string' || !p.id || p.id.includes(':') || typeof p.name!=='string'))fail();
    const ids=new Set(profiles.profiles.map(p=>p.id));
    if(ids.size!==profiles.profiles.length || !ids.has(profiles.activeId))fail();
    const records=new Set();
    for(const record of workspace.records) {
      if(!record || typeof record.id!=='string' || records.has(record.id) || (record.id!=='items' && (!record.id.startsWith('collection:') || !ids.has(record.id.slice(11)))) || !Array.isArray(record.items))fail();
      records.add(record.id);
      const items=new Set();
      for(const item of record.items) {
        if(!item || typeof item.id!=='string' || items.has(item.id) || typeof item.name!=='string' || typeof item.type!=='string' || !['main','war'].includes(item.hall) || !Array.isArray(item.rows) || item.rows.length<1 || item.rows.length>6)fail();
        items.add(item.id);
        for(const row of item.rows)if(!row || typeof row.name!=='string' || !Number.isFinite(row.value))fail();
      }
    }
    if(!records.has('items') || [...ids].some(id=>!records.has('collection:'+id)))fail();
    if(new TextEncoder().encode(JSON.stringify(workspace)).length>MAX_BYTES)throw Error('This workspace exceeds the 16 MB cloud limit. Your complete data is still saved locally; export a backup.');
    return workspace;
  }
  function createWorkspace(settings,records) {
    const safeSettings=Object.fromEntries(Object.entries(settings).map(([key,value])=>{
      try{return [key,JSON.stringify(clean(JSON.parse(value)))];}catch{return [key,value];}
    }));
    // JSON normalization also makes hashes match PostgreSQL after transmission.
    return validate(JSON.parse(JSON.stringify({kind:'dominations-cloud-workspace',version:VERSION,game:'dominations',settings:safeSettings,records:records.filter(record=>record.id==='items' || record.id.startsWith('collection:')).map(record=>({id:record.id,items:record.items.map(sanitizeItem)}))})));
  }
  function canonical(value) {
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  async function fingerprint(workspace) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(workspace))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  function decision({boundOwner,owner,baseHash,localHash,remoteHash}) {
    if(!owner)return 'signed-out';
    if(boundOwner!==owner)return 'unlinked';
    if(localHash===remoteHash)return 'synced';
    if(!remoteHash)return baseHash?'conflict':'upload';
    if(!baseHash)return 'conflict';
    if(localHash===baseHash)return 'remote';
    if(remoteHash===baseHash)return 'upload';
    return 'conflict';
  }
  function consent(storage) {
    try {
      const value=JSON.parse(storage.getItem('dn_service_consent') || 'null');
      if(value?.policy===POLICY)return {policy:POLICY,analytics:value.analytics===true,diagnostics:value.diagnostics===true,research:value.research===true,decided:true};
    }catch{ /* Unavailable or invalid storage defaults to no optional collection. */ }
    return {policy:POLICY,analytics:false,diagnostics:false,research:false,decided:false};
  }
  function setConsent(storage,value) {
    const next={policy:POLICY,analytics:value.analytics===true,diagnostics:value.diagnostics===true,research:value.research===true,decided:true};
    storage.setItem('dn_service_consent',JSON.stringify(next));
    return next;
  }
  const privacyReady=config=>config?.privacyReady===true && typeof config.privacyContact==='string' && config.privacyContact.trim().length>0;
  const researchReady=config=>privacyReady(config) && config.researchEnabled===true;
  const cloudReady=(config,origin)=>!!config?.supabaseUrl && !!config.supabasePublishableKey &&
    (config.cloudEnabled===true && privacyReady(config) || config.localCloudTesting===true && config.environment==='development' && origin==='http://127.0.0.1:8765');
  window.DNIntegrationCore={VERSION,POLICY,MAX_BYTES,isSyncedSetting,settingsSnapshot,sanitizeItem,createWorkspace,validate,canonical,fingerprint,decision,consent,setConsent,privacyReady,researchReady,cloudReady};
})();
