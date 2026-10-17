const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const store = new Map(), elements = {}, events = new Map();
for (const id of ['preset-strip','preset-name','preset-add','preset-remove','army-save','army-discard','unit-grid','error','army-hint','strategy-status','strategy-legacy','strategy-archived','strategy-archive','strategy-favorite','strategy-duplicate','strategy-earlier','strategy-later','strategy-adopt-defaults']) {
  elements[id] = {value:'', checked:false, disabled:false, hidden:false, innerHTML:'', textContent:'', listeners:{}, classList:{toggle(){}}, addEventListener(type,handler){this.listeners[type]=handler;}};
}
const context = {
  window: {addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},dispatchEvent(ev){for(const listener of events.get(ev.type)||[])listener(ev);},Event},
  document: {getElementById:id=>elements[id],addEventListener(){}},
  localStorage: {getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
  fetch:async()=>({ok:true,json:async()=>({})}), confirm:()=>true,
};
vm.createContext(context);
for(const file of ['ui/data/army_catalog.js','ui/shared.js'])vm.runInContext(read(file),context);
const DN=context.window.DN;
DN.savePerkGroupDefaults({'single:damage':{offensive:5}});
DN.saveGlobalPerkRatings({'Heavy Tank Damage':{offensive:4,defensive:3}});
DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Heavy Tank Damage':{offensive:5,defensive:2}});
async function test(){
  vm.runInContext(read('ui/army.js'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(elements.error.textContent,'');
  const globalBefore=JSON.stringify(DN.loadStoredGlobalPerkRatings()), profileBefore=JSON.stringify(DN.loadProfilePerkOverrides(DN.activeProfileId()));
  const first=DN.activeStrategyId();
  const checkbox={dataset:{unit:'APC'},checked:true,matches:()=>true};
  elements['unit-grid'].listeners.change({target:checkbox});
  assert(!DN.activeStrategy().units.includes('APC'),'editing troops remains an unsaved draft');
  assert.equal(elements['army-save'].disabled,false);
  context.confirm=()=>false;
  assert.equal(context.window.DNStrategyEditor.canLeave(),false,'unsaved draft blocks navigation when discard declined');
  context.confirm=()=>true;
  elements['army-save'].listeners.click();
  assert(DN.activeStrategy().units.includes('APC'),'save persists strategy troops');
  assert.equal(DN.activeStrategy().legacy,undefined,'editing troops explicitly leaves migrated snapshot');
  assert.equal(JSON.stringify(DN.loadStoredGlobalPerkRatings()),globalBefore,'saving army cannot zero shared global ratings');
  assert.equal(JSON.stringify(DN.loadProfilePerkOverrides(DN.activeProfileId())),profileBefore,'saving army cannot zero shared profile ratings');
  DN.saveStrategyOverrides(first,{'APC Damage':{offensive:3}});
  elements['strategy-duplicate'].listeners.click();
  assert.notEqual(DN.activeStrategyId(),first);
  assert.equal(DN.activeStrategy().overrides['APC Damage'].offensive,3,'duplicate keeps isolated ratings');
  assert(DN.activeStrategy().units.includes('APC'),'duplicate keeps troops');
  const copy=DN.activeStrategyId();
  elements['strategy-archive'].listeners.click();
  assert.notEqual(DN.activeStrategyId(),copy,'archive changes active strategy');
  assert(DN.loadStrategies().strategies.find(s=>s.id===copy).archived);
  for(let i=0;i<10;i++)elements['preset-add'].listeners.click();
  assert(DN.loadStrategies().strategies.length>=12,'management supports at least ten strategies');
  assert.equal(JSON.stringify(DN.loadStoredGlobalPerkRatings()),globalBefore,'create, duplicate, archive and switch keep globals unchanged');
  assert.equal(JSON.stringify(DN.loadProfilePerkOverrides(DN.activeProfileId())),profileBefore,'management keeps profile ratings unchanged');
  console.log('Strategy army drafts, save, discard guard, migration, duplication, archive, capacity, and shared-rating isolation passed.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
