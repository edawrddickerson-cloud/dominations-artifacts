/* Separately opted-in, account-bound OCR text evidence. Never full logs/images.
 * Raw feedback goes to Supabase, not PostHog. No identifier/queue before consent.
 * Stable sample IDs make retries and later corrections update the same record. */
(() => {
  'use strict';
  const POLICY='2026-10-22-ocr-text-v1';
  function safeText(value,max) {
    if(typeof value!=='string')return null;
    const text=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
    if(!text || text.length>max || /https?:\/\/|data:|bearer\s|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text))return null;
    return text;
  }
  function samples(items,build) {
    const out=[];
    for(const item of items || []) {
      const common={hall:['main','war'].includes(item.hall)?item.hall:null,category:safeText(item.type,80),app_build:safeText(build,80) || 'unknown'};
      const title=item.nameEvidence;
      if(title && (title.accepted===false || !item.name || item.nameSource==='manual')) {
        const text=safeText(title.text,500);
        if(text)out.push({key:item.id+':artifact-name',sample:{...common,kind:'artifact-name',position:0,observed_text:text,
          matched_name:title.accepted?safeText(title.text,160):null,match_score:Number.isFinite(title.confidence)?Math.max(0,Math.min(1,title.confidence/100)):null,
          corrected_name:item.nameSource==='manual'?safeText(item.name,160):null}});
      }
      (item.rows || []).slice(0,6).forEach((row,index)=>{
        const match=row.nameMatch,manual=row.nameSource==='manual';
        if(row.known && !row.assumed && !manual && (!match || match.method==='exact'))return;
        const text=safeText(row.raw,500);if(!text)return;
        out.push({key:item.id+':perk-name:'+(index+1),sample:{...common,kind:'perk-name',position:index+1,observed_text:text,
          matched_name:safeText(match?.name || (!manual && row.known?row.name:null),160),match_score:Number.isFinite(match?.confidence)?Math.max(0,Math.min(1,match.confidence)):null,
          corrected_name:manual?safeText(row.name,160):null}});
      });
    }
    return out;
  }
  async function sampleId(owner,key) {
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'|'+key));
    const hex=[...new Uint8Array(hash)].slice(0,16).map(value=>value.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }
  function create({store,rpc,owner,consent,ready,online=()=>true,build}) {
    let generation=0,loadedOwner=null,state={},queue=Promise.resolve(),error='';
    const allowed=()=>ready() && consent()===true && !!owner();
    async function run(task,currentOwner,currentGeneration) {
      const active=()=>allowed() && owner()===currentOwner && generation===currentGeneration;
      if(!active())return false;
      if(loadedOwner!==currentOwner){state=await store.get('ocr-feedback:'+currentOwner) || {};if(!active())return false;loadedOwner=currentOwner;}
      return task({currentOwner,active});
    }
    function serial(task) {const expectedOwner=owner(),expectedGeneration=generation;const next=queue.catch(()=>{}).then(()=>run(task,expectedOwner,expectedGeneration));queue=next;return next.catch(()=>{error='OCR feedback is pending.';return false;});}
    return {
      collect(items){return serial(async({currentOwner,active})=>{
        const recent=samples(items,build).slice(-500),keys=new Set(recent.map(entry=>entry.key));
        const next=Object.fromEntries(Object.entries(state).filter(([key,entry])=>keys.has(key) || entry.signature!==entry.sent));
        for(const entry of recent) {
          if(!active())return false;
          const prior=next[entry.key];
          if(!prior && Object.keys(next).length>=500)continue;
          const sample={id:prior?.sample.id || await sampleId(currentOwner,entry.key),...entry.sample};
          if(prior?.sample.corrected_name && !sample.corrected_name)continue;
          const signature=JSON.stringify(sample);
          if(signature!==prior?.signature)next[entry.key]={sample,signature,sent:prior?.sent || null};
        }
        if(!active())return false;
        await store.put('ocr-feedback:'+currentOwner,next);
        if(!active()){await store.remove('ocr-feedback:'+currentOwner);return false;}
        state=next;error='';return true;
      });},
      flush(){return serial(async({currentOwner,active})=>{
        if(!online())return false;
        if(!Object.values(state).some(entry=>entry.signature!==entry.sent))return true;
        await rpc('planner_set_ocr_feedback_consent',{p_enabled:true,p_policy:POLICY});if(!active())return false;
        while(active()) {
          const entries=Object.values(state).filter(entry=>entry.signature!==entry.sent).slice(0,50);if(!entries.length)break;
          await rpc('planner_submit_ocr_feedback',{p_samples:entries.map(entry=>entry.sample)});if(!active())return false;
          for(const entry of entries)entry.sent=entry.signature;
          await store.put('ocr-feedback:'+currentOwner,state);
        }
        error='';return true;
      });},
      async withdraw(){
        generation++;const expectedOwner=owner(),previousOwners=new Set([loadedOwner,expectedOwner].filter(Boolean));loadedOwner=null;state={};
        await queue.catch(()=>{});
        for(const previous of previousOwners)await store.remove('ocr-feedback:'+previous);
        if(ready() && expectedOwner && owner()===expectedOwner)try{await rpc('planner_set_ocr_feedback_consent',{p_enabled:false,p_policy:POLICY});}catch{error='OCR withdrawal will retry when connected.';return false;}
        error='';return true;
      },
      async remove(){const expectedOwner=owner();await this.withdraw();if(!expectedOwner || owner()!==expectedOwner)throw Error('Sign in to the original account to delete OCR feedback.');await rpc('planner_delete_ocr_feedback');},
      status:()=>({pending:Object.values(state).filter(entry=>entry.signature!==entry.sent).length,error}),allowed,
    };
  }
  window.DNOCRFeedbackCore={POLICY,samples,safeText,create};
  if(!window.DNServiceStore || !window.DNCloud || !window.DNConsent)return;
  const config=window.DNServiceConfig,C=window.DNIntegrationCore;
  const collector=create({store:window.DNServiceStore,rpc:(...args)=>window.DNCloud.rpc(...args),owner:()=>window.DNCloud.user()?.id,
    consent:()=>window.DNConsent.get().ocrFeedback,ready:()=>C.ocrFeedbackReady(config),online:()=>navigator.onLine!==false,build:config.build});
  window.DNOCRFeedback=collector;
  let timer=null,subscribed=false;
  const schedule=()=>{clearTimeout(timer);if(!collector.allowed())return;timer=setTimeout(async()=>{
    if(!collector.allowed())return;
    if(window.DNScannerCollection?.ocrFeedbackItems)await collector.collect(window.DNScannerCollection.ocrFeedbackItems());
    await collector.flush();
  },2000);};
  const attach=()=>{if(!subscribed && window.DNScannerCollection){subscribed=true;window.DNScannerCollection.subscribe(schedule);}schedule();};
  let previouslyEnabled=window.DNConsent.get().ocrFeedback,withdrawPending=false;
  window.DNConsent.subscribe(value=>{if(previouslyEnabled && !value.ocrFeedback)collector.withdraw().then(ok=>{withdrawPending=!ok;}).catch(()=>{withdrawPending=true;});previouslyEnabled=value.ocrFeedback;schedule();});
  window.DNCloud.subscribe(schedule);
  window.addEventListener('online',async()=>{if(withdrawPending)withdrawPending=!await collector.withdraw();else schedule();});
  setInterval(schedule,30000);
  window.addEventListener('dn-crafted-log-ready',attach);attach();
})();
