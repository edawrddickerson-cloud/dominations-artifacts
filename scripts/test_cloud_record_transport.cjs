'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const app={window:{},TextEncoder,crypto:crypto.webcrypto};vm.createContext(app);
for(const name of ['crafting-history','integration-core','workspace-records','cloud-record-transport'])vm.runInContext(fs.readFileSync('ui/'+name+'.js','utf8'),app);
const C=app.window.DNIntegrationCore,R=app.window.DNWorkspaceRecords,T=app.window.DNCloudRecordTransport,copy=value=>JSON.parse(JSON.stringify(value));
const workspace=(count=600)=>copy(C.createWorkspace({'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]})},[{id:'items',items:[]},{id:'collection:main',items:[]}],{version:2,items:Array.from({length:count},(_,i)=>({id:'craft-'+i,rows:[]}))}));
function fixture(initial) {
  const f={owner:'owner-a',generation:0,calls:[],rows:new Map(),stages:new Map(),state:new Map(),head:null,failPage:false,loseCommit:false};
  f.store={get:async key=>copy(f.state.get(key) || null),put:async(key,value)=>{f.state.set(key,copy(value));await f.afterStore?.(key);},remove:async key=>f.state.delete(key)};
  f.rpc=async(name,args)=>{
    f.calls.push({name,args:copy(args)});assert.equal(args.p_owner,f.owner);
    let result;
    if(name==='planner_records_metadata')result=f.head;
    else if(name==='planner_records_activate'){if(!f.head)f.head={format:4,game_key:'dominations',revision:0,operation_id:null,updated_at:'start'};result=f.head;}
    else if(name==='planner_records_stage'){
      const id=args.p_operation_id+':'+args.p_batch_index,prior=f.stages.get(id);
      if(prior)assert.deepEqual(prior,copy(args));else f.stages.set(id,copy(args));
      result={staged:true,index:args.p_batch_index};
    }else if(name==='planner_records_commit'){
      if(f.head.operation_id!==args.p_operation_id){assert.equal(f.head.revision,args.p_expected_revision);const batches=[...f.stages.values()].filter(batch=>batch.p_operation_id===args.p_operation_id);assert.equal(batches.length,batches[0].p_batch_count);
        for(const batch of batches)for(const row of batch.p_changes)if(row.deleted)f.rows.delete(R.identity(row));else f.rows.set(R.identity(row),copy(row));
        f.head={format:4,game_key:'dominations',revision:f.head.revision+1,operation_id:args.p_operation_id,updated_at:'time-'+(f.head.revision+1)};
      }
      if(f.loseCommit){f.loseCommit=false;throw Error('Lost committed response');}result=f.head;
    }else if(name==='planner_records_page'){
      if(f.failPage && args.p_since!==null){f.failPage=false;throw Object.assign(Error('Pruned baseline'),{code:'40001'});}
      const source=args.p_since!==null && f.delta?f.delta:[...f.rows.values()];
      const all=source.slice().sort((a,b)=>R.identity(a)<R.identity(b)?-1:1),after=args.p_after?JSON.stringify(args.p_after):null;
      const start=after?all.findIndex(row=>R.identity(row)===after)+1:0,records=all.slice(start,start+128),complete=start+128>=all.length;
      result={head:f.head,records,next:complete?null:JSON.parse(R.identity(records.at(-1))),complete};
    }else throw Error('Unexpected RPC '+name);
    await f.afterRpc?.(name,args,result);return copy(result);
  };
  if(initial){for(const row of R.rows(initial))f.rows.set(R.identity(row),copy(row));f.head={format:4,game_key:'dominations',revision:1,operation_id:'initial',updated_at:'time-1'};}
  f.attach=()=>f.remote=T.create({rpc:f.rpc,store:f.store,user:()=>f.owner,generation:()=>f.generation});f.attach();return f;
}
(async()=>{
  const original=workspace(),f=fixture();
  const reserved=fixture();await reserved.rpc('planner_records_activate',{p_owner:reserved.owner,p_expected_revision:0});reserved.attach();
  assert.equal(await reserved.remote.readMetadata(reserved.owner),null,'activation crash leaves a logically missing workspace');
  assert.equal(await reserved.remote.read(reserved.owner),null);await reserved.remote.write(reserved.owner,0,'after-activation-crash',original,null);assert.equal(reserved.head.revision,1);
  const saved=await f.remote.write(f.owner,0,'first',original,null);assert.equal(saved.revision,1);
  const stages=f.calls.filter(call=>call.name==='planner_records_stage');assert(stages.length>=3);assert(stages.every(call=>call.args.p_changes.length<=256));assert.equal(f.calls.filter(call=>call.name==='planner_records_commit').length,1);
  assert.deepEqual(copy(R.workspace([...f.rows.values()])),original);
  f.calls=[];const next=copy(original);next.craftingLog.items.push(copy(app.window.DNCraftingHistory.project({version:2,items:[{id:'new',rows:[]}]}).items[0]));
  await f.remote.write(f.owner,1,'second',next,original);assert.equal(f.calls.find(call=>call.name==='planner_records_stage').args.p_changes.length,1);
  f.attach();f.calls=[];assert.deepEqual(copy((await f.remote.read(f.owner)).data),next);assert.equal(f.calls.filter(call=>call.name==='planner_records_page').length,0,'persistent verified cache avoids a full read');
  const cold=fixture(next);assert.deepEqual(copy((await cold.remote.read(cold.owner)).data),next);assert(cold.calls.filter(call=>call.name==='planner_records_page').length>1);
  const lost=fixture(original);lost.loseCommit=true;
  await assert.rejects(()=>lost.remote.write(lost.owner,1,'lost',next,original),/Lost committed/);assert(lost.state.has('cloud-record-pending:'+lost.owner+':lost'));
  lost.attach();await lost.remote.write(lost.owner,1,'lost',next,original);assert.equal(lost.head.revision,2,'reload retry does not commit twice');assert(!lost.state.has('cloud-record-pending:'+lost.owner+':lost'));
  const race=fixture(original);race.afterRpc=name=>{if(name==='planner_records_page'){race.owner='owner-b';race.generation++;}};
  await assert.rejects(()=>race.remote.read('owner-a'),/account changed/);assert(!race.state.has('cloud-record-cache:owner-a'));
  const partial=fixture(original);partial.afterRpc=name=>{if(name==='planner_records_stage'){partial.afterRpc=null;throw Error('Network after stage');}};
  await assert.rejects(()=>partial.remote.write(partial.owner,1,'partial',next,original),/Network after stage/);assert.equal(partial.head.revision,1);assert.deepEqual(copy(R.workspace([...partial.rows.values()])),original,'staging cannot publish partial workspace');
  await partial.remote.write(partial.owner,1,'partial',next,original);assert.equal(partial.head.revision,2);
  const pruned=fixture(original);await pruned.remote.read(pruned.owner);pruned.head={...pruned.head,revision:2,operation_id:'other',updated_at:'time-2'};pruned.failPage=true;
  assert.deepEqual(copy((await pruned.remote.read(pruned.owner)).data),original,'pruned delta baseline falls back only to a full read');
  const deltaRead=fixture(original);await deltaRead.remote.read(deltaRead.owner);
  const reduced=copy(original);reduced.craftingLog.items.pop();reduced.settings['dn-p:main:dn-artifact-score-mode']='"potential"';
  deltaRead.delta=copy(R.changes(R.rows(reduced),R.rows(original)));
  assert(deltaRead.delta.some(row=>row.deleted));assert.equal(deltaRead.delta.length,2);
  deltaRead.head={...deltaRead.head,revision:2,operation_id:'delta',updated_at:'time-2'};
  assert.deepEqual(copy((await deltaRead.remote.read(deltaRead.owner)).data),reduced,'delta tombstones remove records while unchanged cached records survive');
  const incoherent=fixture(original);incoherent.afterRpc=(name,_args,result)=>{if(name==='planner_records_commit')result.operation_id='wrong-operation';};
  await assert.rejects(()=>incoherent.remote.write(incoherent.owner,1,'ack-check',next,original),/acknowledgement did not match/);
  assert(!incoherent.state.has('cloud-record-cache:'+incoherent.owner));assert(incoherent.state.has('cloud-record-pending:'+incoherent.owner+':ack-check'));
  console.log('Atomic bounded staging, sparse writes, pinned paging, durable cache/retry, partial failure, pruned baseline and account-race transport checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
