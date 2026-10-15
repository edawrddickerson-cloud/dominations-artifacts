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
async function harness({storage=false}={}) {
  const store=new Map(),elements={},jobs=[],engines=[],timers=new Map();let nextTimer=0,now=1000;
  for(const id of ['read','auto','layout','rows','hall','infer','progress','result-status','warnings','result','correct','accept','names','mode','off','def','profile-label'])elements[id]=element();
  elements.hall.value='main';
  elements.auto.checked=false;elements.rows.value='5';elements.layout.value='gold';
  const window=element(),keepStates=[];
  if(storage){window.DNStorageRecognition={inspect:()=>({expectedRows:5,hall:'main'})};window.DNStorageScanner={update:(result,confirmed,state)=>keepStates.push({result,confirmed,...state})};}
  const canvas=()=>({width:1920,height:1080,pixel:0,getContext(){let source,coords;return {drawImage(value,...rect){source=value;coords=rect;},putImageData(){},getImageData(){const data=new Uint8ClampedArray(96*64*4).fill(source?.pixel||0);if(source?.rgb)for(let i=0;i<data.length;i+=4)data.set([...source.rgb,255],i);if(source?.jitter)data.fill(255,(source.jitterOffset || 0)*4,((source.jitterOffset || 0)+source.jitter)*4);if(source?.artworkPixel && coords?.[0]===0)data.fill(source.artworkPixel,0,data.length/4);return {data};}};}});
  const context={window,localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    document:{getElementById:id=>elements[id.replace('scanner-','')],createElement:canvas},performance:{now:()=>now},
    setTimeout(fn,delay=0){const id=++nextTimer;timers.set(id,{fn,due:now+delay});return id;},clearTimeout(id){timers.delete(id);},
    fetch:async url=>({ok:true,text:async()=>read('data/perk_name_mapping.csv'),json:async()=>JSON.parse(read('data/perk_rating_defaults.json'))})};
  vm.createContext(context);
  for(const file of ['data/army_catalog.js','shared.js','artifact-scoring.js','stored-artifacts.js','scanner-frames.js','scanner-name-catalog.js','scanner-recognition.js'])vm.runInContext(read(file),context);
  vm.runInContext(read('scanner-collection.js'),context);
  const collector=window.DNScannerCollectionCore.createCollector();
  window.DNScannerCollection={isEnabled:()=>false,record:result=>collector.record(result),recordItem:(result,id,options)=>collector.recordItem(result,id,options)};
  const comparisons=[];
  window.DNScannerComparison={update:(result,confirmed,options,state)=>comparisons.push({result,confirmed,options,state})};
  window.DNScannerRecognition.create=function(){const engine={closed:0,async close(){this.closed++;},recognize(snapshot,options){const job=deferred();jobs.push({...job,snapshot,options,engine});return job.promise;}};engines.push(engine);return engine;};
  vm.runInContext(read('scanner-reading.js'),context);await flush();
  return {comparisons,collector,window,e:elements,jobs,engines,canvas,keepStates,DN:window.DN,reader:window.DNScannerReading,runTimers(){const pending=[...timers.values()];timers.clear();pending.forEach(timer=>timer.fn());},advance(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.due<=now){timers.delete(id);timer.fn();}}};
}
function parsed(name='Heavy Tank Damage',value=10){return {valid:true,warnings:[],unlocked:{count:2},rows:Array.from({length:5},(_,i)=>({name,value,known:true,unlocked:i<2}))};}
function edits(e,rows){e.correct.editRows=rows.map(({name,value,base,max,level,unlocked,tier})=>({querySelector(selector){return {value:selector.includes('name')?name:selector.endsWith('-base')?String(base??''):selector.endsWith('-max')?String(max??''):selector.endsWith('-level')?String(level??''):selector.endsWith('-tier')?String(tier??''):selector.endsWith('-unlocked')?String(unlocked??''):String(value??'')};}}));}
async function main(){
  const h=await harness(),{e,reader,DN}=h;
  const source=h.canvas();reader.update(source,{session:1,current:true});
  e.read.fire('click');assert.equal(h.jobs.length,1);assert.equal(h.jobs[0].options.expectedRows,5);
  h.jobs[0].resolve(parsed());await flush();
  assert.equal(h.comparisons.at(-1).confirmed,true,'current confirmed stats are eligible for the comparison flag');
  assert.equal(h.collector.summary().itemCount,1);
  e.read.fire('click');assert.equal(h.comparisons.at(-1).confirmed,true,'retry retains the last comparison while reading');h.jobs.at(-1).resolve(parsed());await flush();
  assert.equal(h.collector.summary().itemCount,1,'manual retry keeps the current item identity');
  assert.match(e.result.innerHTML,/is-green/);assert.match(e.result.innerHTML,/5\/5/);
  assert.match(e.result.innerHTML,/<strong>2<\/strong><span>ENABLED STATS/);
  assert.match(e.result.innerHTML,/Off <strong>95<\/strong>/,'five duplicate/locked rows count with factory rating');
  const captured=h.comparisons.at(-1).state.captureResult;
  e.read.fire('click');
  assert.equal(h.comparisons.at(-1).state.captureResult,captured,'pending read retains actual capture evidence');
  assert.equal(h.comparisons.at(-1).state.captureRetained,true);
  assert.match(e.result.innerHTML,/scanner-stat-score">19<\/span>/,'weighted stats stay visible throughout the retry');
  h.jobs.at(-1).resolve(parsed());await flush();
  assert.equal(h.comparisons.at(-1).state.captureRetained,false,'new completed read replaces the last-read state');
  const latestCapture=h.comparisons.at(-1).state.captureResult;
  reader.invalidate('Panel moved',{preserveDisplay:true});
  assert.equal(h.comparisons.at(-1).state.captureResult,latestCapture,'automatic movement keeps the displayed read');
  assert.match(e.result.innerHTML,/scanner-stat-score">19<\/span>/);
  reader.update(source,{session:1,current:true});e.read.fire('click');h.jobs.at(-1).resolve(parsed());await flush();
  DN.savePerkGroupDefaults({'single:damage':{offensive:4,defensive:2}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>380<\/strong>/);assert.match(e.result.innerHTML,/Def <strong>190<\/strong>/);
  DN.saveGlobalPerkRatings({'Heavy Tank Damage':{offensive:1}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>95<\/strong>/);
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Heavy Tank Damage':{offensive:0}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>0<\/strong>/,'explicit zero beats inherited group/global values');
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{});DN.saveGlobalPerkRatings({});DN.savePerkGroupDefaults({});
  DN.saveArmyPresets({presets:[{id:'test',name:'Test',units:[]}],activeId:'test',lastApplied:[]});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>0<\/strong>/,'configured empty army gates factory unit defaults');
  DN.savePerkGroupDefaults({'single:damage':{offensive:4,defensive:2}});h.window.fire('storage');
  assert.match(e.result.innerHTML,/Off <strong>380<\/strong>/,'explicit group settings bypass factory army gate');
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
  assert.match(e.result.innerHTML,/scanner-stat-score">38<\/span>/,'weighted row score uses maximum 19 percent times perk rating 2');
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
  reader.reset();assert.match(e.result.innerHTML,/is-red/);assert.match(e.result.innerHTML,/0\/5/);
  const jittered=await harness(),jitterFrame=jittered.canvas();
  jittered.reader.update(jitterFrame,{session:1,current:true});jittered.e.read.fire('click');
  jittered.jobs.at(-1).resolve(parsed());await flush();
  for(const offset of [0,80,160,240]) {
    jitterFrame.jitter=60;jitterFrame.jitterOffset=offset;
    for(let sample=0;sample<3;sample++)jittered.reader.update(jitterFrame,{session:1,current:true});
    jittered.e.read.fire('click');jittered.jobs.at(-1).resolve({...parsed(),valid:false});await flush();
  }
  assert.equal(jittered.collector.summary().itemCount,1,'small live image changes and OCR retries do not multiply logged items');
  const live=await harness(),frame=live.canvas();live.e.auto.checked=true;
  live.reader.update(frame,{session:1,current:true});live.e.read.fire('click');
  const partial={valid:false,warnings:['partial'],hall:'main',colours:['neutral','green','blue','neutral',null],rows:parsed().rows.slice(0,4)};
  live.jobs[0].resolve(partial);await flush();assert.match(live.e.result.innerHTML,/4\/5/);assert.match(live.e.progress.textContent,/Improving/);
  assert.match(live.e.result.innerHTML,/scanner-perk is-green/);assert.match(live.e.result.innerHTML,/scanner-perk is-blue/);assert.doesNotMatch(live.e.result.innerHTML,/scanner-colour|% tier/);
  live.runTimers();assert.equal(live.jobs.length,2);assert.match(live.e.result.innerHTML,/4\/5/,'rows stay visible while retrying');
  live.jobs[1].resolve({...partial,rows:partial.rows.slice(0,2)});await flush();
  assert.match(live.e.result.innerHTML,/4\/5/,'weaker retry cannot replace best read');assert.match(live.e.progress.textContent,/Finished/);
  frame.jitter=10;live.reader.update(frame,{session:1,current:true});live.runTimers();assert.equal(live.jobs.length,2,'minor animation cannot restart a finished artifact');
  frame.pixel=255;live.reader.update(frame,{session:1,current:true});assert.match(live.e.result.innerHTML,/4\/5/,'last capture stays visible on changed source');assert.match(live.e.progress.textContent,/keeping the last capture/);
  live.runTimers();assert.equal(live.jobs.length,3);live.jobs[2].resolve({valid:false,warnings:[],rows:[]});await flush();
  assert.match(live.e.result.innerHTML,/0\/5/,'completed empty-view read clears prior capture');assert.match(live.e.progress.textContent,/Finished/);
  const moving=await harness(),animated=moving.canvas();
  moving.reader.update(animated,{session:1,current:true});moving.e.read.fire('click');
  for(const offset of [0,70,140]) {animated.jitter=30;animated.jitterOffset=offset;moving.reader.update(animated,{session:1,current:true});}
  moving.jobs[0].resolve(parsed());await flush();
  assert.match(moving.e.result.innerHTML,/Off <strong>/,'moving local overlays do not cancel in-flight crafting OCR');
  moving.e.read.fire('click');moving.jobs[1].resolve(parsed());await flush();
  assert.match(moving.e.result.innerHTML,/3-frame noise filtering/,'live reads report when three captured frames were used');
  const six=await harness();six.e.rows.value='6';six.e.rows.fire('change');
  six.reader.update(six.canvas(),{session:1,current:true});six.e.read.fire('click');
  assert.equal(six.jobs[0].options.expectedRows,6);
  const sixResult=parsed();sixResult.rows.push({...sixResult.rows[4]});
  six.jobs[0].resolve(sixResult);await flush();
  assert.match(six.e.result.innerHTML,/6\/6/);
  assert.match(six.e.result.innerHTML,/Off <strong>114<\/strong>/,'all six perks use the shared score');
  assert.match(six.e.result.innerHTML,/2 of 6 unlocked/);
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
  for(let frame=0;frame<12;frame++) {
    shimmerFrame.jitter=10;shimmerFrame.jitterOffset=frame*2;
    shimmer.reader.update(shimmerFrame,{session:1,current:true});shimmer.advance(100);
  }
  assert.equal(shimmer.jobs.length,1,'small continuous storage shimmer cannot starve the auto-read timer');
  shimmer.jobs[0].resolve(parsed());await flush();
  assert.equal(shimmer.keepStates.at(-1).confirmed,true,'a stable storage item completes despite minor shimmer');
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
  calibrated.e.read.fire('click');const changed=calibrated.jobs.at(-1);
  calibrated.reader.update(calibratedFrame,{session:1,current:false,fields:null});changed.resolve(parsed());await flush();
  assert.doesNotMatch(calibrated.e.result.innerHTML,/95/,'lost panel anchor cancels field reads');
  console.log('Scanner reading duplicates, five/six rows, validation, inheritance, stale work, field geometry, reconnect, and detected hall logging tests passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
