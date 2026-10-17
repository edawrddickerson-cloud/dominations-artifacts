/* Authority: Scanner speed plan. Ownership: Collector rendering and persistence.
 * Invariants: Every changed result is submitted immediately, raw evidence stays
 * separate from the accepted item, and older entries retain their DOM nodes.
 * Uses DOM/ordered-storage doubles; real OCR accuracy is tested separately. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui/scanner-collection.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function element() {
  return {checked:true,dataset:{},listeners:{},children:[],html:'',text:'',htmlWrites:0,nodeChanges:0,
    addEventListener(name,fn){this.listeners[name]=fn;},
    set innerHTML(value){this.html=value;this.htmlWrites++;},get innerHTML(){return this.html;},
    set textContent(value){this.text=value;this.children=[];},get textContent(){return this.text;},
    get firstChild(){return this.children[0] || null;},
    insertBefore(node,before){const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,node);this.nodeChanges++;},
    replaceChild(node,prior){const index=this.children.indexOf(prior);assert.ok(index>=0);this.children[index]=node;this.nodeChanges++;}};
}
const result=value=>({valid:true,hall:'main',artifact:{type:'Weapon',image:'data:image/jpeg;base64,artwork'},
  rows:Array.from({length:5},(_,i)=>({known:true,name:'Damage '+i,value,raw:'Damage '+i+' +'+value+'%',hasPercent:true}))});
async function browser(initialData) {
  const ids=['scanner-collect','scanner-save-logs','scanner-log-storage-status','scanner-collection-count','scanner-collected-labels',
    'scanner-collection-clear','scanner-read','scanner-item-log','scanner-item-count'];
  const elements=Object.fromEntries(ids.map(id=>[id,element()])),events={},preferences=new Map(),operations=[];
  let durable=initialData?JSON.stringify(initialData):null,queue=Promise.resolve(),block=null,failure=false;
  const storage={async read(){return durable;},write(value){
    operations.push({kind:'write',value});const gate=block?.promise;
    queue=queue.catch(()=>{}).then(async()=>{if(gate)await gate;if(failure)throw Error('quota');durable=value;});return queue;
  },remove(){operations.push({kind:'remove'});const gate=block?.promise;
    queue=queue.catch(()=>{}).then(async()=>{if(gate)await gate;durable=null;});return queue;}};
  const window={DN:{scannerLog:storage,ARTIFACT_TYPE_EXHIBITS:{Main:[],War:[]}},addEventListener:(name,fn)=>events[name]=fn};
  window.DNScannerKeep={loggedReason:()=>'',async keepLogged(item){
    assert.equal(item.image,'data:image/jpeg;base64,artwork','Keep receives locally persisted artwork');
    window.DNScannerCollection.markKept(item.id,'kept-'+item.id);
  }};
  const app={window,document:{getElementById:id=>elements[id] || null,createElement:()=>element()},
    localStorage:{getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value)},Date,confirm:()=>true};
  vm.createContext(app);await vm.runInContext(source,app);await window.DNScannerCollection.flush();operations.length=0;
  return {collection:window.DNScannerCollection,e:elements,events,operations,get durable(){return durable;},
    block(){block=deferred();return block;},fail(){failure=true;},unblock(){block?.resolve();block=null;}};
}
(async()=>{
  const initial={version:2,items:Array.from({length:1000},(_,i)=>({id:'old-'+i,expectedRows:5,hall:'main',type:'Weapon',rows:result(1).rows})),scans:[],labels:[]};
  const app=await browser(initial),log=app.e['scanner-item-log'];
  assert.equal(log.children.length,1000,'all historical entries remain accessible');
  const oldest=log.children.at(-1),priorNewest=log.children[0],before=log.nodeChanges;
  const options={profileKey:'collection:a',encounterId:'[1,1]',steadyState:true};
  let publishes=0;
  assert.equal(app.collection.recordResult(result(1),result(6),1,options,()=>{
    publishes++;assert.equal(app.collection.itemForEncounter('[1,1]','collection:a').rows[0].value,6,'score/Keep can read the accepted item before publishing');
    assert.equal(app.operations.length,0,'score publishes before serialization and log rendering');
  }),true);
  assert.equal(publishes,1);assert.equal(app.operations.length,1,'one result causes one immediately submitted durable snapshot');
  const submitted=JSON.parse(app.operations[0].value);
  assert.equal(submitted.scans[0].observations[0].rows[0].value,1,'raw evidence is retained separately');
  assert.equal(submitted.items.at(-1).rows[0].value,6,'the best read is retained as the item');
  assert.equal(log.nodeChanges-before,1,'one new result inserts one item node');
  assert.equal(log.htmlWrites,0,'the history container is never rebuilt with innerHTML');
  assert.equal(log.children.length,1001);assert.equal(log.children[1],priorNewest);assert.equal(log.children.at(-1),oldest);
  assert.match(log.children[0].innerHTML,/Item 1001/);assert.match(oldest.innerHTML,/Item 1<\/strong>/);
  await app.collection.flush();assert.equal(log.nodeChanges-before,1,'storage completion does not render the history again');
  app.operations.length=0;
  assert.equal(app.collection.recordResult(result(1),result(6),1,options,()=>publishes++),false,'identical evidence and item retries are unchanged');
  assert.equal(app.operations.length,0,'unchanged retries do not serialize or persist');assert.equal(log.nodeChanges-before,1);
  const id=log.children[0].dataset.logItem;
  app.collection.recordResult(result(11),result(11),1,options);
  assert.equal(log.nodeChanges-before,2,'a changed retry replaces only its own node');assert.equal(log.children.at(-1),oldest);
  await app.collection.flush();
  await log.listeners.click({target:{closest:()=>({disabled:false,dataset:{keepLog:id}})}});
  await app.collection.flush();
  assert.equal(JSON.parse(app.durable).items.at(-1).keptId,'kept-'+id,'Keep changes persist in the same item');
  assert.match(log.children[0].innerHTML,/>Kept<\/button>/);assert.equal(log.children.at(-1),oldest);
  const writes=app.operations.length;
  app.collection.markKept(id,'kept-'+id);assert.equal(app.operations.length,writes,'unchanged Keep metadata does not save again');
  console.log('1000-entry history: one batch save, one changed DOM node, untouched historical nodes, Keep artwork, and unchanged-retry suppression passed.');

  const ordered=await browser(),gate=ordered.block(),entry=result(1);
  ordered.collection.recordResult(entry,entry,1,{encounterId:'1',profileKey:'p'});
  ordered.collection.recordResult(result(6),result(6),2,{encounterId:'2',profileKey:'p'});
  assert.equal(ordered.operations.length,2,'rapid observations are submitted before any storage completion, without waiting for timers');
  assert.equal(JSON.parse(ordered.operations[0].value).items.length,1,'queued snapshots cannot be mutated by later reads');
  ordered.e['scanner-save-logs'].checked=false;
  const optedOut=ordered.e['scanner-save-logs'].listeners.change();
  assert.deepEqual(ordered.operations.map(op=>op.kind),['write','write','remove'],'opt-out deletion follows both pending writes');
  gate.resolve();await optedOut;assert.equal(ordered.durable,null,'pending writes cannot restore an opted-out log');
  ordered.e['scanner-save-logs'].checked=true;await ordered.e['scanner-save-logs'].listeners.change();
  assert.equal(JSON.parse(ordered.durable).items.length,2,'enabling saving retains both observations in memory');
  const clearGate=ordered.block();
  ordered.collection.recordResult(result(11),result(11),3,{encounterId:'3',profileKey:'p'});
  ordered.e['scanner-collection-clear'].listeners.click();
  assert.equal(JSON.parse(ordered.operations.at(-1).value).items.length,0,'clear submits the empty log immediately after the pending save');
  clearGate.resolve();await ordered.collection.flush();assert.equal(JSON.parse(ordered.durable).items.length,0);assert.equal(ordered.e['scanner-item-log'].children.length,0);
  ordered.fail();ordered.collection.recordResult(result(1),result(1),4,{});await ordered.collection.flush();
  assert.match(ordered.e['scanner-log-storage-status'].textContent,/Could not save/);
  console.log('Immediate write submission, immutable snapshots, ordered opt-out, save re-enable, pending-write clear, and failure status passed.');

  const thrown=await browser();
  assert.throws(()=>thrown.collection.recordResult(result(1),result(1),1,{},()=>{throw Error('render failure');}),/render failure/);
  assert.equal(thrown.operations.length,1,'a publishing failure still submits the observed result');await thrown.collection.flush();
  assert.equal(JSON.parse(thrown.durable).items.length,1);
  thrown.e['scanner-collect'].checked=false;let disabledPublish=false;
  assert.equal(thrown.collection.recordResult(result(6),result(6),2,{},()=>disabledPublish=true),false);
  assert.equal(disabledPublish,true,'visible result publication still runs with collection disabled');
  assert.equal(thrown.operations.length,1,'disabled collection does not save new observations');
  console.log('Publishing failure durability and disabled-collection publication passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
