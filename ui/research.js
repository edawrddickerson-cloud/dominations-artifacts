/* Automatic contributions are an opt-in projection, not a second craft store.
 * Durable state contains only consent receipts and acknowledgements. */
(() => {
  'use strict';
  function create({user,enabled,consent,readLog,rpc,readState,writeState,boundOwner,notify=()=>{}}) {
    let running=false,error='',generation=0,owner=null,state=null;
    const permissionError='Contributions paused. Review sharing preferences.';
    const ready=()=>enabled() && consent() && owner && user()===owner && boundOwner()===owner;
    async function load() {
      const current=++generation,id=user();owner=id;state=null;error='';
      if(id){const saved=await readState(id);if(current!==generation)return;state=saved || {owner:id,epoch:null,pending:null,hash:null};error=state.requiresConsentReview?permissionError:'';}
      notify();
    }
    async function setSharing(value) {
      if(!user())throw Error('Sign in to change contributions.');
      if(owner!==user() || !state)await load();
      state={...state,requiresConsentReview:false,pending:value,operation:crypto.randomUUID(),hash:null};error='';await writeState(owner,state);notify();
      return upload();
    }
    async function upload() {
      if(running || !owner || user()!==owner || !state || state.requiresConsentReview)return;
      const id=owner,current=generation;running=true;
      const valid=()=>generation===current && user()===id;
      let attempt=null;
      try {
        if(state.pending!==null) {
          const pending=state.pending,operation=state.operation;
          if(pending && !ready())return;
          attempt={kind:'consent',operation};
          const receipt=await rpc('planner_set_crafting_consent',{p_enabled:pending,p_policy:window.DNCraftingCommunity.POLICY,p_operation:operation});
          if(!valid() || state.operation!==operation)return;
          state={...state,epoch:pending?receipt.epoch:null,pending:null,operation:null,hash:null};await writeState(id,state);error='';
        }
        if(!ready() || !state.epoch)return;
        const payload=window.DNCraftingCommunity.payload(await readLog());
        const hash=await window.DNIntegrationCore.fingerprint(payload);
        if(!valid() || !ready() || hash===state.hash)return;
        for(let i=0;i<payload.records.length;i+=100) {
          if(!valid() || !ready())return;
          attempt={kind:'submission',epoch:state.epoch};
          await rpc('planner_submit_crafting',{p_epoch:state.epoch,p_payload:{...payload,records:payload.records.slice(i,i+100)}});
        }
        if(!valid() || !ready())return;
        state={...state,hash};await writeState(id,state);error='';
      }catch(failure){
        if(valid()) {
          const sameAttempt=attempt?.kind==='consent'?state.operation===attempt.operation:
            attempt?.kind==='submission' && state.pending===null && state.epoch===attempt.epoch;
          if(failure.code==='42501' && sameAttempt) {
            // A revoked epoch never becomes valid by retrying. Persist the pause
            // without obtaining new consent; only an explicit sharing action
            // can resume uploads. Do not pause a newer in-flight user choice.
            state={...state,requiresConsentReview:true};error=permissionError;
            try{await writeState(id,state);}catch{ /* Keep the in-memory pause if storage is unavailable. */ }
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
