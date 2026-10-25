/* Authority: Approved simple, versioned cloud persistence.
 * Ownership: Transport-independent sync decisions. The adapter owns auth/storage.
 * Invariants: Local saves never wait for cloud; remote changes are never applied
 * automatically. A conflict needs an explicit choice and a committed safety copy. */
(() => {
  'use strict';
  function create({capture,remote,readBinding,saveBinding,recover,apply,applyHistory,readLocalCraftsLogged=async()=>null,notify=()=>{}}) {
    const C=window.DNIntegrationCore;
    let owner=null,epoch=0,running=false,choicePending=false,state={status:'signed-out'},latest=null;
    const idleWaiters=[];
    function release(){running=false;for(const resolve of idleWaiters.splice(0))resolve();}
    const idle=()=>running?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();
    function summary(workspace,updatedAt) {
      if(!workspace)return {artifacts:0,targets:0,profiles:0,lifetimeCraftsLogged:null,updatedAt:null};
      let targets=0;
      for(const [key,value] of Object.entries(workspace.settings))if(/^dn-p:[^:]+:dn-crafting-purposes$/.test(key)) {
        try{targets+=(JSON.parse(value).customPurposes || []).length;}catch{}
      }
      return {artifacts:workspace.records.reduce((sum,record)=>sum+record.items.length,0),targets,lifetimeCraftsLogged:workspace.craftingLog?window.DNCraftingHistory.totals(workspace.craftingLog).logged:null,
        profiles:JSON.parse(workspace.settings['dn-profiles']).profiles.length,updatedAt:updatedAt || null};
    }
    function comparison() {
      if(!latest)return null;
      const binding=readBinding();
      return {owner,localHash:latest.localHash,localPlannerHash:latest.localPlannerHash,remoteHash:latest.remoteHash,revision:latest.row?.revision || 0,
        local:{...summary(latest.local,binding?.owner===owner && binding.hash===latest.localHash?binding.savedAt:null),lifetimeCraftsLogged:latest.localCraftsLogged},
        cloud:summary(latest.row?.data,latest.row?.updated_at)};
    }
    const publish=next=>{state={...next,comparison:comparison()};notify({...state});return state;};
    const valid=(id,generation)=>owner===id && epoch===generation;
    const planner=value=>{const {craftingLog,...rest}=value;return rest;};
    async function inspect({automatic=true,forChoice=false}={}) {
      if(running || choicePending && !forChoice || !owner)return state;
      const id=owner,generation=epoch;running=true;
      try {
        const local=C.validate(await capture()),localHash=await C.fingerprint(local),row=await remote.read(id);
        if(!valid(id,generation))return state;
        if(row)C.validate(row.data);
        const remoteHash=row?await C.fingerprint(row.data):null;
        const localPlannerHash=await C.fingerprint(planner(local));
        const localCraftsLogged=await readLocalCraftsLogged();
        if(!valid(id,generation))return state;
        let binding=readBinding();
        if(binding?.owner===id && binding.pending?.operation===row?.operation_id && binding.pending?.hash===remoteHash) {
          binding={owner:id,revision:row.revision,hash:remoteHash,savedAt:row.updated_at || null};saveBinding(binding);
        }
        latest={local,localHash,localPlannerHash,row,remoteHash,localCraftsLogged};
        if(automatic && applyHistory && binding?.owner===id && row && local.craftingLog && row.data.craftingLog) {
          const withoutHistory=value=>{const {craftingLog,...rest}=value;return C.canonical(rest);};
          if(withoutHistory(local)===withoutHistory(row.data)) {
            const merged=window.DNCraftingHistory.project(window.DNCraftingHistory.reconcile(local.craftingLog,row.data.craftingLog));
            if(C.canonical(merged)!==C.canonical(local.craftingLog) || C.canonical(merged)!==C.canonical(row.data.craftingLog)) {
              await recover({owner:id,remote:row});
              if(!valid(id,generation))return state;
              if(await C.fingerprint(await capture())!==localHash)return publish({status:'pending'});
              await applyHistory(merged);
              if(!valid(id,generation))return state;
              const combined=C.validate(await capture()),hash=await C.fingerprint(combined),operation=crypto.randomUUID();
              if(!valid(id,generation))return state;
              saveBinding({...binding,owner:id,pending:{operation,hash}});
              const saved=await remote.write(id,row.revision,operation,combined);
              if(!valid(id,generation))return state;
              saveBinding({owner:id,revision:saved.revision,hash,savedAt:saved.updated_at || null});
              latest={local:combined,localHash:hash,localPlannerHash,row:{...saved,data:combined},remoteHash:hash,localCraftsLogged:window.DNCraftingHistory.totals(combined.craftingLog).logged};
              return publish({status:'synced',revision:saved.revision});
            }
          }
        }
        const status=C.decision({boundOwner:binding?.owner,owner:id,baseHash:binding?.hash,localHash,remoteHash});
        if(status==='synced') {
          saveBinding({owner:id,revision:row.revision,hash:remoteHash,savedAt:row.updated_at || binding?.savedAt || null});
          return publish({status,revision:row.revision});
        }
        // Only a missing workspace is empty. Zero artifacts never authorizes
        // replacing saved profiles, targets or settings. A different account's
        // browser binding also requires an explicit choice.
        const firstUpload=!row && !binding;
        if((status==='upload' || firstUpload) && automatic) {
          if(firstUpload) {
            await recover({owner:id,remote:null});
            if(!valid(id,generation))return state;
            if(await C.fingerprint(await capture())!==localHash)return publish({status:'pending'});
          }
          if(!valid(id,generation))return state;
          const operation=binding?.pending?.hash===localHash?binding.pending.operation:crypto.randomUUID();
          saveBinding({...binding,owner:id,pending:{operation,hash:localHash}});
          const saved=await remote.write(id,row?.revision || 0,operation,local);
          if(!valid(id,generation))return state;
          saveBinding({owner:id,revision:saved.revision,hash:localHash,savedAt:saved.updated_at || new Date().toISOString()});
          return publish({status:'synced',revision:saved.revision});
        }
        return publish({status,revision:row?.revision || 0});
      }catch(error) {
        if(!valid(id,generation))return state;
        return publish({status:['409','40001','LEGACY_BASELINE'].includes(error?.code)?'conflict':'offline',error:error?.message || 'Cloud connection unavailable.'});
      }finally{release();}
    }
    async function choose(choice,expected) {
      if(!owner || !['local','cloud'].includes(choice))throw Error('Sign in before choosing saved data.');
      if(choicePending)throw Error('A saved-data choice is already in progress.');
      const id=owner,generation=epoch;choicePending=true;
      try {
        // Reserve the choice before waiting, so timers/focus events cannot start
        // another inspection between the current one finishing and this choice.
        await idle();
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        await inspect({automatic:false,forChoice:true});
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        if(!latest || state.status==='offline')throw Error(state.error || 'Reconnect before choosing a cloud version.');
        const selected=latest;running=true;
        const historyOnly=choice==='cloud' && readBinding()?.owner===id && expected?.localPlannerHash && expected.localPlannerHash===selected.localPlannerHash;
        if(expected && (expected.owner!==id || expected.localHash!==selected.localHash && !historyOnly || expected.remoteHash!==selected.remoteHash))
          throw Object.assign(Error('Saved data changed. Review the versions again.'),{code:'409'});
        if(choice==='cloud' && !selected.row)throw Error('This account has no saved cloud version yet.');
        await recover({owner:id,remote:selected.row});
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        if(await C.fingerprint(await capture())!==selected.localHash)throw Error('Local data changed while preparing the safety copy. Stop scanning and try again.');
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        if(choice==='local') {
          const data={...selected.local};
          if(data.craftingLog && selected.row?.data.craftingLog)data.craftingLog=window.DNCraftingHistory.project(window.DNCraftingHistory.reconcile(data.craftingLog,selected.row.data.craftingLog,{baselineChoice:'local'}));
          const hash=await C.fingerprint(data);
          if(!valid(id,generation))return state;
          const operation=crypto.randomUUID();
          saveBinding({...readBinding(),owner:id,pending:{operation,hash}});
          const saved=await remote.write(id,selected.row?.revision || 0,operation,data);
          if(!valid(id,generation))return state;
          if(applyHistory && data.craftingLog)await applyHistory(data.craftingLog);
          if(!valid(id,generation))return state;
          saveBinding({owner:id,revision:saved.revision,hash,savedAt:saved.updated_at || new Date().toISOString()});
          return publish({status:'synced',revision:saved.revision});
        }
        // Recheck the remote revision too; never apply a choice from a stale dialog.
        const current=await remote.read(id);
        if(!current || current.revision!==selected.row.revision && await C.fingerprint(current.data)!==selected.remoteHash)throw Object.assign(Error('The cloud version changed. Review it again.'),{code:'409'});
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        if(await C.fingerprint(await capture())!==selected.localHash)throw Error('Local data changed. Stop scanning and review the versions again.');
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        let data=selected.row.data,revision=current.revision,hash=selected.remoteHash;
        if(readBinding()?.owner===id && data.craftingLog && selected.local.craftingLog) {
          data={...data,craftingLog:window.DNCraftingHistory.project(window.DNCraftingHistory.reconcile(selected.local.craftingLog,data.craftingLog,{baselineChoice:'cloud'}))};
          hash=await C.fingerprint(data);
          if(!valid(id,generation))return state;
          if(hash!==selected.remoteHash){const saved=await remote.write(id,revision,crypto.randomUUID(),data);revision=saved.revision;}
          if(!valid(id,generation))return state;
        }
        await apply(data,{preserveArtwork:readBinding()?.owner===id});
        if(!valid(id,generation))return state;
        saveBinding({owner:id,revision,hash,savedAt:selected.row.updated_at || null});
        return publish({status:'synced',revision,reload:true});
      }catch(error) {
        if(valid(id,generation))publish({status:error?.code==='409'?'conflict':'error',error:error.message});
        throw error;
      }finally{choicePending=false;release();}
    }
    return {inspect,choose,state:()=>({...state}),setOwner(id){owner=id || null;epoch++;latest=null;return publish({status:owner?'unlinked':'signed-out'});}};
  }
  window.DNCloudSyncCore={create};
})();
