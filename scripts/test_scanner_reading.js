/*
 * Authority: Phase 3 scanner recognition/controller verification.
 * Ownership: Standalone VM tests using real shared rating and scoring scripts.
 * Invariants: Stale results never render; duplicates count; corrections validate;
 * Stop resets processing; group/global/profile/army inheritance stays authoritative.
 * Constraints: Mock OCR outcomes; does not establish real-image OCR accuracy.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'ui', file), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const flush = async () => { for(let i=0;i<8;i++)await Promise.resolve(); };
function element() {
  let html='';
  return {value:'',checked:true,disabled:false,listeners:{},editRows:[],
    set textContent(value){html=value;},get textContent(){return html;},
    set innerHTML(value){html=value;},get innerHTML(){return html;},
    addEventListener(name,fn){this.listeners[name]=fn;},fire(name,event){return this.listeners[name]?.(event);},
    querySelectorAll(){return this.editRows;},
  };
}
async function harness({storage=false,speculation=false,workerWarm=true}={}) {
  const store=new Map(),elements={},jobs=[],engines=[],timers=new Map();let nextTimer=0,now=1000;
  for(const id of ['read','auto','layout','rows','hall','infer','progress','result-status','warnings','result','correct','accept','names','mode','off','def','profile-label','row-status'])elements[id]=element();
  elements.hall.value='main';
  elements.auto.checked=false;elements.rows.value='5';elements.layout.value='gold';
  const window=element(),keepStates=[];
  window.dispatchEvent=event=>window.fire(event.type,event);
  if(storage){window.DNStorageRecognition={inspect:()=>({expectedRows:5,hall:'main'})};window.DNStorageScanner={update:(result,confirmed,state)=>keepStates.push({result,confirmed,...state})};}
  const canvas=()=>{
    if(speculation){
      const item={width:1920,height:1080,pixel:0,rgb:null,alpha:255};
      const drawing={clearRect(){item.pixel=0;item.rgb=null;},drawImage(value){item.pixel=value.pixel;item.rgb=value.rgb?.slice() || null;item.alpha=value.alpha ?? 255;},
        putImageData(image){item.rgb=Array.from(image.data.slice(0,3));item.alpha=image.data[3];},
        getImageData(x=0,y=0,width=item.width,height=item.height){const data=new Uint8ClampedArray(width*height*4),rgb=item.rgb || [item.pixel,item.pixel,item.pixel];for(let i=0;i<data.length;i+=4)data.set([...rgb,item.alpha],i);return {data};}};
      item.getContext=()=>drawing;return item;
    }
    return {width:1920,height:1080,pixel:0,getContext(){let source,coords;return {clearRect(){},drawImage(value,...rect){source=value;coords=rect;},putImageData(){},getImageData(){const data=new Uint8ClampedArray(96*64*4).fill(source?.pixel||0);if(source?.rgb)for(let i=0;i<data.length;i+=4)data.set([...source.rgb,255],i);if(source?.jitter)data.fill(255,(source.jitterOffset || 0)*4,((source.jitterOffset || 0)+source.jitter)*4);if(source?.artworkPixel && coords?.[0]===0)data.fill(source.artworkPixel,0,data.length/4);return {data};}};}};
  };
  const context={window,Event,localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    document:{getElementById:id=>elements[id.replace('scanner-','')],createElement:canvas},performance:{now:()=>now},
    setTimeout(fn,delay=0){const id=++nextTimer;timers.set(id,{fn,due:now+delay});return id;},clearTimeout(id){timers.delete(id);},
    // Fix this fixture's troop weight so lifecycle assertions remain stable
    // when the production factory rating scale changes.
    fetch:async url=>({ok:true,text:async()=>read('data/perk_name_mapping.csv'),json:async()=>({...JSON.parse(read('data/perk_rating_defaults.json')),
      'Heavy Tank Damage':{offensive:1,defensive:0}})})};
  vm.createContext(context);
  for(const file of ['data/army_catalog.js','shared.js','data/artifact_stat_context.js','artifact-stat-context.js','artifact-scoring.js','stored-artifacts.js','scanner-frames.js','scanner-name-catalog.js','scanner-recognition.js'])vm.runInContext(read(file),context);
  if(speculation){for(const file of ['scanner-core.js','scanner-regions.js','scanner-field-recognition.js'])vm.runInContext(read(file),context);elements.layout.value='panel';}
  vm.runInContext(read('scanner-collection.js'),context);
  const collector=window.DNScannerCollectionCore.createCollector(),batches=[];
  window.DNScannerCollection={isEnabled:()=>false,record:result=>collector.record(result),recordItem:(result,id,options)=>collector.recordItem(result,id,options),
    recordResult(observation,result,id,options,publish){collector.record(observation);collector.recordItem(result,id,options);batches.push({observation,result,options});publish();}};
  const comparisons=[];
  window.DNScannerComparison={update:(result,confirmed,options,state)=>comparisons.push({result,confirmed,options,state})};
  window.DNScannerRecognition.create=function(){const warming=deferred(),engine={closed:0,warmReady:workerWarm,isWarm(){return this.warmReady;},warm(){return this.warmReady?Promise.resolve():warming.promise;},finishWarm(){this.warmReady=true;warming.resolve();},async close(){this.closed++;},recognize(snapshot,options){const job=deferred();jobs.push({...job,snapshot,options,engine});return job.promise;}};engines.push(engine);return engine;};
  vm.runInContext(read('scanner-reading.js'),context);await flush();
  return {comparisons,collector,batches,window,e:elements,jobs,engines,canvas,keepStates,DN:window.DN,reader:window.DNScannerReading,setVisible(visible){context.document.hidden=!visible;},runTimers(){const pending=[...timers.values()];timers.clear();pending.forEach(timer=>timer.fn());},advance(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.due<=now){timers.delete(id);timer.fn();}}};
}
function parsed(name='Heavy Tank Damage',value=10){return {valid:true,warnings:[],unlocked:{count:2},rows:Array.from({length:5},(_,i)=>({name,value,known:true,unlocked:i<2}))};}
function edits(e,rows){e.correct.editRows=rows.map(({name,value,base,max,level,unlocked,tier})=>({querySelector(selector){return {value:selector.includes('name')?name:selector.endsWith('-base')?String(base??''):selector.endsWith('-max')?String(max??''):selector.endsWith('-level')?String(level??''):selector.endsWith('-tier')?String(tier??''):selector.endsWith('-unlocked')?String(unlocked??''):String(value??'')};}}));}
async function main(){
  const h=await harness(),{e,reader,DN}=h;
  let successfulScans=0;h.window.addEventListener('dn-successful-scan',()=>successfulScans++);
  const source=h.canvas();reader.update(source,{session:1,current:true});
  e.read.fire('click');assert.equal(h.jobs.length,1);assert.equal(h.jobs[0].options.expectedRows,5);
  h.jobs[0].resolve(parsed());await flush();
  assert.equal(successfulScans,1,'the first successful scan signals the prompt without loading telemetry');
  assert.equal(h.window.DNSuccessfulScan,true,'a local success bit survives until account controls mount');
  assert.equal(h.comparisons.at(-1).confirmed,true,'current confirmed stats are eligible for the comparison flag');
  assert.equal(h.collector.summary().itemCount,1);
  assert.equal(h.batches.length,1,'one completed read records evidence and item as one batch');
  assert.equal(h.batches[0].observation.presentation.rows,h.batches[0].result.rows,'raw observation keeps the selected presentation without a second persistence call');
  assert.equal(h.jobs[0].options.fieldReuse.profile,'collection:main','field evidence is scoped to the active profile');
  assert.equal(h.collector.summary().items[0].rows[0].statContext.expectedSign,1,'Recorded scanner rows include shared stat context');
  e.read.fire('click');assert.equal(h.comparisons.at(-1).confirmed,true,'retry retains the last comparison while reading');h.jobs.at(-1).resolve(parsed());await flush();
  assert.equal(h.collector.summary().itemCount,1,'manual retry keeps the current item identity');
  assert.equal(e['row-status'].textContent,'5/5 stats captured');
  assert.doesNotMatch(e.result.innerHTML,/scanner-traffic|ENABLED STATS/);
  assert.match(e.result.innerHTML,/Off <strong>95<\/strong>/,'five duplicate/locked rows count with factory rating');
  const captured=h.comparisons.at(-1).state.captureResult;
  e.read.fire('click');
  assert.equal(h.comparisons.at(-1).state.captureResult,captured,'pending read retains actual capture evidence');
  assert.equal(h.comparisons.at(-1).state.captureRetained,true);
  assert.match(e.result.innerHTML,/scanner-stat-base-score">19<\/span>/,'weighted stats stay visible throughout the retry');
  h.jobs.at(-1).resolve(parsed());await flush();
  assert.equal(h.comparisons.at(-1).state.captureRetained,false,'new completed read replaces the last-read state');
  const latestCapture=h.comparisons.at(-1).state.captureResult;
  reader.invalidate('Panel moved',{preserveDisplay:true});
  assert.equal(h.comparisons.at(-1).state.captureResult,latestCapture,'automatic movement keeps the displayed read');
  assert.match(e.result.innerHTML,/scanner-stat-base-score">19<\/span>/);
  reader.update(source,{session:1,current:true});e.read.fire('click');h.jobs.at(-1).resolve(parsed());await flush();
  DN.savePerkGroupDefaults({'single:damage':{offensive:4,defensive:2}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>380<\/strong>/);assert.match(e.result.innerHTML,/Def <strong>190<\/strong>/);
  DN.saveGlobalPerkRatings({'Heavy Tank Damage':{offensive:1}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>95<\/strong>/);
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Heavy Tank Damage':{offensive:0}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>0<\/strong>/,'explicit zero beats inherited group/global values');
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{});DN.saveGlobalPerkRatings({});DN.savePerkGroupDefaults({});
  DN.updateStrategy(DN.activeStrategyId(),{units:[]});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>0<\/strong>/,'configured empty army gates factory unit defaults');
  DN.savePerkGroupDefaults({'single:damage':{offensive:4,defensive:2}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>0<\/strong>/,'shared group settings do not re-enable troops outside this strategy');
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Heavy Tank Damage':{offensive:0}});h.window.fire('storage');
  edits(e,Array.from({length:5},()=>({name:'Unknown perk',value:10})));e.correct.fire('input');e.accept.fire('click');
  assert.match(e.result.innerHTML,/Rating unconfirmed/);assert.match(e.warnings.textContent,/known perk/);
  edits(e,Array.from({length:4},()=>({name:'Heavy Tank Damage',value:10})));e.accept.fire('click');
  assert.match(e.warnings.textContent,/row count/);
  edits(e,Array.from({length:5},()=>({name:'Heavy Tank Damage',value:''})));e.accept.fire('click');assert.match(e.result.innerHTML,/Rating unconfirmed/);
  edits(e,Array.from({length:5},()=>({name:'Heavy Tank Damage',value:-10})));e.accept.fire('click');
  assert.match(e.warnings.textContent,/expected a positive/,'manual correction cannot bypass a stat fixed sign');
  assert.match(e.result.innerHTML,/Rating unconfirmed/);
  edits(e,Array.from({length:5},()=>({name:'Invading Raider Damage',value:10})));e.accept.fire('click');
  assert.match(e.warnings.textContent,/expected a negative/,'Invading manual values must be negative');
  edits(e,Array.from({length:5},()=>({name:'Heavy Tank Damage',value:10})));e.accept.fire('click');
  assert.match(e['result-status'].textContent,/verified values/);assert.match(e.result.innerHTML,/Def <strong>190<\/strong>/,'maximum magnitudes use weighted scoring');
  assert.match(e.result.innerHTML,/scanner-stat-base-score">38<\/span>/,'weighted row score uses maximum 19 percent times perk rating 2');
  assert.equal(h.collector.summary().itemCount,1,'corrections update the existing log entry');
  assert.equal(h.collector.exportData().items[0].corrected,true);
  assert.equal(h.comparisons.at(-1).confirmed,true,'accepted corrections refresh the comparison');
  e.mode.value='maxrow';e.mode.fire('change');assert.match(e.result.innerHTML,/Def <strong>190<\/strong>/,'crafting always sums all five stats even when an old Showcase preference exists');
  // An earlier recognition cannot overwrite either a changed frame or Stop.
  e.read.fire('click');const stale=h.jobs.at(-1);source.pixel=255;reader.update(source,{session:1,current:true});
  stale.resolve(parsed('Bomber Damage',99));await flush();assert.match(e.result.innerHTML,/Rating unconfirmed/);assert.equal(e.read.disabled,false);
  e.read.fire('click');const stopped=h.jobs.at(-1);reader.reset();assert.equal(stopped.snapshot.width,0);
  reader.update(source,{session:2,current:true});e.read.fire('click');const newer=h.jobs.at(-1);
  assert.notEqual(newer,stopped,'new session starts without a stuck busy lock');
  stopped.resolve(parsed('Bomber Damage',99));await flush();assert.match(e.result.innerHTML,/Rating unconfirmed/);
  newer.resolve(parsed());await flush();assert.match(e.result.innerHTML,/Heavy Tank Damage/);assert.doesNotMatch(e.result.innerHTML,/Bomber Damage/);
  assert.equal(h.collector.summary().itemCount,2,'new encounter logs separately and stale OCR adds no items');
  reader.update(source,{session:2,current:false});assert.match(e.result.innerHTML,/Rating unconfirmed/);assert.equal(e.read.disabled,true);
  assert.equal(h.comparisons.at(-1).confirmed,false,'paused capture cannot retain a better-than flag');
  reader.update(source,{session:2,current:true});e.read.fire('click');h.jobs.at(-1).reject(new Error('OCR failed'));await flush();
  assert.match(e['result-status'].textContent,/Could not read/);assert.equal(e.read.disabled,false);
  e.read.fire('click');h.jobs.at(-1).resolve({valid:false,warnings:['ambiguous'],rows:parsed().rows});await flush();
  assert.match(e.result.innerHTML,/Heavy Tank Damage/);assert.match(e.progress.textContent,/Finished/);assert.equal(e.accept.disabled,false);
  e.read.fire('click');const interruptedEdit=h.jobs.at(-1);
  e.correct.fire('input');
  interruptedEdit.resolve(parsed('Bomber Damage',99));await flush();
  assert.match(e.result.innerHTML,/Rating unconfirmed/,'in-flight OCR must not replace pending manual corrections');
  assert.match(e['result-status'].textContent,/Corrections pending/);
  reader.reset();assert.equal(e['row-status'].textContent,'0/5 stats captured');
  const jittered=await harness(),jitterFrame=jittered.canvas();
  jittered.reader.update(jitterFrame,{session:1,current:true});jittered.e.read.fire('click');
  jittered.jobs.at(-1).resolve(parsed());await flush();
  for(const offset of [0,80,160,240]) {
    jitterFrame.jitter=60;jitterFrame.jitterOffset=offset;
    for(let sample=0;sample<3;sample++)jittered.reader.update(jitterFrame,{session:1,current:true});
    jittered.e.read.fire('click');jittered.jobs.at(-1).resolve({...parsed(),valid:false});await flush();
  }
  assert.equal(jittered.collector.summary().itemCount,1,'small live image changes and OCR retries do not multiply logged items');
  const pinned=await harness(),pinnedFrame=pinned.canvas();pinned.e.auto.checked=true;
  pinned.reader.update(pinnedFrame,{session:1,current:true});pinned.advance(220);
  pinned.jobs[0].resolve(parsed());await flush();
  const pinnedHtml=pinned.e.result.innerHTML,pinnedCorrection=pinned.e.correct.innerHTML;
  for(const offset of [0,120,240,360]) {
    pinnedFrame.jitter=100;pinnedFrame.jitterOffset=offset;
    for(let sample=0;sample<3;sample++){pinned.reader.update(pinnedFrame,{session:1,current:true});pinned.advance(100);}
  }
  assert.equal(pinned.jobs.length,1,'five confirmed known stats ignore minor persistent visual changes');
  assert.equal(pinned.comparisons.at(-1).confirmed,true,'minor differences do not unconfirm the score');
  assert.equal(pinned.e.result.innerHTML,pinnedHtml,'confirmed results do not jitter');
  assert.equal(pinned.e.correct.innerHTML,pinnedCorrection,'minor differences preserve the correction form');
  pinned.e.read.fire('click');pinned.jobs[1].resolve(parsed());await flush();
  assert.equal(pinned.collector.summary().itemCount,1,'explicit refresh still works without creating a false encounter');
  pinnedFrame.jitter=0;pinnedFrame.pixel=255;pinned.reader.update(pinnedFrame,{session:1,current:true});pinned.advance(220);
  assert.equal(pinned.jobs.length,3,'a material artifact change still starts a new read');
  pinned.jobs[2].resolve(parsed('Bomber Damage'));await flush();
  assert.equal(pinned.collector.summary().itemCount,2,'a genuinely new artifact has a distinct encounter');
  const stableCapture=await harness(),stableFrame=stableCapture.canvas();
  stableCapture.reader.update(stableFrame,{session:1,current:true});
  const fullCapture={...parsed('Heavy Tank Damage',11),hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon'},
    rows:parsed('Heavy Tank Damage',11).rows.map(row=>({...row,hasPercent:true,confidence:90}))};
  stableCapture.e.read.fire('click');stableCapture.jobs.at(-1).resolve(fullCapture);await flush();
  const weakCapture={...fullCapture,valid:false,hallSource:'selected-hall',artifact:{},unlocked:{count:null,states:[null,null,null,null,null]},
    rows:fullCapture.rows.map((row,i)=>({...row,unlocked:null,...(i===2?{name:'',known:false,value:null}:{} )}))};
  stableCapture.e.read.fire('click');stableCapture.jobs.at(-1).resolve(weakCapture);await flush();
  let stableResult=stableCapture.comparisons.at(-1).state.captureResult;
  assert.equal(stableResult.hallSource,'hall-colour','a retry retains identified hall provenance');
  assert.equal(stableResult.artifact.type,'Weapon','a retry retains identified category');
  assert.equal(stableResult.rows[2].value,11,'a retry retains the completed stat');
  assert.deepEqual(Array.from(stableResult.unlocked.states),[true,true,false,false,false],'a retry retains every identified star state');
  assert.equal(stableCapture.comparisons.at(-1).confirmed,true,'weaker retries do not unconfirm complete evidence');
  const correctedCapture={...fullCapture,rows:fullCapture.rows.map((row,i)=>i===2?{...row,name:'Bomber Damage',confidence:97}:row)};
  stableCapture.e.read.fire('click');stableCapture.jobs.at(-1).resolve(correctedCapture);await flush();
  stableResult=stableCapture.comparisons.at(-1).state.captureResult;
  assert.equal(stableResult.rows[2].name,'Bomber Damage','more confident evidence updates the completed stat');
  assert.equal(stableResult.hallSource,'hall-colour');
  assert.equal(stableResult.unlocked.states.length,5);
  // A name and its colour need not arrive in the same OCR attempt. Inference
  // must combine fresh tier evidence with the held canonical identity.
  const warHeld=await harness(),warFrame=warHeld.canvas();
  const warNameOnly={...parsed('Heavy Tank Damage',1),valid:false,warnings:['Unreadable percentage'],hall:'war',hallSource:'hall-colour',artifact:{type:'Weapon'},
    colours:['neutral','neutral',null,'neutral','neutral']};
  warNameOnly.rows=warNameOnly.rows.map((row,i)=>({...row,hasPercent:true,level:1,levelSource:'crafting',confidence:90,
    nameMatch:{method:'exact',automatic:true,confidence:1},...(i===2?{name:'Invading APC Hitpoints',value:null,hasPercent:false}:{})}));
  const warGarbage={...warNameOnly,colours:['neutral','neutral','blue','neutral','neutral'],rows:warNameOnly.rows.map((row,i)=>i===2?
    {...row,name:'lrv3d1ng hpzz',known:false,nameMatch:null,confidence:99}:row)};
  const readWar=async(value)=>{warHeld.e.read.fire('click');warHeld.jobs.at(-1).resolve(value);await flush();return warHeld.comparisons.at(-1).state.captureResult;};
  warHeld.reader.update(warFrame,{session:1,current:true});
  let warResult=await readWar(warNameOnly);assert.equal(warResult.rows[2].value,null);
  warResult=await readWar(warGarbage);
  assert.equal(warResult.rows[2].name,'Invading APC Hitpoints','garbled retry text never displaces the held canonical name');
  assert.equal(warResult.rows[2].value,-6,'fresh blue War evidence supplies signed 6% for the previously identified name');
  assert.equal(warResult.rows[2].inferred,true);assert.equal(warResult.valid,false,'inference never confirms OCR');
  assert.equal(warHeld.collector.summary().itemCount,1,'improved inference updates the same physical craft');
  const warDirect={...warNameOnly,valid:true,warnings:[],colours:warGarbage.colours,
    rows:warNameOnly.rows.map((row,i)=>i===2?{...row,value:-6,hasPercent:true,confidence:97}:row)};
  warResult=await readWar(warDirect);
  assert.equal(warResult.rows[2].value,-6);assert.equal(warResult.rows[2].inferred,undefined,'exact signed OCR replaces the inferred percentage');
  warHeld.e.infer.checked=false;warFrame.pixel=255;warHeld.reader.update(warFrame,{session:1,current:true});
  warResult=await readWar(warNameOnly);warResult=await readWar(warGarbage);
  assert.equal(warResult.rows[2].value,null,'disabled colour inference leaves missing values unknown');
  assert.equal(warHeld.collector.summary().itemCount,2,'a new physical artifact starts another record');
  warHeld.e.infer.checked=true;warFrame.pixel=0;warHeld.reader.update(warFrame,{session:1,current:true});
  warResult=await readWar(warGarbage);
  assert.equal(warResult.rows[2].name,'lrv3d1ng hpzz','a new artifact cannot inherit the preceding item\'s name');
  assert.equal(warResult.rows[2].value,null,'blue text without a known current-item name cannot invent a signed percentage');
  await readWar(warNameOnly);
  warHeld.DN.setActiveProfile(warHeld.DN.addProfile('War inference isolation'));
  warResult=await readWar(warGarbage);
  assert.equal(warResult.rows[2].name,'lrv3d1ng hpzz','changing profile clears the held canonical identity');
  assert.equal(warResult.rows[2].value,null,'another profile cannot supply the stat name needed for colour inference');
  const live=await harness(),frame=live.canvas();live.e.auto.checked=true;
  const inferredHeld=await harness(),inferredFrame=inferredHeld.canvas();inferredHeld.e.auto.checked=true;
  inferredHeld.reader.update(inferredFrame,{session:1,current:true});inferredHeld.advance(220);
  const inferredRead={...parsed(),valid:false,warnings:['Percentage inferred'],hall:'main'};
  inferredRead.rows[2]={...inferredRead.rows[2],name:'Ranged Infantry Hitpoints',value:11,inferred:true,colour:'blue',hasPercent:true};
  inferredHeld.jobs[0].resolve(inferredRead);await flush();
  const heldHtml=inferredHeld.e.result.innerHTML;
  for(const offset of [0,120,240]) {
    inferredFrame.jitter=100;inferredFrame.jitterOffset=offset;
    for(let sample=0;sample<3;sample++){inferredHeld.reader.update(inferredFrame,{session:1,current:true});inferredHeld.advance(100);}
  }
  assert.equal(inferredHeld.e.result.innerHTML,heldHtml,'small motion preserves inferred stats during automatic retries');
  const weakerInference={...inferredRead,rows:inferredRead.rows.map((row,index)=>index===2?{name:'',known:false,value:null,hasPercent:false}:row)};
  inferredHeld.jobs.at(-1).resolve(weakerInference);await flush();
  assert.equal(inferredHeld.comparisons.at(-1).state.captureResult.rows[2].name,'Ranged Infantry Hitpoints','a weaker retry after minor motion cannot erase the held name');
  assert.equal(inferredHeld.comparisons.at(-1).state.captureResult.rows[2].value,11,'held inferred percentage survives the weaker retry');
  assert.equal(inferredHeld.collector.summary().itemCount,1,'minor changes do not create a new inferred-item encounter');
  inferredFrame.jitter=0;inferredFrame.pixel=255;
  inferredHeld.reader.update(inferredFrame,{session:1,current:true});
  inferredHeld.jobs.at(-1).resolve(weakerInference);await flush();
  inferredHeld.advance(220);
  inferredHeld.jobs.at(-1).resolve(parsed('Bomber Damage'));await flush();
  assert.equal(inferredHeld.comparisons.at(-1).state.captureResult.rows[2].name,'Bomber Damage','a material item change replaces the inferred read');
  live.reader.update(frame,{session:1,current:true});live.e.read.fire('click');
  const partial={valid:false,warnings:['partial'],hall:'main',colours:['neutral','green','blue','neutral',null],rows:parsed().rows.slice(0,4)};
  live.jobs[0].resolve(partial);await flush();assert.match(live.e['row-status'].textContent,/4\/5/);assert.match(live.e.progress.textContent,/Improving/);
  assert.match(live.e.result.innerHTML,/scanner-perk is-green/);assert.match(live.e.result.innerHTML,/scanner-perk is-blue/);assert.doesNotMatch(live.e.result.innerHTML,/scanner-colour|% tier/);
  live.runTimers();assert.equal(live.jobs.length,2);assert.match(live.e['row-status'].textContent,/4\/5/,'rows stay visible while retrying');
  live.jobs[1].resolve({...partial,rows:partial.rows.slice(0,2)});await flush();
  assert.match(live.e['row-status'].textContent,/4\/5/,'weaker retry cannot replace best read');assert.match(live.e.progress.textContent,/Improving/);
  live.advance(499);assert.equal(live.jobs.length,2,'continued retries leave a bounded pause between attempts');
  live.advance(1);assert.equal(live.jobs.length,3,'partially recognized crafting retries beyond two attempts on unchanged pixels');
  live.jobs[2].resolve({valid:false,warnings:[],rows:[]});await flush();
  assert.match(live.e['row-status'].textContent,/4\/5/,'an empty retry cannot erase previously recognized stats');
  live.setVisible(false);live.runTimers();assert.equal(live.jobs.length,3,'no automatic retry starts while the page is hidden');
  live.reader.update(frame,{session:1,current:false});
  live.setVisible(true);live.reader.update(frame,{session:1,current:true});live.runTimers();
  assert.equal(live.jobs.length,4,'returning to the active page resumes scanning');
  live.jobs[3].resolve(parsed());await flush();
  live.runTimers();assert.equal(live.jobs.length,4,'confirmation stops repeated scanning');
  frame.jitter=10;live.reader.update(frame,{session:1,current:true});live.runTimers();assert.equal(live.jobs.length,4,'minor animation cannot restart a confirmed artifact');
  frame.pixel=255;live.reader.update(frame,{session:1,current:true});assert.match(live.e['row-status'].textContent,/5\/5/,'last capture stays visible on changed source');assert.match(live.e.progress.textContent,/keeping the last capture/);
  live.runTimers();assert.equal(live.jobs.length,5);live.jobs[4].resolve({valid:false,warnings:[],rows:[]});await flush();
  assert.match(live.e['row-status'].textContent,/0\/5/,'completed empty-view read clears prior capture');assert.match(live.e.progress.textContent,/Finished/);
  live.runTimers();assert.equal(live.jobs.length,5,'no recognized stats means no continuous retries');
  const moving=await harness(),animated=moving.canvas();
  moving.reader.update(animated,{session:1,current:true});moving.e.read.fire('click');
  for(const offset of [0,70,140]) {animated.jitter=30;animated.jitterOffset=offset;moving.reader.update(animated,{session:1,current:true});}
  moving.jobs[0].resolve(parsed());await flush();
  assert.match(moving.e.result.innerHTML,/Off <strong>/,'moving local overlays do not cancel in-flight crafting OCR');
  moving.e.read.fire('click');moving.jobs[1].resolve(parsed());await flush();
  assert.doesNotMatch(moving.e.result.innerHTML,/3-frame noise filtering|count toward rating/,'crafting results omit capture implementation details');
  const categoryRows=await harness({storage:true});categoryRows.e.layout.value='storage';categoryRows.e.rows.value='6';
  categoryRows.window.DNScannerRerollRecognition={detectStorage:(pixels,width,height,{expectedRows})=>Array.from({length:expectedRows},()=>({rerollEligible:expectedRows===6,rerollSource:'dice-background',rerollConfidence:'high'}))};
  categoryRows.reader.update(categoryRows.canvas(),{session:1,current:true});categoryRows.e.read.fire('click');
  const mythical={...parsed(),expectedRows:6,artifact:{type:'Mythical'},rows:[...parsed().rows,{...parsed().rows[0]}].map(row=>({...row,unlocked:true}))};
  categoryRows.jobs.at(-1).resolve(mythical);await flush();
  assert.equal(categoryRows.e.rows.value,'6');assert.equal(categoryRows.keepStates.at(-1).expectedRows,6);
  assert(categoryRows.keepStates.at(-1).result.rows.every(row=>row.rerollEligible===false && row.rerollSource==='artifact-type'),'Mythical row detection preserves the named-artifact reroll rule');
  categoryRows.e.read.fire('click');categoryRows.jobs.at(-1).resolve({...parsed(),expectedRows:5,artifact:{type:'Weapon'}});await flush();
  assert.equal(categoryRows.e.rows.value,'5','a five-row category clears the previous Mythical count');
  assert.equal(categoryRows.keepStates.at(-1).expectedRows,5);
  assert.equal(categoryRows.keepStates.at(-1).result.rows.length,5,'old six-row results cannot win the best-read merge');
  assert(categoryRows.keepStates.at(-1).result.rows.every(row=>row.rerollEligible===false),'ordinary items use five-row dice geometry');
  const six=await harness();six.e.rows.value='6';six.e.rows.fire('change');
  six.reader.update(six.canvas(),{session:1,current:true});six.e.read.fire('click');
  assert.equal(six.jobs[0].options.expectedRows,6);
  const sixResult=parsed();sixResult.rows.push({...sixResult.rows[4]});
  six.jobs[0].resolve(sixResult);await flush();
  assert.equal(six.e['row-status'].textContent,'6/6 stats captured');
  assert.match(six.e.result.innerHTML,/Off <strong>114<\/strong>/,'all six perks use the shared score');
  assert.doesNotMatch(six.e.result.innerHTML,/filled stars|count toward rating/);
  assert.equal((six.e.correct.innerHTML.match(/scanner-perk-name/g)||[]).length,6);
  edits(six.e,sixResult.rows);six.e.correct.fire('input');six.e.accept.fire('click');
  assert.match(six.e.result.innerHTML,/Off <strong>114<\/strong>/,'six corrections preserve the sixth perk');
  const stored=await harness({storage:true}),storedFrame=stored.canvas();
  const stationary=await harness({storage:true}),coloredFrame=stationary.canvas();coloredFrame.rgb=[160,120,80];
  for(let sample=0;sample<3;sample++)stationary.reader.update(coloredFrame,{session:1,current:true});
  stationary.e.read.fire('click');
  for(let sample=0;sample<4;sample++)stationary.reader.update(coloredFrame,{session:1,current:true});
  stationary.jobs[0].resolve(parsed());await flush();
  assert.equal(stationary.keepStates.at(-1).confirmed,true,'identical coloured frames cannot cancel a manual storage read after the three-frame median');
  assert.match(stationary.e.progress.textContent,/Finished/);
  assert.doesNotMatch(stationary.e['result-status'].textContent,/cancelled/);
  const shimmer=await harness({storage:true}),shimmerFrame=shimmer.canvas();shimmer.e.auto.checked=true;
  const fast=await harness(),fastFrame=fast.canvas();fast.e.auto.checked=true;
  fast.reader.update(fastFrame,{session:1,current:true});
  fast.advance(100);fastFrame.jitter=10;fast.reader.update(fastFrame,{session:1,current:true});
  fast.advance(100);fastFrame.jitterOffset=20;fast.reader.update(fastFrame,{session:1,current:true});
  fast.advance(20);
  assert.equal(fast.jobs.length,1,'crafting begins within 220 ms despite continuous small animation');
  const obsolete=fast.jobs[0];assert.equal(obsolete.options.isCurrent(),true);
  fastFrame.pixel=255;fast.reader.update(fastFrame,{session:1,current:true});
  assert.equal(obsolete.options.isCurrent(),false,'new artifact cancels obsolete recognition recovery');
  fast.advance(500);assert.equal(fast.jobs.length,1,'worker jobs never overlap');
  obsolete.reject(new Error('Recognition superseded or stopped'));await flush();fast.advance(0);
  assert.equal(fast.jobs.length,2,'a steady replacement starts as soon as obsolete OCR releases the worker');
  assert.equal(fast.engines[0].closed,0,'superseded work reuses the warm recognition engine');
  fast.jobs[1].resolve(parsed('Bomber Damage'));await flush();
  assert.equal(fast.collector.summary().itemCount,1,'only the current replacement is recorded');
  for(let frame=0;frame<12;frame++) {
    shimmerFrame.jitter=10;shimmerFrame.jitterOffset=frame*2;
    shimmer.reader.update(shimmerFrame,{session:1,current:true});shimmer.advance(100);
  }
  assert.equal(shimmer.jobs.length,1,'small continuous storage shimmer cannot starve the auto-read timer');
  shimmer.jobs[0].resolve(parsed());await flush();
  assert.equal(shimmer.keepStates.at(-1).confirmed,true,'a stable storage item completes despite minor shimmer');
  const noisyStorage=await harness({storage:true}),noisyFrame=noisyStorage.canvas();noisyStorage.e.auto.checked=true;
  for(let frame=0;frame<18;frame++) {
    noisyFrame.jitter=60;noisyFrame.jitterOffset=frame*80;
    noisyStorage.reader.update(noisyFrame,{session:1,current:true});noisyStorage.advance(100);
  }
  assert.equal(noisyStorage.jobs.length,1,'live storage shimmer starts one non-overlapping OCR read');
  assert.equal(noisyStorage.jobs[0].options.isCurrent(),true,'individual noisy frames cannot cancel storage OCR when their median is unchanged');
  noisyStorage.jobs[0].resolve(parsed());await flush();
  assert.equal(noisyStorage.keepStates.at(-1).reviewable,true,'completed storage OCR leaves the ownership-pending state after transient frame noise');
  noisyStorage.e.read.fire('click');const oldStorageJob=noisyStorage.jobs.at(-1);
  for(let sample=0;sample<3;sample++) {
    noisyFrame.jitterOffset=0;noisyStorage.reader.update(noisyFrame,{session:1,current:true});
  }
  assert.equal(oldStorageJob.options.isCurrent(),false,'a persistent change to a small watched field still cancels stale storage OCR');
  oldStorageJob.resolve(parsed());await flush();
  assert.equal(noisyStorage.keepStates.at(-1).reviewable,false,'stale storage results cannot finish an ownership check for a changed item');
  const artwork=await harness({storage:true}),artFrame=artwork.canvas();artwork.e.layout.value='storage';artwork.e.auto.checked=true;
  for(let frame=0;frame<12;frame++) {
    artFrame.artworkPixel=frame%2?255:64;artwork.reader.update(artFrame,{session:1,current:true});artwork.advance(100);
  }
  assert.equal(artwork.jobs.length,1,'animated artwork outside the storage text region cannot prevent OCR');
  artFrame.pixel=255;artwork.reader.update(artFrame,{session:1,current:true});
  artwork.jobs[0].resolve(parsed());await flush();
  assert.equal(artwork.keepStates.at(-1).reviewable,false,'a genuine text change still rejects in-flight storage results');
  assert.match(artwork.e['result-status'].textContent,/Read cancelled because the watched fields changed/,'cancelled storage reads explain why no result appears');
  const setupFailure=await harness({storage:true});setupFailure.e.layout.value='storage';
  setupFailure.reader.update(setupFailure.canvas(),{session:1,current:true});
  setupFailure.window.DNStorageRecognition.inspect=()=>{throw new Error('fixture: unreadable source pixels');};
  await setupFailure.e.read.fire('click');await flush();
  assert.match(setupFailure.e['result-status'].textContent,/Could not start reading: fixture: unreadable source pixels/,'pre-OCR errors are visible instead of leaving Waiting for a steady image');
  assert.equal(setupFailure.e.read.disabled,false,'a failed setup leaves manual retry available');
  stored.reader.update(storedFrame,{session:1,current:true});stored.e.read.fire('click');
  assert.equal(stored.keepStates.at(-1).reviewable,false,'in-flight reads cannot save the prior item');
  stored.jobs[0].resolve({...parsed(),valid:false,warnings:['OCR evidence is weak']});await flush();
  assert.equal(stored.keepStates.at(-1).reviewable,true,'current complete weak reads can be explicitly reviewed with Keep');
  const defaultLevels=[...stored.e.correct.innerHTML.matchAll(/class="scanner-perk-level"[^>]*value="([^"]*)"/g)].map(match=>match[1]);
  assert.deepEqual(defaultLevels,['','','1','1','1'],'hollow stars establish level 1; yellow stars alone do not establish a level');
  const starLevel={value:''};
  const starEvent={target:{matches:selector=>selector==='.scanner-perk-unlocked',value:'true',closest:()=>({querySelector:()=>starLevel})}};
  stored.e.correct.fire('input',starEvent);
  assert.equal(starLevel.value,'','manually unlocking a row does not invent a level');
  starLevel.value='4';stored.e.correct.fire('input',starEvent);
  assert.equal(starLevel.value,'4','unlocking preserves an existing upgrade level');
  assert.equal(stored.keepStates.at(-1).confirmed,false,'weak reads retain the unconfirmed rating');
  stored.e.correct.fire('input');assert.equal(stored.keepStates.at(-1).pending,true);
  assert.equal(stored.keepStates.at(-1).reviewable,false,'pending changes must be applied');
  edits(stored.e,parsed().rows);stored.e.accept.fire('click');assert.equal(stored.keepStates.at(-1).reviewable,true);
  edits(stored.e,parsed().rows.map(row=>({...row,level:3,unlocked:true,base:1,max:19})));
  stored.e.correct.fire('input');stored.e.accept.fire('click');
  assert.equal(stored.keepStates.at(-1).result.rows[0].base,1,'verified base retained separately from current value');
  assert.equal(stored.keepStates.at(-1).result.rows[0].max,19,'verified max retained');
  edits(stored.e,parsed().rows.map(row=>({...row,base:11,max:19})));
  stored.e.correct.fire('input');stored.e.accept.fire('click');
  assert.match(stored.e.warnings.textContent,/current value must be within/,'out-of-range current values block correction');
  edits(stored.e,[{name:'Invading Fighter Damage',value:-6},{name:'Invading Heavy Infantry Hitpoints',value:-6},{name:'Invading Mortar Troop Hitpoints',value:-11},{name:'Invading APC Damage',value:-1},{name:'Invading Raider Hitpoints',value:-1}]);
  stored.e.correct.fire('input');stored.e.accept.fire('click');
  assert.equal(stored.e.warnings.textContent,'','new Downloads attributes are accepted in manual corrections');
  assert.equal(stored.keepStates.at(-1).reviewable,true);
  edits(stored.e,[{name:'Invading Fighter Damage',value:-6},{name:'Invading Heavy Infantry Hitpoints',value:-6},{name:'Invading Bomber Damage',value:-11},{name:'Defender Hitpoints',value:6},{name:'Invading Guerrilla Hitpoints',value:-1}]);
  stored.e.correct.fire('input');stored.e.accept.fire('click');
  assert.equal(stored.e.warnings.textContent,'','Invading Guerrilla Hitpoints is accepted in manual corrections');
  assert.equal(stored.keepStates.at(-1).reviewable,true);
  edits(stored.e,[{name:'Invading Fighter Damage',value:-6},{name:'Invading Heavy Infantry Hitpoints',value:-6},{name:'Invading Bomber Damage',value:-11},{name:'Defender Hitpoints',value:6},{name:'Uncatalogued Unit Hitpoints',value:-1}]);
  stored.e.correct.fire('input');stored.e.accept.fire('click');
  assert.match(stored.e.warnings.textContent,/Row 5: "Uncatalogued Unit Hitpoints" is not a known perk/,'the supplied corrections identify the actual rejected row');
  assert.match(stored.keepStates.at(-1).correctionError,/Row 5/,'the save gate reports the same precise correction error');
  stored.reader.update(storedFrame,{session:1,current:false});assert.equal(stored.keepStates.at(-1).reviewable,false,'paused capture cannot save stale values');
  stored.reader.update(storedFrame,{session:1,current:true});stored.e.read.fire('click');stored.jobs[1].reject(new Error('OCR failed'));await flush();
  assert.equal(stored.keepStates.at(-1).reviewable,false,'failed reads cannot save the last displayed item');
  const typed=await harness(),typedFrame=typed.canvas();
  typed.reader.update(typedFrame,{session:1,current:true});typed.e.read.fire('click');
  typed.jobs[0].resolve({...parsed('Heavy Tank Damage',5),hall:'war',hallSource:'percentage-tier'});await flush();
  assert.equal(typed.e.hall.value,'war','hall detection applies even when the item category is unread');
  assert.equal(typed.collector.exportData().items[0].hall,'war');
  assert.equal(typed.collector.exportData().items[0].hallSource,'percentage-tier');
  assert.equal(typed.collector.exportData().labels[0].hall,'war');
  const ranged=await harness({storage:true}),rangedFrame=ranged.canvas();
  ranged.reader.update(rangedFrame,{session:1,current:true});ranged.e.read.fire('click');
  ranged.jobs[0].resolve(parsed());await flush();
  edits(ranged.e,parsed().rows.map(row=>({...row,value:row.unlocked?13:11,level:row.unlocked?3:1})));
  ranged.e.accept.fire('click');
  assert.equal(ranged.keepStates.at(-1).result.rows[0].level,3,'storage upgrades retain their verified level regardless of star state');
  assert.equal(ranged.keepStates.at(-1).result.rows[0].base,11);
  assert.equal(ranged.keepStates.at(-1).result.rows[0].max,20);
  assert.equal(ranged.keepStates.at(-1).result.rows[2].level,1,'locked perks are level 1');
  assert.equal(ranged.keepStates.at(-1).result.rows[2].base,11);
  assert.equal(ranged.keepStates.at(-1).result.rows[2].max,20);
  const warStorage=await harness({storage:true});
  warStorage.reader.update(warStorage.canvas(),{session:1,current:true});warStorage.e.read.fire('click');
  const staleWar={...parsed('Heavy Tank Damage',6),artifact:{type:'War Weapon'},
    rows:parsed('Heavy Tank Damage',6).rows.map(row=>({...row,unlocked:true,level:2,levelSource:'ocr',base:5,max:14,rangeSource:'manual'}))};
  warStorage.jobs[0].resolve(staleWar);await flush();
  edits(warStorage.e,staleWar.rows.map(row=>({...row,level:4})));
  warStorage.e.accept.fire('click');
  assert.equal(warStorage.e.warnings.textContent,'','6% at War level 4 accepts corrected level with unchanged old endpoints');
  for(const row of warStorage.keepStates.at(-1).result.rows) {
    assert.equal(row.level,4);assert.equal(row.base,3);assert.equal(row.max,12);
    assert.equal(row.tier,'green');assert.equal(row.tierConflict,false);
  }
  edits(warStorage.e,staleWar.rows.map(row=>({...row,level:4})));
  warStorage.e.accept.fire('click');
  assert.match(warStorage.e.warnings.textContent,/conflict/,'newly entered contradictory endpoints still require correction');
  const inferredStorage=await harness({storage:true});
  inferredStorage.reader.update(inferredStorage.canvas(),{session:1,current:true});inferredStorage.e.read.fire('click');
  inferredStorage.jobs[0].resolve({...parsed(),artifact:{type:'War Weapon'}});await flush();
  edits(inferredStorage.e,parsed().rows.map(row=>({...row,unlocked:true,tier:'blue',level:3,value:null})));
  inferredStorage.e.accept.fire('click');
  assert.equal(inferredStorage.e.warnings.textContent,'','tier + level fills missing percentage through Correct Recognition');
  for(const row of inferredStorage.keepStates.at(-1).result.rows)assert.equal(row.value,8);
  assert.match(inferredStorage.e.correct.innerHTML,/Inferred value/,'inferred percentage is identified in the review UI');
  edits(inferredStorage.e,parsed().rows.map(row=>({...row,unlocked:true,tier:'green',value:7,level:null})));
  inferredStorage.e.accept.fire('click');
  assert.equal(inferredStorage.e.warnings.textContent,'','tier + percentage fills missing level');
  for(const row of inferredStorage.keepStates.at(-1).result.rows)assert.equal(row.level,5);
  edits(inferredStorage.e,parsed().rows.map(row=>({...row,unlocked:true,value:12,level:7})));
  inferredStorage.e.accept.fire('click');
  assert.equal(inferredStorage.e.warnings.textContent,'','percentage + level fills tier');
  for(const row of inferredStorage.keepStates.at(-1).result.rows)assert.equal(row.tier,'blue');
  edits(inferredStorage.e,parsed().rows.map(row=>({...row,unlocked:true,tier:'green',value:12,level:7})));
  inferredStorage.e.accept.fire('click');
  assert.match(inferredStorage.e.warnings.textContent,/conflict/,'manual tier cannot contradict accurate numeric fields');
  inferredStorage.e.read.fire('click');
  assert.equal(inferredStorage.jobs.at(-1).options.knownTiers[0].tier,'blue','same artifact retry carries its established tier');
  inferredStorage.jobs.at(-1).resolve({...parsed(),artifact:{type:'War Weapon',hall:'main'}});await flush();
  const newArtifact=inferredStorage.canvas();newArtifact.pixel=255;
  inferredStorage.reader.update(newArtifact,{session:1,current:true});inferredStorage.e.read.fire('click');
  assert.equal(inferredStorage.jobs.at(-1).options.knownTiers.length,0,'a new artifact never inherits the previous tier');
  inferredStorage.jobs.at(-1).resolve(parsed());await flush();
  const calibrated=await harness(),calibratedFrame=calibrated.canvas();
  const fields={template:{version:1},panel:{x:.1,y:.2,width:.5,height:.5},source:calibratedFrame};
  calibrated.reader.update(calibratedFrame,{session:1,current:true,fields});calibrated.e.read.fire('click');
  assert.equal(calibrated.jobs[0].options.fields.template,fields.template);
  assert.equal(calibrated.jobs[0].options.fields.panelSource,calibrated.jobs[0].snapshot,'field OCR keeps temporal filtering');
  calibrated.reader.update(calibratedFrame,{session:1,current:true,fields:{...fields,panel:{...fields.panel,x:.2}}});
  calibrated.jobs[0].resolve(parsed());await flush();
  assert.doesNotMatch(calibrated.e.result.innerHTML,/95/,'moved calibration cancels results even if stat pixels are unchanged');
  calibrated.e.read.fire('click');const oldProfile=calibrated.jobs.at(-1);
  calibrated.reader.update(calibratedFrame,{session:1,current:true,fields:{...fields,panel:{...fields.panel,x:.2},foregroundRows:true}});
  oldProfile.resolve(parsed());await flush();
  assert.doesNotMatch(calibrated.e.result.innerHTML,/95/,'a preprocessing profile change cancels in-flight results without moving the boxes');
  calibrated.e.read.fire('click');const changed=calibrated.jobs.at(-1);
  calibrated.reader.update(calibratedFrame,{session:1,current:false,fields:null});changed.resolve(parsed());await flush();
  assert.doesNotMatch(calibrated.e.result.innerHTML,/95/,'lost panel anchor cancels field reads');
  const focus=await harness(),focusedFrame=focus.canvas();
  const updateFocus=(frame,present,current=true)=>focus.reader.update(frame,{session:1,current,itemPresent:present});
  updateFocus(focusedFrame,true);focus.e.read.fire('click');
  const focusedResult={...parsed(),artifact:{type:'Weapon',image:'data:image/jpeg;base64,test'}};
  focus.jobs.at(-1).resolve(focusedResult);await flush();
  const focusCapture=focus.comparisons.at(-1).state.captureResult;
  const shiftedFrame=focus.canvas();shiftedFrame.jitter=100;
  for(let i=0;i<7;i++){focus.advance(400);updateFocus(shiftedFrame,false);}
  assert.equal(focus.comparisons.at(-1).state.captureResult,focusCapture,'small changes and border misses never clear the last capture');
  const emptyFrame=focus.canvas();emptyFrame.pixel=255;
  for(let i=0;i<4;i++){focus.advance(400);updateFocus(emptyFrame,false);}
  assert.equal(focus.comparisons.at(-1).state.captureResult,focusCapture,'a brief scene transition preserves the capture');
  updateFocus(focusedFrame,true);
  for(let i=0;i<2;i++){focus.advance(400);updateFocus(emptyFrame,false);}
  focus.advance(3000);updateFocus(emptyFrame,undefined,false);
  assert.equal(focus.comparisons.at(-1).state.captureResult,focusCapture,'paused capture is not evidence of an empty view');
  for(let i=0;i<6;i++){focus.advance(400);updateFocus(emptyFrame,false);}
  assert.equal(focus.comparisons.at(-1).state.captureResult,null,'sustained panel absence with a changed scene clears the stats');
  assert.equal(focus.comparisons.at(-1).result,null,'clearing removes the artifact and its image');
  assert.equal(focus.e.read.disabled,true,'empty scenes cannot start OCR');
  updateFocus(emptyFrame,false);assert.equal(focus.e.read.disabled,true);
  updateFocus(focusedFrame,true);assert.ok(!focus.e.read.disabled,'the scanner resumes when a panel returns');
  focus.e.read.fire('click');
  for(let i=0;i<6;i++){focus.advance(400);updateFocus(emptyFrame,false);}
  focus.jobs.at(-1).resolve(parsed());await flush();
  assert.equal(focus.comparisons.at(-1).result,null,'OCR started before confirmed absence cannot restore stale stats');
  console.log('Scanner reading duplicates, five/six rows, validation, inheritance, stale work, field geometry, reconnect, detected hall logging, and sustained empty-scene detection tests passed.');
}
module.exports={harness,parsed,flush};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
