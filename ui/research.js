/* Automatic contributions are an opt-in projection, not a second craft store.
 * Durable state contains only consent receipts and acknowledgements. */
(() => {
  'use strict';
  const MAX_RECORDS=100,MAX_BYTES=262144;
  // PostgreSQL jsonb text adds a space after each structural comma/colon.
  // Account for that server-side limit as well as the compact wire payload.
  function payloadBytes(value) {
    const json=JSON.stringify(value);let spaces=0,quoted=false,escaped=false;
    for(const char of json) {
      if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;}
      else if(char==='"')quoted=true;else if(char===',' || char===':')spaces++;
    }
    return new TextEncoder().encode(json).length+spaces;
  }
  function source(item,archived) {
    const rowKeys=['name','known','assumed','inferred','conflict','tierConflict','outOfRange','hasPercent','value','nameSource','valueSource','levelSource','tierSource','rangeSource'];
    return {id:item.id,revision:item.revision,writer:item.writer,firstSeen:item.firstSeen,hall:item.hall,type:item.type,
      archived:archived || !!item.archived,corrected:item.corrected,reconciliationConflict:item.reconciliationConflict,
      craftingEventSource:item.craftingEventSource,craftingEventId:item.craftingEventId,
      rows:(archived || item.archived)?undefined:item.rows?.map(row=>Object.fromEntries(rowKeys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]])))};
  }
  function create({user,enabled,consent,readLog,rpc,readState,writeState,boundOwner,notify=()=>{}}) {
    let running=false,error='',generation=0,owner=null,state=null,writes=Promise.resolve(),cacheScope='',cache=new Map();
    const permissionError='Contributions paused. Review sharing preferences.';
    const ready=()=>enabled() && consent() && owner && user()===owner && boundOwner()===owner;
    // Serialize local receipts so an older in-flight commit cannot become the
    // final durable state after a newer explicit sharing choice.
    function persist(id,value,isCurrent=()=>true) {
      const saved=writes.catch(()=>{}).then(async()=>{if(!isCurrent())return false;await writeState(id,value);return isCurrent();});
      writes=saved.catch(()=>{});return saved;
    }
    async function load() {
      const current=++generation,id=user();owner=id;state=null;error='';cacheScope='';cache.clear();
      if(id){const saved=await readState(id);if(current!==generation || user()!==id)return;state=saved?.owner===id?saved:{owner:id,epoch:null,pending:null,hash:null};error=state.requiresConsentReview?permissionError:'';}
      notify();
    }
    async function setSharing(value) {
      const id=user();if(!id)throw Error('Sign in to change contributions.');
      if(owner!==id || !state)await load();
      if(user()!==id || owner!==id || !state)return;
      const current=++generation;cacheScope='';cache.clear();
      state={...state,requiresConsentReview:false,pending:value,operation:crypto.randomUUID(),hash:null,acknowledged:null,...(!value?{epoch:null}:{})};error='';
      // Explicit choices remain durable for their captured account even if the
      // user switches accounts while a prior local commit finishes.
      await persist(id,state);
      if(current!==generation || user()!==id)return;
      notify();return upload();
    }
    async function upload() {
      if(running || !owner || user()!==owner || !state || state.requiresConsentReview)return;
      const id=owner,current=generation;running=true;
      const valid=()=>generation===current && owner===id && user()===id;
      let attempt=null;
      try {
        if(state.pending!==null) {
          const pending=state.pending,operation=state.operation;
          const sameOperation=()=>valid() && state.operation===operation;
          if(pending && !ready())return;
          attempt={kind:'consent',operation};
          const receipt=await rpc('planner_set_crafting_consent',{p_enabled:pending,p_policy:window.DNCraftingCommunity.POLICY,p_operation:operation});
          if(!sameOperation() || pending && !ready())return;
          const next={...state,epoch:pending?receipt.epoch:null,pending:null,operation:null,hash:null,acknowledged:null};
          if(!await persist(id,next,sameOperation) || !sameOperation())return;
          state=next;error='';
        }
        if(!valid() || !ready() || !state.epoch || state.pending!==null)return;
        const S=window.DNCraftingCommunity,C=window.DNIntegrationCore,H=window.DNCraftingHistory,epoch=state.epoch;
        const scope={version:1,owner:id,epoch,policy:S.POLICY,rules:S.RULES};
        const scopeKey=JSON.stringify(scope),sameScope=()=>valid() && ready() && state.pending===null && state.epoch===epoch && !state.requiresConsentReview && S.POLICY===scope.policy && S.RULES===scope.rules;
        if(cacheScope!==scopeKey){cacheScope=scopeKey;cache.clear();}
        const savedAcknowledgements=state.acknowledged;
        let acknowledged=Object.assign(Object.create(null),savedAcknowledgements && Object.entries(scope).every(([key,value])=>savedAcknowledgements[key]===value)?savedAcknowledgements.records:{});
        if(!sameScope())return;
        const log=await readLog();if(!sameScope())return;
        // Canonical ledgers can be validated in place. Legacy logs still use
        // their existing normalization, without creating another item store.
        const value=log?.ledger?H.validate(log):H.normalize(log);
        const envelope={version:2,policy:scope.policy,rules:scope.rules},emptyBytes=payloadBytes({...envelope,records:[]});
        let batch=[],batchBytes=emptyBytes,index;
        const seen=new Set();
        async function flush() {
          if(!batch.length)return true;
          if(!sameScope())return false;
          attempt={kind:'submission',epoch};
          await rpc('planner_submit_crafting',{p_epoch:epoch,p_payload:{...envelope,records:batch.map(entry=>entry.record)}});
          if(!sameScope())return false;
          const records=Object.assign(Object.create(null),acknowledged);
          for(const entry of batch)records[entry.record.id]=entry.digest;
          const next={...state,hash:null,acknowledged:{...scope,records}};
          if(!sameScope() || !await persist(id,next,sameScope) || !sameScope())return false;
          state=next;acknowledged=records;batch=[];batchBytes=emptyBytes;error='';return true;
        }
        for(const [archived,items] of [[false,value.items],[true,value.ledger.archived]])for(const item of items) {
          if(!sameScope())return;
          seen.add(item.id);
          const clean=source(item,archived),signature=C.canonical(clean),previous=cache.get(item.id);
          if(previous?.source===signature && acknowledged[item.id]===previous.digest)continue;
          index ||= S.rules();
          const record=S.encode(clean,index);
          if(!sameScope())return;
          const digest=previous?.source===signature?previous.digest:await C.fingerprint(record);
          if(!sameScope())return;
          cache.set(item.id,{source:signature,digest});
          if(acknowledged[item.id]===digest)continue;
          const bytes=payloadBytes(record);
          if(batch.length && (batch.length===MAX_RECORDS || batchBytes+2+bytes>MAX_BYTES))if(!await flush())return;
          if(!sameScope())return;
          if(emptyBytes+bytes>MAX_BYTES)throw Error('Contribution record is too large.');
          batchBytes+=(batch.length?2:0)+bytes;batch.push({record,digest});
        }
        if(!sameScope() || !await flush() || !sameScope())return;
        for(const key of cache.keys())if(!seen.has(key))cache.delete(key);
        error='';
      }catch(failure){
        if(valid()) {
          const sameAttempt=attempt?.kind==='consent'?state.operation===attempt.operation:
            attempt?.kind==='submission' && state.pending===null && state.epoch===attempt.epoch;
          if(failure.code==='42501' && sameAttempt) {
            state={...state,requiresConsentReview:true};error=permissionError;
            try{await persist(id,state,()=>valid() && state.requiresConsentReview);}catch{ /* Keep the in-memory pause if storage is unavailable. */ }
          }else if(failure.code!=='42501')error='Contributions pending.';
        }
      }
      finally{running=false;notify();}
    }
    return {load,setSharing,upload,status:()=>({owner,error,saved:!!state,active:!!ready() && !!state?.epoch && !state.requiresConsentReview,pending:state?.pending!=null || !!error}),
      async clear(){await setSharing(false);},export:()=>state?{...state}:null};
  }
  window.DNResearchCore={create};
  if(!window.DNConsent || !window.DNServiceStore)return;
  const listeners=new Set(),notify=()=>{for(const fn of listeners)try{fn();}catch{}};
  const core=create({user:()=>window.DNCloud?.user()?.id || null,enabled:()=>window.DNIntegrationCore.researchReady(window.DNServiceConfig),consent:()=>window.DNConsent.get().research,
    boundOwner:()=>{try{return JSON.parse(localStorage.getItem('dn_cloud_binding'))?.owner;}catch{return null;}},
    async readLog(){if(window.DNScannerCollection)await window.DNScannerCollection.flush();return JSON.parse(await window.DN.scannerLog.read() || 'null');},
    rpc:(name,args)=>window.DNCloud.rpc(name,args),readState:owner=>window.DNServiceStore.get('crafting-contributions:'+owner),writeState:(owner,value)=>window.DNServiceStore.put('crafting-contributions:'+owner,value),notify});
  window.DNResearch={...core,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
  let prior=window.DNConsent.get().research;
  window.DNConsent.subscribe(preferences=>{const withdrawn=prior && !preferences.research;prior=preferences.research;if(withdrawn)core.setSharing(false).catch(()=>{});});
  window.addEventListener('dn-account-changed',()=>core.load().then(()=>core.upload()).catch(()=>{}));
  window.addEventListener('online',()=>core.upload());
  window.addEventListener('dn-crafting-log-changed',()=>core.upload());
  setInterval(()=>{if(!document.hidden)core.upload();},15000);
  core.load().catch(()=>{});
})();
