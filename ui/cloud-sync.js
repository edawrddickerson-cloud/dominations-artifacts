/* Authority: Approved simple, versioned cloud persistence.
 * Ownership: Transport-independent sync decisions. The adapter owns auth/storage.
 * Invariants: Local saves never wait for cloud; remote changes are never applied
 * automatically. A conflict needs an explicit choice and a committed safety copy. */
(() => {
  'use strict';
  function create({capture,remote,readBinding,saveBinding,recover,apply,notify=()=>{}}) {
    const C=window.DNIntegrationCore;
    let owner=null,epoch=0,running=false,state={status:'signed-out'},latest=null;
    const publish=next=>{state={...next};notify({...state});return state;};
    const valid=(id,generation)=>owner===id && epoch===generation;
    async function inspect({automatic=true}={}) {
      if(running || !owner)return state;
      const id=owner,generation=epoch;running=true;
      try {
        const local=C.validate(await capture()),localHash=await C.fingerprint(local),row=await remote.read(id);
        if(!valid(id,generation))return state;
        if(row)C.validate(row.data);
        const remoteHash=row?await C.fingerprint(row.data):null;
        let binding=readBinding();
        if(binding?.owner===id && binding.pending?.operation===row?.operation_id && binding.pending?.hash===remoteHash) {
          binding={owner:id,revision:row.revision,hash:remoteHash};saveBinding(binding);
        }
        latest={local,localHash,row,remoteHash};
        const status=C.decision({boundOwner:binding?.owner,owner:id,baseHash:binding?.hash,localHash,remoteHash});
        if(status==='synced') {
          saveBinding({owner:id,revision:row.revision,hash:remoteHash});
          return publish({status,revision:row.revision});
        }
        if(status==='upload' && automatic) {
          const operation=binding.pending?.hash===localHash?binding.pending.operation:crypto.randomUUID();
          saveBinding({...binding,pending:{operation,hash:localHash}});
          const saved=await remote.write(id,row?.revision || 0,operation,local);
          if(!valid(id,generation))return state;
          saveBinding({owner:id,revision:saved.revision,hash:localHash});
          return publish({status:'synced',revision:saved.revision});
        }
        return publish({status,revision:row?.revision || 0});
      }catch(error) {
        if(!valid(id,generation))return state;
        return publish({status:error?.code==='409' || error?.code==='40001'?'conflict':'offline',error:error?.message || 'Cloud connection unavailable.'});
      }finally{running=false;}
    }
    async function choose(choice) {
      if(running || !owner || !['local','cloud'].includes(choice))throw Error('Cloud sync is busy. Try again.');
      await inspect({automatic:false});
      if(!latest || state.status==='offline')throw Error('Reconnect before choosing a cloud version.');
      const id=owner,generation=epoch,selected=latest;running=true;
      try {
        if(choice==='cloud' && !selected.row)throw Error('This account has no saved cloud version yet.');
        await recover({owner:id,remote:selected.row});
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        if(await C.fingerprint(await capture())!==selected.localHash)throw Error('Local data changed while preparing the safety copy. Stop scanning and try again.');
        if(choice==='local') {
          const operation=crypto.randomUUID();
          const saved=await remote.write(id,selected.row?.revision || 0,operation,selected.local);
          if(!valid(id,generation))return state;
          saveBinding({owner:id,revision:saved.revision,hash:selected.localHash});
          return publish({status:'synced',revision:saved.revision});
        }
        // Recheck the remote revision too; never apply a choice from a stale dialog.
        const current=await remote.read(id);
        if(!current || current.revision!==selected.row.revision)throw Object.assign(Error('The cloud version changed. Review it again.'),{code:'409'});
        if(!valid(id,generation))throw Error('The signed-in account changed. Nothing was replaced.');
        await apply(selected.row.data,{preserveArtwork:readBinding()?.owner===id});
        if(!valid(id,generation))return state;
        saveBinding({owner:id,revision:selected.row.revision,hash:selected.remoteHash});
        return publish({status:'synced',revision:selected.row.revision,reload:true});
      }catch(error) {
        if(valid(id,generation))publish({status:error?.code==='409'?'conflict':'error',error:error.message});
        throw error;
      }finally{running=false;}
    }
    return {inspect,choose,state:()=>({...state}),setOwner(id){owner=id || null;epoch++;latest=null;return publish({status:owner?'unlinked':'signed-out'});}};
  }
  window.DNCloudSyncCore={create};
})();
