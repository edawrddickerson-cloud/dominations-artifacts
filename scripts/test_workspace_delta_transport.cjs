/* Exercise the actual adapter and sync engine. No external network or accounts. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const app={window:{},TextEncoder,crypto};vm.createContext(app);
for(const name of ['crafting-history','integration-core','cloud-sync'])vm.runInContext(fs.readFileSync('ui/'+name+'.js','utf8'),app);
const C=app.window.DNIntegrationCore,copy=v=>JSON.parse(JSON.stringify(v));
const workspace=(n=1)=>C.createWorkspace({'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]}),'dn-artifact-perk-ratings-global':JSON.stringify({n})},[{id:'items',items:[]},{id:'collection:main',items:[]}],{version:2,items:[{id:'craft',rows:[]}]});
const metadata=row=>row?Object.fromEntries(['game_key','revision','operation_id','updated_at'].map(key=>[key,row[key]])):null;
async function fixture(enabled){
  let remote,clientOptions;const f={row:{game_key:'dominations',revision:1,operation_id:'first',updated_at:'2026-10-30T00:00:00Z',data:copy(workspace())},calls:[],timers:[],local:copy(workspace()),binding:null};
  const client={from(){let columns;return {select(value){columns=value;return this;},eq(){return this;},async maybeSingle(){return {status:200,data:columns.includes('data')?copy(f.row):copy(metadata(f.row))};}};},
    async rpc(name,args){f.calls.push({name,args:copy(args)});if(name==='planner_set_research_consent')return {data:{}};
      if(f.failure)return {error:{code:f.failure},status:404};
      assert.equal(args.p_expected_revision,f.row.revision);
      const data=copy(args.p_data);if(args.p_items_delta){const base=f.row.data.craftingLog.items;data.craftingLog.items=Array.from({length:args.p_items_delta.length},(_,i)=>args.p_items_delta.changes[i] ?? base[i]);}
      f.row={game_key:'dominations',revision:f.row.revision+1,operation_id:args.p_operation_id,updated_at:'2026-10-30T00:00:'+String(f.row.revision)+'Z',data};
      if(f.lost){f.lost=false;throw Error('connection lost after commit');}
      return {data:name.endsWith('_v3')?copy(metadata(f.row)):copy(f.row)};
    },auth:{onAuthStateChange(fn){f.authChanged=fn;},getSession:async()=>({data:{session:{user:{id:'owner'}}}})}};
  const browser={window:{DNIntegrationCore:{...C,cloudReady:()=>true},DNServiceConfig:{workspaceDeltaSaves:enabled,supabaseUrl:'https://example.invalid',supabasePublishableKey:'sb_publishable_test'},DNStoredArtifacts:{},DNConsent:{subscribe(){}},
    DNCloudSyncCore:{create(options){remote=options.remote;return {setOwner(){},state:()=>({})};}},supabase:{createClient(url,key,options){clientOptions=options;return client;}},dispatchEvent(){},addEventListener(){}},
    document:{addEventListener(){}},location:{origin:'http://127.0.0.1:8765'},localStorage:{getItem:()=>null},URL,CustomEvent:class{},AbortController,
    setTimeout:(fn,delay)=>{f.timers.push({fn,delay});return 0;},clearTimeout(){},setInterval:()=>0,fetch:async()=>({ok:true})};
  vm.createContext(browser);vm.runInContext(fs.readFileSync('ui/cloud.js','utf8'),browser);await browser.window.DNCloud.start();await browser.window.DNCloud.consentReady();f.calls=[];
  f.sync=app.window.DNCloudSyncCore.create({capture:async()=>copy(f.local),remote,readBinding:()=>f.binding,saveBinding:value=>f.binding=copy(value),recover:async()=>{},apply:async value=>{f.local=copy(value);},applyHistory:async log=>{f.local.craftingLog=copy(log);}});
  f.sync.setOwner('owner');f.binding={owner:'owner',revision:1,operation:'first',savedAt:f.row.updated_at,hash:await C.fingerprint(f.local)};
  f.remote=remote;f.browser=browser;
  await clientOptions.global.fetch('https://example.invalid/rest/v1/rpc/planner_save_workspace_v3');assert.equal(f.timers.at(-1).delay,60000,'v3 retains the workspace transfer timeout');
  return f;
}
(async()=>{
  const f=await fixture(true);await f.sync.inspect();f.local=copy(workspace(2));await f.sync.inspect();
  assert.equal(f.sync.state().status,'synced');assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'planner_save_workspace_v3');assert.deepEqual(f.calls[0].args.p_items_delta.changes,{});
  assert.deepEqual(f.row.data,f.local);await f.sync.inspect();assert.equal(f.calls.length,1,'metadata-only ack retains complete cached data');
  f.local=copy(workspace(3));f.lost=true;await f.sync.inspect();assert.equal(f.sync.state().status,'offline');assert(f.binding.pending);const committedRevision=f.row.revision;
  await f.sync.inspect();assert.equal(f.sync.state().status,'synced');assert.equal(f.row.revision,committedRevision);assert.equal(f.calls.length,2,'lost ack resolves by reading, never a v2 fallback');
  f.local=copy(workspace(4));f.failure='PGRST202';await f.sync.inspect();assert.equal(f.sync.state().status,'offline');assert.equal(f.calls.at(-1).name,'planner_save_workspace_v3');assert.equal(f.calls.length,3,'missing migration fails closed');
  const disabled=await fixture(undefined);await disabled.sync.inspect();disabled.local=copy(workspace(2));await disabled.sync.inspect();assert.equal(disabled.calls[0].name,'planner_save_workspace_v2','new path stays off without explicit activation');
  // Review coverage: metadata-only acknowledgements must work through every
  // engine write path, including reconciliation and explicit saved-data choices.
  const addCraft=(data,id)=>{data.craftingLog=copy(app.window.DNCraftingHistory.project(app.window.DNCraftingHistory.reconcile(data.craftingLog,{version:2,items:[{id,rows:[]}]})));};
  const merged=await fixture(true);addCraft(merged.local,'local-only');await merged.sync.inspect();
  assert.equal(merged.sync.state().status,'synced');assert.equal(merged.calls.length,1);assert.equal(merged.calls[0].name,'planner_save_workspace_v3');assert.deepEqual(merged.row.data,merged.local);await merged.sync.inspect();assert.equal(merged.calls.length,1,'reconciled data is cached after metadata-only acknowledgement');
  for(const choice of ['local','cloud']) {
    const selected=await fixture(true);selected.local=copy(workspace(2));addCraft(selected.local,'local-only');addCraft(selected.row.data,'cloud-only');
    await selected.sync.inspect({automatic:false});assert.equal(selected.sync.state().status,'conflict');
    const result=await selected.sync.choose(choice,selected.sync.state().comparison);assert.equal(result.status,'synced');
    assert.equal(selected.calls.length,1);assert.equal(selected.calls[0].name,'planner_save_workspace_v3');assert(selected.calls[0].args.p_items_delta);
    assert.deepEqual(selected.row.data.craftingLog.items.map(i=>i.id).sort(),['cloud-only','craft','local-only'],'both choices retain reconciled crafting history');
    assert.equal(JSON.parse(selected.row.data.settings['dn-artifact-perk-ratings-global']).n,choice==='local'?2:1);
    await selected.sync.inspect();assert.equal(selected.calls.length,1,'explicit choice caches a complete document after metadata-only acknowledgement');
  }
  console.log('Actual adapter: rollout gate, delta payloads, all four write paths, metadata acknowledgements, cached data, timeout, lost-response recovery and no unsafe fallback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
