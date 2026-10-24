/* Private text evidence, separate account consent, bounded queue. No pixels or telemetry. */
(() => {
  'use strict';
  const POLICY='2026-10-24-ocr-text-v2',MAX=500,TTL=90*86400000;
  function safeText(value,max) {
    if(typeof value!=='string')return null;
    const text=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
    return !text || text.length>max || /https?:|www\.|data:|bearer\s|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)?null:text;
  }
  function samples(items,build) {
    const out=[];
    for(const item of items || []) {
      for(const e of item.ocrEvidence || []) {
        const stamp=Date.parse(e.observedAt || item.firstSeen);if(!Number.isFinite(stamp) || Date.now()-stamp>TTL)continue;
        const title=e.kind==='artifact-name',row=title?null:item.rows?.[e.position-1];
        const final=title?item.name:row?.name,manual=(title?item.nameSource:row?.nameSource)==='manual';
        const changed=!!final && final!==e.match?.name;
        if(e.accepted && e.match?.method==='exact' && !changed && !manual)continue;
        if(title && e.accepted && !changed && !manual)continue;
        const text=safeText(e.text,500);if(!text)continue;
        const resolved=manual?'user-correction':(!e.accepted || changed) && (title?!!item.name:row?.known && !row.assumed)?'later-ocr':'unresolved';
        const sample={kind:e.kind,position:e.position,observed_text:text,matched_name:safeText(e.match?.name,160),
          match_method:safeText(e.match?.method,80) || 'unrecognized',match_score:Number.isFinite(e.match?.confidence)?Math.max(0,Math.min(1,e.match.confidence)):null,
          match_status:e.accepted?'accepted':e.match?.name?'suggested':'rejected',corrected_name:manual?safeText(final,160):null,
          resolved_name:resolved==='unresolved'?null:safeText(final,160),resolution:resolved,
          hall:['main','war'].includes(item.hall)?item.hall:null,category:safeText(item.type,80),app_build:safeText(e.build || build,80) || 'unknown',
          scanner:['crafting','storage'].includes(e.source)?e.source:'unknown',capture_method:['live-capture','local-image'].includes(item.captureMethod)?item.captureMethod:'unknown',
          pass:safeText(e.pass,80) || 'read',read_ordinal:e.read,observed_at:e.observedAt || item.firstSeen,
          revision:item.revision || 1,writer:null};
        out.push({key:item.id+':'+e.kind+':'+e.position+':'+e.read+':'+e.observedAt,owner:e.owner,encounter:item.id,writer:item.writer || 'legacy',sample});
      }
    }
    return out;
  }
  async function sampleId(owner,key) {
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'|'+key));
    const hex=[...new Uint8Array(hash)].slice(0,16).map(v=>v.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }
  function create({store,rpc,owner,consent,ready,online=()=>true,build}) {
    let generation=0,loadedOwner=null,state=null,queue=Promise.resolve(),error='';
    const allowed=()=>ready() && consent()===true && !!owner() && loadedOwner===owner() && !!state?.receipt?.enabled && !state?.pending;
    const key=who=>'ocr-feedback:'+who;
    function serial(task,requireConsent=true) {
      const who=owner(),gen=generation;
      const active=()=>ready() && who && owner()===who && gen===generation && (!requireConsent || consent()===true);
      const execute=async()=>{
        if(!active())return false;
        {const saved=await store.get(key(who));if(!active())return false;state=saved?.version===2?saved:{version:2,entries:{},receipt:null,pending:null};loadedOwner=who;}
        return task(who,active);
      };
      const next=queue.catch(()=>{}).then(()=>globalThis.navigator?.locks?globalThis.navigator.locks.request('dn-ocr-feedback:'+who,execute):execute());queue=next;
      return next.catch(()=>{error='OCR feedback pending. Save preferences while connected to retry consent.';return false;});
    }
    const persist=who=>store.put(key(who),state);
    async function pending(who,active) {
      if(!active())return false;
      if(!state.pending)return true;
      if(!online())return false;
      const receipt=await rpc('planner_set_ocr_feedback_consent',state.pending);
      if(!active())return false;
      state.receipt=receipt;state.pending=null;await persist(who);return true;
    }
    return {
      allowed,
      setSharing(enabled){return serial(async(who,active)=>{
        if(!enabled){state.entries={};state.receipt=null;if(state.pending?.p_enabled!==false)state.pending={p_enabled:false,p_policy:POLICY,p_operation:crypto.randomUUID(),p_expected:null};await persist(who);return pending(who,active);}
        if(!online())throw Error('Connect to enable OCR feedback.');
        const current=await rpc('planner_get_ocr_feedback_consent');if(!active())return false;
        // A pending operation is retried verbatim after a lost response.
        if(!state.pending?.p_enabled)state.pending={p_enabled:true,p_policy:POLICY,p_operation:crypto.randomUUID(),p_expected:current.epoch};
        await persist(who);const ok=await pending(who,active);error='';return ok && state.receipt?.enabled;
      },false);},
      collect(items){return serial(async(who,active)=>{
        if(!state.receipt?.enabled || state.pending)return false;
        const entries=state.entries;
        for(const [k,e] of Object.entries(entries))if(Date.now()-Date.parse(e.sample.observed_at)>TTL)delete entries[k];
        for(const entry of samples(items,build).slice(-MAX)) {
          if(entry.owner!==who || Date.parse(entry.sample.observed_at)<Date.parse(state.receipt.since))continue;
          const prior=entries[entry.key];
          if(!prior && Object.keys(entries).length>=MAX){const sent=Object.keys(entries).find(k=>entries[k].signature===entries[k].sent);if(sent)delete entries[sent];else continue;}
          const sample={id:prior?.sample.id || await sampleId(who,entry.key),encounter:await sampleId(who,'encounter:'+entry.encounter),...entry.sample,writer:await sampleId(who,'writer:'+entry.writer)};
          if(!active())return false;
          if(prior?.sample.resolution==='user-correction' && sample.resolution!=='user-correction' || prior?.sample.revision>sample.revision)continue;
          const signature=JSON.stringify(sample);
          if(signature!==prior?.signature)entries[entry.key]={sample,signature,sent:prior?.sent || null};
        }
        if(!active())return false;await persist(who);error='';return true;
      });},
      flush(){return serial(async(who,active)=>{
        if(!online())return false;
        if(!await pending(who,active) || !state.receipt?.enabled)return false;
        const current=await rpc('planner_get_ocr_feedback_consent');if(!active())return false;
        if(!current.enabled || current.epoch!==state.receipt.epoch){state.receipt=null;state.entries={};await persist(who);error='OCR consent changed. Save preferences to enable again.';return false;}
        while(active()) {
          const entries=Object.values(state.entries).filter(e=>e.signature!==e.sent && Date.now()-Date.parse(e.sample.observed_at)<=TTL).slice(0,50);if(!entries.length)break;
          await rpc('planner_submit_ocr_feedback',{p_epoch:state.receipt.epoch,p_samples:entries.map(e=>e.sample)});
          if(!active())return false;for(const entry of entries)entry.sent=entry.signature;await persist(who);
        }
        error='';return true;
      });},
      async withdraw(){generation++;loadedOwner=null;state=null;return this.setSharing(false);},
      retryWithdrawal(){return serial(async(who,active)=>state.pending?.p_enabled===false?pending(who,active):true,false);},
      async remove(){const who=owner();if(!await this.withdraw())throw Error('Connect to delete OCR feedback.');if(owner()!==who)throw Error('Account changed.');await rpc('planner_delete_ocr_feedback');await store.remove(key(who));loadedOwner=null;state=null;},
      status:()=>({pending:Object.values(state?.entries || {}).filter(e=>e.signature!==e.sent).length,error}),
    };
  }
  window.DNOCRFeedbackCore={POLICY,samples,safeText,create};
  if(!window.DNServiceStore || !window.DNCloud || !window.DNConsent)return;
  const config=window.DNServiceConfig;
  const collector=create({store:window.DNServiceStore,rpc:(...args)=>window.DNCloud.rpc(...args),owner:()=>window.DNCloud.user()?.id,
    consent:()=>window.DNConsent.get().ocrFeedback,ready:()=>window.DNIntegrationCore.ocrFeedbackReady(config),online:()=>navigator.onLine!==false,build:config.build});
  window.DNOCRFeedback=collector;
  let timer=null,subscribed=false;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(async()=>{
    await collector.retryWithdrawal();if(!collector.allowed()){window.dispatchEvent(new Event('dn-ocr-feedback-status'));return;}
    if(window.DNScannerCollection?.ocrFeedbackItems)await collector.collect(window.DNScannerCollection.ocrFeedbackItems());
    await collector.flush();
    window.dispatchEvent(new Event('dn-ocr-feedback-status'));
  },2000);};
  const attach=()=>{if(!subscribed && window.DNScannerCollection){subscribed=true;window.DNScannerCollection.subscribe(schedule);}schedule();};
  let previous=window.DNConsent.get().ocrFeedback;
  window.DNConsent.subscribe(value=>{if(previous && !value.ocrFeedback)collector.withdraw();previous=value.ocrFeedback;schedule();});
  window.DNCloud.subscribe(schedule);window.addEventListener('online',schedule);setInterval(schedule,30000);
  window.addEventListener('dn-crafted-log-ready',attach);attach();
})();
