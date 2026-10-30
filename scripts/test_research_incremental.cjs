/* Incremental research transport over the canonical log. No external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const copy=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const pgText=value=>Array.isArray(value)?'['+value.map(pgText).join(', ')+']':value && typeof value==='object'?'{'+Object.entries(value).map(([key,entry])=>JSON.stringify(key)+': '+pgText(entry)).join(', ')+'}':JSON.stringify(value);
const names=['Armored Car Damage','Armored Car Hitpoints','Attack Helicopter Damage','Attack Helicopter Hitpoints','APC Hitpoints'];
const craft=(id,index=0)=>({id,revision:1,writer:'device-a',firstSeen:'2026-10-30T12:00:00Z',hall:'main',type:'Weapon',name:'Private title',image:'data:image/png;base64,YQ==',raw:'Private OCR',
  rows:names.map((name,i)=>({name,value:[11,11,6,1,1][i],known:true,hasPercent:true,level:1,valueSource:'ocr',raw:'Private OCR '+index}))});
function fixture(count=301){
 const app={window:{},crypto,TextEncoder};vm.createContext(app);
 for(const name of ['data/artifact_stat_context','crafting-history','crafted-log-stats','crafting-community','integration-core','research'])vm.runInContext(fs.readFileSync('ui/'+name+'.js','utf8'),app);
 const S=app.window.DNCraftingCommunity,H=app.window.DNCraftingHistory,I=app.window.DNIntegrationCore;
 const f={owner:'a',bound:'a',sharing:true,enabled:true,requests:[],writes:[],reads:0,encoded:0,epochs:0,accepted:new Map(),states:{a:{owner:'a',epoch:'epoch-a-initial',pending:null,hash:'legacy-full-history-hash'}},log:H.normalize({version:2,items:Array.from({length:count},(_,i)=>craft('craft-'+i,i))})};
 const encode=S.encode;S.encode=(...args)=>{f.encoded++;return encode(...args);};S.payload=()=>{throw Error('Full history payload must not be encoded');};
 const args={user:()=>f.owner,boundOwner:()=>f.bound,consent:()=>f.sharing,enabled:()=>f.enabled,
  async readLog(){f.reads++;const value=copy(f.log);await f.onRead?.();return value;},
  async readState(owner){const value=copy(f.states[owner] || null);await f.onLoad?.(owner);return value;},
  async writeState(owner,value){const saved=copy(value);await f.onWrite?.(owner,saved);f.states[owner]=saved;f.writes.push({owner,value:copy(saved)});},
  async rpc(name,args){const request={owner:f.owner,name,args:copy(args)};f.requests.push(request);await f.onRpc?.(request);
   if(name==='planner_set_crafting_consent'){
    if(!args.p_enabled){for(const key of f.accepted.keys())if(key.startsWith(request.owner+'|'))f.accepted.delete(key);return {epoch:'withdrawn-server-epoch'};}
    return {epoch:'epoch-'+request.owner+'-'+(++f.epochs)};
   }
   assert.equal(name,'planner_submit_crafting');const payload=args.p_payload;
   assert(payload.records.length<=100);assert(Buffer.byteLength(JSON.stringify(payload))<=262144);assert(Buffer.byteLength(pgText(payload))<=262144,'PostgreSQL JSONB batch representation stays within its cap');
   for(const record of payload.records)f.accepted.set(request.owner+'|'+args.p_epoch+'|'+record.id,copy(record));
   await f.afterAccepted?.(request);return {accepted:true};
  }};
 f.attach=()=>{f.core=app.window.DNResearchCore.create(args);return f.core;};
 f.submissions=()=>f.requests.filter(request=>request.name==='planner_submit_crafting');
 f.records=()=>f.submissions().flatMap(request=>request.args.p_payload.records);
 f.resetRequests=()=>{f.requests=[];};f.S=S;f.H=H;f.I=I;f.attach();return f;
}
(async()=>{
 // Acknowledgements contain only owner/epoch/rules-scoped digests. Legacy
 // whole-payload hashes safely resubmit once, then normal updates stay sparse.
 {
  const f=fixture();await f.core.load();await f.core.upload();
  assert.deepEqual(f.submissions().map(request=>request.args.p_payload.records.length),[100,100,100,1]);
  assert.equal(f.encoded,301);assert.equal(Object.keys(f.states.a.acknowledged.records).length,301);
  assert.equal(f.states.a.acknowledged.owner,'a');assert.equal(f.states.a.acknowledged.epoch,'epoch-a-initial');
  assert(Object.values(f.states.a.acknowledged.records).every(value=>/^[a-f0-9]{64}$/.test(value)));
  assert(!/Private title|Private OCR|data:image|Armored Car/.test(JSON.stringify(f.states)),'durable service state contains no craft projection bodies or private fields');
  f.resetRequests();await f.core.upload();assert.equal(f.encoded,301,'unchanged source signatures bypass encoding');assert.equal(f.requests.length,0);
  f.log.items.push(craft('new-craft'));await f.core.upload();assert.deepEqual(f.records().map(record=>record.id),['new-craft']);assert.equal(f.encoded,302);
  f.resetRequests();f.log.items[0].revision++;f.log.items[0].rows[0].value=6;await f.core.upload();assert.deepEqual(f.records().map(record=>record.id),['craft-0']);
  assert.equal(f.records()[0].rows[0].value,6);
  f.resetRequests();f.log.items[1].name='Other private name';f.log.items[1].keptId='kept';f.log.items[1].image='data:image/png;base64,Yg==';await f.core.upload();assert.equal(f.requests.length,0,'non-evidence fields do not cause submissions');
  f.log.items[2].revision++;f.log.items[2].rows[0].valueSource='manual';await f.core.upload();assert.equal(f.records().length,1);assert.equal(f.records()[0].exclusion,'manual');
  f.resetRequests();f.attach();await f.core.load();await f.core.upload();assert.equal(f.requests.length,0,'reload rechecks sources against durable digests without resubmitting');
  const before=copy(f.log);f.log.ledger.archived.push(...f.log.items.map(f.H.facts));f.log.items=[];await f.core.upload();
  assert.equal(f.records().length,302);assert(f.records().every(record=>record.deleted && record.exclusion==='archived' && record.rows.length===0));
  f.resetRequests();await f.core.upload();assert.equal(f.requests.length,0);
  assert.equal(before.items.length,302);
 }
 // Only unacknowledged batches retry after a partial failure or reload.
 {
  const f=fixture();let submits=0;f.onRpc=request=>{if(request.name==='planner_submit_crafting' && ++submits===2)throw Error('offline');};
  await f.core.load();await f.core.upload();assert.equal(Object.keys(f.states.a.acknowledged.records).length,100);
  f.onRpc=null;f.resetRequests();f.attach();await f.core.load();await f.core.upload();
  assert.deepEqual(f.submissions().map(request=>request.args.p_payload.records.length),[100,100,1]);assert.equal(f.records()[0].id,'craft-100');
  assert.equal(f.accepted.size,301);
 }
 // A lost success response retries the same records unchanged; accepted prior
 // batches remain acknowledged and are never resent as part of that retry.
 {
  const f=fixture();let accepts=0,lost;
  f.afterAccepted=request=>{if(++accepts===2){lost=copy(request.args.p_payload);throw Error('lost acknowledgement');}};
  await f.core.load();await f.core.upload();assert.equal(f.accepted.size,200);assert.equal(Object.keys(f.states.a.acknowledged.records).length,100);
  f.afterAccepted=null;f.resetRequests();f.attach();await f.core.load();await f.core.upload();
  assert.deepEqual(f.submissions()[0].args.p_payload,lost);assert.equal(f.accepted.size,301);assert.equal(f.records().length,201);
 }
 // Dense UTF-8 identities fit the server's field limits while forcing batches
 // below the count limit. Measure JSONB text spacing, not just compact JSON.
 {
  const f=fixture();f.log.items=f.log.items.map((item,i)=>({...item,id:'\u{1f512}'.repeat(500)+'-'+i,writer:'\u{1f512}'.repeat(120)}));
  await f.core.load();await f.core.upload();assert.equal(f.records().length,301);assert(f.submissions().every(request=>request.args.p_payload.records.length<100));
  assert(f.submissions().some(request=>Buffer.byteLength(pgText(request.args.p_payload))>250000),'fixture exercises the byte boundary');
 }
 // New epochs and rules cannot inherit old acknowledgements; another account
 // cannot inherit even the receipt. Withdrawal works offline and while disabled.
 {
  const f=fixture();await f.core.load();await f.core.upload();f.resetRequests();await f.core.setSharing(true);
  assert.equal(f.records().length,301);assert(f.submissions().every(request=>request.args.p_epoch==='epoch-a-1'));
  f.resetRequests();f.S.RULES+='-test-policy-revision';await f.core.upload();assert.equal(f.records().length,301,'rules scope resets old digests');
  const priorA=copy(f.states.a);f.owner='b';f.bound='b';await f.core.load();f.resetRequests();await f.core.upload();assert.equal(f.requests.length,0);
  await f.core.setSharing(true);assert.equal(f.records().length,301);assert(f.submissions().every(request=>request.owner==='b' && request.args.p_epoch==='epoch-b-2'));assert.deepEqual(f.states.a,priorA);
  f.sharing=false;f.onRpc=()=>{throw Error('offline');};await f.core.clear();assert.equal(f.states.b.epoch,null);assert.equal(f.states.b.acknowledged,null);assert.equal(f.states.b.pending,false);
  f.enabled=false;f.onRpc=null;f.attach();await f.core.load();f.resetRequests();await f.core.upload();assert.equal(f.requests.length,1);assert.equal(f.requests[0].args.p_enabled,false);
 }
 // Permission denial is terminal, including reload. Explicit review can resume.
 {
  const f=fixture(1);f.onRpc=request=>{if(request.name==='planner_submit_crafting')throw Object.assign(Error('consent revoked'),{code:'42501'});};
  await f.core.load();await f.core.upload();const reads=f.reads,requests=f.requests.length;
  await f.core.upload();f.attach();await f.core.load();await f.core.upload();assert.equal(f.reads,reads);assert.equal(f.requests.length,requests);assert(f.states.a.requiresConsentReview);
  f.onRpc=null;await f.core.setSharing(true);assert.equal(f.core.status().error,'');assert.equal(f.records().at(-1).id,'craft-0');
 }
 // A choice during an awaited read or digest invalidates all old projections.
 {
  const f=fixture(),started=deferred(),finish=deferred();f.onRead=async()=>{started.resolve();await finish.promise;};
  await f.core.load();const old=f.core.upload();await started.promise;f.sharing=false;await f.core.clear();finish.resolve();await old;
  assert.equal(f.encoded,0);assert.equal(f.submissions().length,0);assert.equal(f.states.a.pending,false);f.onRead=null;await f.core.upload();assert.equal(f.requests.at(-1).args.p_enabled,false);
 }
 {
  const f=fixture(),started=deferred(),finish=deferred(),fingerprint=f.I.fingerprint;let first=true;
  f.I.fingerprint=async value=>{if(first){first=false;started.resolve();await finish.promise;}return fingerprint(value);};
  await f.core.load();const old=f.core.upload();await started.promise;await f.core.setSharing(true);finish.resolve();await old;
  assert.equal(f.submissions().length,0);assert.equal(f.states.a.pending,true);await f.core.upload();assert.equal(f.records().length,301);
 }
 // Accepted old requests cannot acknowledge a newer explicit consent choice.
 {
  const f=fixture(),started=deferred(),finish=deferred();let first=true;
  f.onRpc=async request=>{if(first && request.name==='planner_submit_crafting'){first=false;started.resolve();await finish.promise;}};
  await f.core.load();const old=f.core.upload();await started.promise;await f.core.setSharing(true);const operation=f.states.a.operation;finish.resolve();await old;
  assert.equal(f.states.a.operation,operation);assert.equal(f.states.a.pending,true);assert.equal(f.states.a.acknowledged,null);
  f.resetRequests();await f.core.upload();assert.equal(f.records().length,301);assert(f.submissions().every(request=>request.args.p_epoch==='epoch-a-1'));
 }
 // An already-started durable ack commit must finish before a newer sharing
 // choice's commit, and it cannot replace the newer in-memory choice afterward.
 {
  const f=fixture(),started=deferred(),finish=deferred();let first=true;
  f.onWrite=async(owner,value)=>{if(first && value.acknowledged){first=false;started.resolve();await finish.promise;}};
  await f.core.load();const old=f.core.upload();await started.promise;const newer=f.core.setSharing(true),operation=f.core.export().operation;finish.resolve();await Promise.all([old,newer]);
  const acknowledgedIndex=f.writes.findIndex(write=>write.value.acknowledged?.epoch==='epoch-a-initial');
  const choiceIndex=f.writes.findIndex(write=>write.value.operation===operation);
  assert(choiceIndex>acknowledgedIndex,'the newer explicit choice commits after the old acknowledgement');
  assert.notEqual(f.states.a.acknowledged?.epoch,'epoch-a-initial');
  await f.core.upload();assert.equal(f.states.a.acknowledged.epoch,'epoch-a-1');
 }
 // Account changes during reads and accepted submissions cannot persist another
 // account's cursor/digests or start a second old-account batch.
 for(const stage of ['read','submission']){
  const f=fixture(),started=deferred(),finish=deferred();let first=true;
  if(stage==='read')f.onRead=async()=>{started.resolve();await finish.promise;};
  else f.onRpc=async request=>{if(first && request.name==='planner_submit_crafting'){first=false;started.resolve();await finish.promise;}};
  await f.core.load();const old=f.core.upload();await started.promise;f.owner='b';f.bound='b';await f.core.load();finish.resolve();await old;
  assert.equal(f.states.b,undefined);assert.equal(f.states.a.acknowledged,undefined);assert(f.submissions().length<=1);await f.core.upload();assert.equal(f.states.b,undefined);
 }
 {
  const f=fixture(),started=deferred(),finish=deferred();
  f.onRpc=async request=>{if(request.name==='planner_submit_crafting'){started.resolve();await finish.promise;throw Object.assign(Error('stale epoch'),{code:'42501'});}};
  await f.core.load();const old=f.core.upload();await started.promise;f.sharing=false;await f.core.clear();finish.resolve();await old;
  assert.equal(f.states.a.requiresConsentReview,false);assert.equal(f.states.a.pending,false);assert.equal(f.states.a.epoch,null);
 }
 // A failed local acknowledgement commit retries its accepted batch after reload.
 {
  const f=fixture();let failed=false;
  f.onWrite=(owner,value)=>{if(!failed && Object.keys(value.acknowledged?.records || {}).length===200){failed=true;throw Error('storage failed');}};
  await f.core.load();await f.core.upload();assert.equal(f.accepted.size,200);assert.equal(Object.keys(f.states.a.acknowledged.records).length,100);
  f.onWrite=null;f.resetRequests();f.attach();await f.core.load();await f.core.upload();assert.equal(f.records().length,201);assert.equal(f.records()[0].id,'craft-100');
 }
 // Stale account state reads and stale enable receipts are never installed.
 {
  const f=fixture(),started=deferred(),finish=deferred();
  f.onLoad=async owner=>{if(owner==='a'){started.resolve();await finish.promise;}};
  const old=f.core.load();await started.promise;f.owner='b';f.bound='b';await f.core.load();finish.resolve();await old;
  assert.equal(f.core.export().owner,'b');await f.core.upload();assert.equal(f.requests.length,0);
 }
 {
  const f=fixture(),started=deferred(),finish=deferred();f.states.a.epoch=null;
  f.onRpc=async request=>{if(request.name==='planner_set_crafting_consent' && request.args.p_enabled){started.resolve();await finish.promise;}};
  await f.core.load();const old=f.core.setSharing(true);await started.promise;f.sharing=false;await f.core.clear();finish.resolve();await old;
  assert.equal(f.states.a.epoch,null);assert.equal(f.states.a.pending,false);assert.equal(f.submissions().length,0);await f.core.upload();assert.equal(f.states.a.pending,null);assert.equal(f.submissions().length,0);
 }
 console.log('Incremental research: 301-record migration, sparse edits, source cache, reload, per-batch durable acknowledgements, partial/lost retries, UTF-8/JSONB byte bounds, archive, epoch/rules/account isolation and await-boundary consent races passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
