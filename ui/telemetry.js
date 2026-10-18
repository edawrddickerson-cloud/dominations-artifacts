/* Authority: Approved early, optional product analytics and diagnostics.
 * Ownership: Explicit PostHog Capture API events and purpose-specific consent.
 * Invariants: No autocapture/replay, SDK cookies, screenshots, OCR text, user names
 * or auth URLs. No optional data is queued before consent or retried offline. */
(() => {
  'use strict';
  const C=window.DNIntegrationCore,config=window.DNServiceConfig;
  const listeners=new Set(),pending=new Set(),requests=new Set(),attempts=new Map(),seen=new Set();
  let preferences=C.consent(localStorage),owner=null,lastActivity=0,activeSince=0,lastTick=Date.now();
  const page=(location.pathname.split('/').pop() || '').replace('.html','');
  const pages=new Set(['army','artifacts','collection','totals','ratings','council','council-collection','council-ratings','config','scanner','storage-scanner']);
  const definitions={
    '$pageview':[],feature_used:['feature'],onboarding_step_completed:['step'],
    artifact_saved:['source','action','count'],artifact_updated:['source'],artifact_deleted:['source'],
    museum_configuration_saved:[],strategy_saved:[],strategy_used:['unit_count'],
    scanner_session_started:['source'],scan_encounter_recorded:['source','complete','row_count','inferred_count','corrected'],
    scanner_fields_corrected:['source','count'],
    active_time_recorded:['seconds'],scanner_attempt_finished:['source','outcome','duration_ms','ocr_ms','worker_calls','inferred_count','corrected_count','sample_rate'],
    capture_failed:['reason'],cloud_sync_failed:['reason'],
    '$exception':['$exception_list','$exception_fingerprint','$exception_level','error_tag'],
  };
  const diagnostic=new Set(['scanner_attempt_finished','scanner_fields_corrected','capture_failed','cloud_sync_failed','$exception']);
  const failures=new Map();
  const storageRead=key=>{try{return JSON.parse(localStorage.getItem(key) || 'null');}catch{return null;}};
  const storageWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{ /* No optional persistence when storage is unavailable. */ }};
  let fallbackSession=null;
  function session(activity=true) {
    const now=Date.now();let value=storageRead('dn_telemetry_session') || fallbackSession;
    if(!value || activity && now-value.last>30*60*1000 || now-value.started>24*60*60*1000)value={id:crypto.randomUUID(),started:now,last:now,sampled:Math.random()<config.diagnosticsSampleRate};
    if(activity)value.last=now;
    fallbackSession=value;storageWrite('dn_telemetry_session',value);return value;
  }
  function distinct(category,current) {
    if(preferences.analytics) {
      if(owner)return 'u:'+owner;
      let id=storageRead('dn_telemetry_id');
      if(typeof id!=='string'){id='a:'+crypto.randomUUID();storageWrite('dn_telemetry_id',id);}
      return id;
    }
    return 'd:'+current.id;
  }
  function permitted(name) {
    return !!definitions[name] && C.privacyReady(config) && !!config.posthogToken && (diagnostic.has(name)?preferences.diagnostics:preferences.analytics);
  }
  function cleanProperties(name,values) {
    const out={};
    for(const key of definitions[name] || []) {
      const value=values[key];
      if(key==='$exception_list' && Array.isArray(value)){out[key]=value;continue;}
      if(typeof value==='boolean' || typeof value==='number' && Number.isFinite(value))out[key]=value;
      else if(typeof value==='string' && value.length<=100 && /^[a-z0-9_:+. -]+$/i.test(value))out[key]=value;
    }
    return out;
  }
  function browser() {
    const ua=navigator.userAgent || '';
    return /Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
  }
  function event(name,properties={},meaningful=false) {
    if(!permitted(name))return false;
    if(name==='capture_failed' || name==='cloud_sync_failed') {
      const key=name+':'+properties.reason,now=Date.now();if(now-(failures.get(key) || 0)<60000)return false;
      failures.set(key,now);
    }
    if(meaningful && !document.hidden){const now=Date.now();if(!lastActivity || now-lastActivity>=60000)activeSince=now;lastActivity=now;}
    if(navigator.onLine===false || pending.size>=100)return false;
    const allowed=cleanProperties(name,properties),current=session(!diagnostic.has(name));
    const payload={api_key:config.posthogToken,event:name,timestamp:new Date().toISOString(),properties:{...allowed,
      distinct_id:distinct(diagnostic.has(name)?'diagnostics':'analytics',current),$session_id:current.id,$insert_id:crypto.randomUUID(),
      $process_person_profile:!!owner && preferences.analytics,$geoip_disable:true,$ip:null,
      event_schema:1,app_build:config.build,environment:config.environment,page:pages.has(page)?page:'other',
      identity_kind:preferences.analytics?(owner?'account':'local-browser'):'diagnostic-session',
      browser_family:browser(),device_class:/Mobi|Android/i.test(navigator.userAgent || '')?'mobile':'desktop',viewport_bucket:innerWidth<640?'small':innerWidth<1200?'medium':'large'}};
    const timer=setTimeout(()=>{
      pending.delete(timer);
      if(!permitted(name) || navigator.onLine===false)return;
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);requests.add(controller);
      // Capture API is deliberately used without browser autocapture defaults.
      // text/plain avoids a CORS preflight; the endpoint accepts JSON bodies.
      fetch(config.posthogHost.replace(/\/$/,'')+'/i/v0/e/',{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'text/plain'},credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal})
        .catch(()=>{}).finally(()=>{clearTimeout(timeout);requests.delete(controller);});
    },0);
    pending.add(timer);return true;
  }
  function cancelPending() {
    for(const timer of pending)clearTimeout(timer);pending.clear();
    for(const controller of requests)controller.abort();requests.clear();attempts.clear();seen.clear();fallbackSession=null;
    for(const key of ['dn_telemetry_session','dn_telemetry_id'])try{localStorage.removeItem(key);}catch{}
  }
  function changed(next) {
    cancelPending();preferences=next;lastActivity=0;activeSince=0;lastTick=Date.now();
    for(const listener of listeners)try{listener({...preferences})?.catch?.(()=>{});}catch{}
    if(preferences.analytics)event('$pageview');
  }
  window.DNConsent={get:()=>({...preferences}),set(value){if((value.analytics || value.diagnostics || value.research) && !C.privacyReady(config))throw Error('Optional sharing is not available in this version.');if(value.research && !C.researchReady(config))throw Error('Research sharing is not available in this version.');const next=C.setConsent(localStorage,value);changed(next);return next;},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
  window.addEventListener('storage',e=>{if(e.key==='dn_service_consent')changed(C.consent(localStorage));});
  function milestone(step) {
    if(!permitted('onboarding_step_completed'))return;
    const values=storageRead('dn_telemetry_milestones') || {};
    if(!values[step]){values[step]=true;storageWrite('dn_telemetry_milestones',values);event('onboarding_step_completed',{step});}
  }
  function scannerStage({stage,time,session:sessionId,itemId,request,source}) {
    if(!permitted('scanner_attempt_finished'))return;
    const key=JSON.stringify([sessionId,itemId,request]);
    if(stage==='read-start' || stage==='speculation-start') {
      if(attempts.size>64)attempts.delete(attempts.keys().next().value);
      attempts.set(key,{start:time,source,sampled:session(false).sampled});
    }
    const attempt=attempts.get(key);if(!attempt)return;
    if(stage==='ocr-start')attempt.ocrStart=time;
    if(stage==='ocr-end')attempt.ocrEnd=time;
  }
  function scannerFinished(info) {
    const key=JSON.stringify([info.session,info.itemId,info.request]),attempt=attempts.get(key);attempts.delete(key);
    if(!attempt?.sampled)return;
    event('scanner_attempt_finished',{source:info.source,outcome:info.outcome,duration_ms:Math.max(0,Math.round(info.time-attempt.start)),
      ocr_ms:attempt.ocrEnd==null?undefined:Math.max(0,Math.round(attempt.ocrEnd-attempt.ocrStart)),worker_calls:info.workerCalls,
      inferred_count:info.inferredCount,corrected_count:info.correctedCount || 0,sample_rate:config.diagnosticsSampleRate});
  }
  function scannerResult(result,{source,encounterId,corrected=false}) {
    const key=source+':'+encounterId;
    if(seen.has(key))return;
    if(seen.size>=10000)seen.delete(seen.keys().next().value);seen.add(key);
    event('scan_encounter_recorded',{source,complete:!!result?.valid,row_count:result?.rows?.length || 0,
      inferred_count:(result?.rows || []).filter(row=>row.inferred || row.assumed).length,corrected},true);
  }
  let errorsAt=0,errorCount=0;
  function exception(error,tag='client-error') {
    if(!permitted('$exception'))return;
    const now=Date.now();if(now-errorsAt>60000){errorsAt=now;errorCount=0;}if(++errorCount>10)return;
    const frames=[];
    for(const line of String(error?.stack || '').split('\n').slice(1,21)) {
      const match=line.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);if(!match)continue;
      try {
        const url=new URL(match[1]);if(url.origin!==location.origin)continue;
        const file=url.pathname.split('/').pop();if(!/^[a-z0-9-]+\.js$/i.test(file))continue;
        frames.push({filename:file,abs_path:location.origin+url.pathname,lineno:Number(match[2]),colno:Number(match[3]),in_app:true});
      }catch{}
    }
    const type=['Error','TypeError','RangeError','ReferenceError','SyntaxError','DOMException'].includes(error?.name)?error.name:'Error';
    event('$exception',{$exception_list:[{type,value:tag,stacktrace:{frames:frames.reverse()},mechanism:{type:'generic',handled:tag!=='client-error'}}],
      $exception_fingerprint:type+':'+tag+':'+(frames.at(-1)?.filename || 'unknown')+':'+(frames.at(-1)?.lineno || 0),$exception_level:'error',error_tag:tag});
  }
  window.DNTelemetry={event,exception,scannerStage,scannerFinished,scannerResult,milestone,
    setOwner(id){if(owner!==id){cancelPending();owner=id || null;lastActivity=0;activeSince=0;}},
    analyticsId(){return permitted('$pageview')?distinct('analytics',session(false)):null;}};
  window.addEventListener('error',e=>exception(e.error));
  window.addEventListener('unhandledrejection',e=>exception(e.reason));
  window.addEventListener('dn-craft-kept',()=>{event('artifact_saved',{source:'crafting',action:'added',count:1},true);milestone('first-artifact-saved');});
  window.addEventListener('dn-strategies-changed',e=>{if(e.detail?.reason==='strategies' || e.detail?.reason==='ratings')event('strategy_saved',{},true);});
  document.addEventListener('change',e=>{if(e.target?.id==='strategy-select'){event('strategy_used',{unit_count:window.DN?.activeStrategy()?.units?.length || 0},true);milestone('first-strategy-used');}});
  document.addEventListener('click',e=>{
    const link=e.target?.closest?.('.site-nav a[href]');if(!link)return;
    const feature=(link.getAttribute('href') || '').split(/[?#]/)[0].replace('.html','');
    if(pages.has(feature))event('feature_used',{feature},true);
  });
  setInterval(()=>{
    const now=Date.now(),seconds=Math.min(15,Math.max(0,(Math.min(now,lastActivity+60000)-Math.max(lastTick,activeSince))/1000));lastTick=now;
    if(!document.hidden && lastActivity && seconds>0)event('active_time_recorded',{seconds});
  },15000);
  document.addEventListener('visibilitychange',()=>{lastTick=Date.now();if(document.hidden){lastActivity=0;activeSince=0;}});
  if(preferences.analytics)event('$pageview');
})();
