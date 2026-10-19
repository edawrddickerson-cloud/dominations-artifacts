const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const store = new Map(), elements = {}, events = new Map();
for (const id of ['preset-strip','preset-name','preset-add','preset-remove','army-save','army-discard','unit-grid','error','army-hint','strategy-status','loadout-create-dialog','loadout-create-form','loadout-create-name','loadout-create-baseline','loadout-create-error','loadout-create-description']) {
  elements[id] = {value:'', checked:false, disabled:false, hidden:false, innerHTML:'', textContent:'', listeners:{}, focus(){},select(){},showModal(){},close(){this.listeners.close?.();}, classList:{toggle(){}}, addEventListener(type,handler){this.listeners[type]=handler;}};
}
const context = {
  window: {addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},dispatchEvent(ev){for(const listener of events.get(ev.type)||[])listener(ev);},Event},
  document: {getElementById:id=>elements[id],addEventListener(){}},
  localStorage: {getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
  fetch:async url=>({ok:true,json:async()=>url.includes('defaults')?JSON.parse(read('ui/data/perk_rating_defaults.json')):{},text:async()=>read('ui/data/perk_name_mapping.csv')}), confirm:()=>true,
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
  elements['army-save'].listeners.click();
  assert(DN.activeStrategy().units.includes('APC'),'save persists strategy troops');
  assert.equal(DN.activeStrategy().legacy,undefined,'editing troops explicitly leaves migrated snapshot');
  assert.equal(JSON.stringify(DN.loadStoredGlobalPerkRatings()),globalBefore,'saving army cannot zero shared global ratings');
  assert.equal(JSON.stringify(DN.loadProfilePerkOverrides(DN.activeProfileId())),profileBefore,'saving army cannot zero shared profile ratings');
  DN.saveStrategyOverrides(first,{'APC Damage':{offensive:3}});
  async function create(){await elements['preset-add'].listeners.click(); elements['loadout-create-form'].listeners.submit({submitter:{value:'create'},preventDefault(){}});}
  await create();
  assert.notEqual(DN.activeStrategyId(),first);
  assert.equal(Object.keys(DN.activeStrategy().overrides).length,0,'new loadout starts with independent ratings');
  assert.equal(DN.activeStrategy().units.length,0,'new loadout starts with no troops');
  assert.equal(DN.loadStrategies().strategies.find(s=>s.id===first).overrides['APC Damage'].offensive,3,'creating a loadout preserves existing overrides');
  for(let i=0;i<10;i++)await create();
  assert(DN.loadStrategies().strategies.length>=12,'management supports at least ten strategies');
  assert.equal(JSON.stringify(DN.loadStoredGlobalPerkRatings()),globalBefore,'create and switch keep globals unchanged');
  assert.equal(JSON.stringify(DN.loadProfilePerkOverrides(DN.activeProfileId())),profileBefore,'management keeps profile ratings unchanged');
  console.log('Army loadout drafts, save, migration, creation, capacity, and shared-rating isolation passed.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
