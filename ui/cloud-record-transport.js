/* Bounded private-cloud transport. Complete workspace assembly stays in the
 * browser; a cloud commit publishes every staged batch atomically. */
(() => {
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const same=(a,b)=>a && b && a.revision===b.revision && a.operation_id===b.operation_id && a.updated_at===b.updated_at;
  const failure=(message,code='40001')=>Object.assign(Error(message),{code});
  function create({rpc,store,user,generation=()=>user()}) {
    const R=window.DNWorkspaceRecords,C=window.DNIntegrationCore;
    let cache=null;
    function guard(owner,token) {if(user()!==owner || generation()!==token)throw failure('The signed-in account changed. Nothing was replaced.','42501');}
    async function call(owner,token,name,args) {guard(owner,token);const value=await rpc(name,{p_owner:owner,...args});guard(owner,token);return value;}
    async function acknowledge(owner,token,head,records) {
      const key='cloud-record-pending:'+owner+':'+head.operation_id,pending=await store.get(key);guard(owner,token);
      if(!pending || pending.operation!==head.operation_id || pending.revision+1!==head.revision)return;
      const current=new Map(records.map(row=>[R.identity(row),row]));
      for(const row of pending.batches.flat()) {
        const saved=current.get(R.identity(row));
        if(row.deleted?saved:!saved || row.position!==saved.position || C.canonical(row.data)!==C.canonical(saved.data))return;
      }
      await store.remove(key);guard(owner,token);
    }
    async function metadata(owner) {
      const token=generation();
      let head=await call(owner,token,'planner_records_metadata',{});
      if(head?.format===3)head=await call(owner,token,'planner_records_activate',{p_expected_revision:head.revision});
      if(head && head.format!==4)throw failure('Reload the planner before syncing this account.','UNSUPPORTED_SYNC');
      // Activation reserves the writer boundary before the first upload. A
      // crash at that point must still behave like a missing cloud workspace.
      return head?.revision===0 && !head.operation_id?null:head;
    }
    async function read(owner) {
      const token=generation(),head=await metadata(owner);guard(owner,token);
      if(!head)return null;
      if(cache?.owner!==owner) {
        cache=await store.get('cloud-record-cache:'+owner);guard(owner,token);
        if(cache?.format!==4 || cache.owner!==owner || !Array.isArray(cache.records))cache=null;
      }
      if(same(head,cache?.head)) {
        const data=R.workspace(cache.records);await acknowledge(owner,token,head,cache.records);
        return {...head,data};
      }
      // A retained baseline permits small delta reads. A pruned baseline may
      // restart as a full paged read; ambiguous writes never fall back.
      for(let attempt=0;attempt<2;attempt++) {
        const baseline=attempt===0 && cache?.owner===owner && cache.head?.revision<head.revision?cache:null;
        const records=new Map((baseline?.records || []).map(row=>[R.identity(row),row]));
        let after=null;
        try {
          do {
            const page=await call(owner,token,'planner_records_page',{p_revision:head.revision,p_since:baseline?.head.revision ?? null,p_after:after,p_limit:128,p_max_bytes:524288});
            if(!same(head,page.head) || !Array.isArray(page.records))throw failure('Cloud data changed while reading. Try again.');
            for(const row of page.records)if(row.deleted)records.delete(R.identity(row));else records.set(R.identity(row),copy(row));
            const next=page.next;
            if(!page.complete && (!next || JSON.stringify(next)===JSON.stringify(after)))throw failure('Cloud paging did not advance.');
            after=page.complete?null:next;
          }while(after);
          const value=[...records.values()],data=R.workspace(value);
          guard(owner,token);
          const saved={format:4,owner,head:copy(head),records:value};
          await store.put('cloud-record-cache:'+owner,saved);guard(owner,token);cache=saved;
          await acknowledge(owner,token,head,value);
          return {...head,data};
        }catch(error) {if(!baseline || error.code!=='40001')throw error;}
      }
      throw failure('Cloud data changed while reading. Try again.');
    }
    function batches(changes) {
      const result=[];let batch=[],bytes=2;
      for(const row of changes) {
        const size=R.jsonbBytes(row);
        if(size>16*1024*1024+4096)throw failure('A cloud record is too large. Your data remains saved locally.','RECORD_TOO_LARGE');
        if(batch.length && (batch.length>=256 || bytes+size+2>524288)){result.push(batch);batch=[];bytes=2;}
        batch.push(row);bytes+=size+(batch.length>1?2:0);
        if(size+2>524288){result.push(batch);batch=[];bytes=2;}
      }
      if(batch.length || !result.length)result.push(batch);
      if(result.length>1024)throw failure('Too many changes for one cloud save. Your data remains saved locally.','RECORD_BATCH_LIMIT');
      return result;
    }
    async function write(owner,revision,operation,data,base) {
      const token=generation();guard(owner,token);
      const next=R.rows(data),changes=R.changes(next,base?R.rows(base):[]);
      const hash=await C.fingerprint({revision,changes});guard(owner,token);
      // Tabs on the same account may stage different operations concurrently.
      // Each immutable request owns its key and can acknowledge only that key.
      const key='cloud-record-pending:'+owner+':'+operation;
      let pending=await store.get(key);guard(owner,token);
      if(pending?.operation===operation && (pending.hash!==hash || pending.revision!==revision))throw failure('Cloud operation was reused for different data.','22023');
      if(pending?.operation!==operation) {
        pending={format:4,owner,revision,operation,hash,batches:batches(changes)};
        await store.put(key,pending);guard(owner,token);
      }
      // Activation is a once-per-account conversion, never a speculative save.
      // With no prior account data, it reserves the normalized writer boundary.
      const head=await call(owner,token,'planner_records_metadata',{});
      if(!head || head.format===3)await call(owner,token,'planner_records_activate',{p_expected_revision:revision});
      for(let index=0;index<pending.batches.length;index++)await call(owner,token,'planner_records_stage',{
        p_expected_revision:revision,p_operation_id:operation,p_batch_index:index,p_batch_count:pending.batches.length,p_changes:pending.batches[index]});
      const saved=await call(owner,token,'planner_records_commit',{p_expected_revision:revision,p_operation_id:operation});
      if(saved?.format!==4 || saved.operation_id!==operation || saved.revision!==revision+1 || saved.game_key!==data.game || typeof saved.updated_at!=='string')throw failure('Cloud save acknowledgement did not match the requested operation.');
      const verified={format:4,owner,head:copy(saved),records:next};
      await store.put('cloud-record-cache:'+owner,verified);guard(owner,token);cache=verified;
      await store.remove(key);guard(owner,token);
      return saved;
    }
    async function readRevision(owner,head) {
      const token=generation(),records=[];let after=null;
      do {
        const page=await call(owner,token,'planner_records_page',{p_revision:head.revision,p_since:null,p_after:after,p_limit:128,p_max_bytes:524288});
        if(!same(head,page.head) || !Array.isArray(page.records))throw failure('The requested recovery version changed.');
        records.push(...page.records.filter(row=>!row.deleted));
        if(!page.complete && (!page.next || JSON.stringify(page.next)===JSON.stringify(after)))throw failure('Cloud paging did not advance.');
        after=page.complete?null:page.next;
      }while(after);
      guard(owner,token);return {...head,data:R.workspace(records)};
    }
    return {readMetadata:metadata,read,write,readRevision,clearMemory(){cache=null;}};
  }
  window.DNCloudRecordTransport={create};
})();
