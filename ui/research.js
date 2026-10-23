/* Automatic contributions are an opt-in projection, not a second craft store.
 * Durable state contains only consent receipts and acknowledgements. */
(() => {
  'use strict';
  function create({user,enabled,consent,readLog,rpc,readState,writeState,boundOwner,notify=()=>{}}) {
    let running=false,error='',generation=0,owner=null,state=null;
    const ready=()=>enabled() && consent() && owner && user()===owner && boundOwner()===owner;
    async function load() {
      const current=++generation,id=user();owner=id;state=null;error='';
      if(id){const saved=await readState(id);if(current!==generation)return;state=saved || {owner:id,epoch:null,pending:null,hash:null};}
      notify();
    }
    async function setSharing(value) {
      if(!user())throw Error('Sign in to change contributions.');
      if(owner!==user() || !state)await load();
      state={...state,pending:value,operation:crypto.randomUUID(),hash:null};await writeState(owner,state);notify();
      return upload();
    }
    async function upload() {
      if(running || !owner || user()!==owner || !state)return;
      const id=owner,current=generation;running=true;
      const valid=()=>generation===current && user()===id;
      try {
        if(state.pending!==null) {
          const pending=state.pending,operation=state.operation;
          if(pending && !ready())return;
          const receipt=await rpc('planner_set_crafting_consent',{p_enabled:pending,p_policy:window.DNCraftingCommunity.POLICY,p_operation:operation});
          if(!valid() || state.operation!==operation)return;
          state={...state,epoch:receipt.epoch,pending:null,operation:null,hash:null};await writeState(id,state);error='';
        }
        if(!ready() || !state.epoch)return;
        const payload=window.DNCraftingCommunity.payload(await readLog());
        const hash=await window.DNIntegrationCore.fingerprint(payload);
        if(!valid() || !ready() || hash===state.hash)return;
        for(let i=0;i<payload.records.length;i+=100) {
          if(!valid() || !ready())return;
          await rpc('planner_submit_crafting',{p_epoch:state.epoch,p_payload:{...payload,records:payload.records.slice(i,i+100)}});
        }
        if(!valid() || !ready())return;
        state={...state,hash};await writeState(id,state);error='';
      }catch(failure){if(valid())error=failure.code==='42501'?'Contributions paused. Review sharing preferences.':'Contributions pending.';}
      finally{running=false;notify();}
    }
    return {load,setSharing,upload,status:()=>({owner,error,saved:!!state,active:!!ready() && !!state?.epoch,pending:state?.pending!=null || !!error}),
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
