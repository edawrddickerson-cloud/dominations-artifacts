const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const defaults = JSON.parse(read('ui/data/perk_rating_defaults.json'));
const ratings = overrides => JSON.stringify({v:2, overrides});
const scoped = (key, id='main') => `dn-p:${id}:${key}`;
const plain = value => JSON.parse(JSON.stringify(value));

function boot(seed = {}, {oldLayers = false} = {}) {
  const store = new Map(Object.entries(seed));
  if (!oldLayers) store.set('dn-perk-ratings-layer-migrated', '1');
  store.set('dn-general-ratings-2026-10-16', '1');
  const events = [];
  const controls = {failKey:null, onEvent:null};
  const context = {window:{
    CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
    dispatchEvent(event) { events.push(event); controls.onEvent?.(event); },
  }, document:{getElementById:()=>null}, localStorage:{
    getItem: key => store.get(key) ?? null,
    setItem(key, value) {
      if (key === controls.failKey) throw new Error('Storage write failed');
      store.set(key, String(value));
    },
    removeItem: key => store.delete(key),
  }};
  vm.createContext(context);
  for (const file of ['ui/data/army_catalog.js', 'ui/shared.js']) vm.runInContext(read(file), context);
  return {DN:context.window.DN, store, events, controls};
}

{
  const {DN, controls, events} = boot();
  const first = DN.activeStrategy();
  assert.equal(first.configured, false, 'an untouched army retains broad default scores');
  assert.equal(DN.createStrategyRatingContext(defaults).ratingOf('Heavy Tank Damage','offensive'), defaults['Heavy Tank Damage'].offensive);
  const apc = DN.addStrategy('APC attack', {units:['APC']});
  const fighter = DN.addStrategy('Fighter attack', {units:['Fighter']});
  const get = id => DN.createStrategyRatingContext(defaults, {strategyId:id});
  assert.equal(get(apc).ratingOf('Heavy Infantry Damage', 'offensive'), defaults['Heavy Infantry Damage'].offensive, 'APC includes Heavy Infantry');
  assert.equal(get(apc).ratingOf('Barracks Troop Damage', 'offensive'), defaults['Barracks Troop Damage'].offensive, 'included unit activates its unit group');
  assert.equal(get(fighter).ratingOf('Barracks Troop Damage', 'offensive'), 0, 'unselected unit group is irrelevant');
  assert.equal(get(apc).ratingOf('Heavy Tank Damage','offensive'), 0);
  assert.equal(get(apc).ratingOf('Heavy Tank Damage','defensive'), defaults['Heavy Tank Damage'].defensive, 'defense is independent of attacking army');
  DN.saveGlobalPerkRatings({'Heavy Tank Damage':{offensive:5,defensive:4}, 'APC Damage':{offensive:2}});
  DN.saveProfilePerkOverrides(DN.activeProfileId(), {'APC Damage':{offensive:0}});
  assert.equal(get(apc).ratingOf('Heavy Tank Damage','offensive'), 0, 'relevance gates inherited overrides');
  assert.equal(get(apc).ratingOf('Heavy Tank Damage','defensive'), 4);
  assert.equal(get(apc).ratingOf('APC Damage','offensive'), 0, 'inherited explicit zero remains zero');
  DN.saveStrategyOverrides(apc, {'Heavy Tank Damage':{offensive:3}, 'APC Damage':{offensive:5}});
  DN.saveStrategyOverrides(fighter, {'APC Damage':{offensive:0}});
  assert.equal(get(apc).ratingOf('Heavy Tank Damage','offensive'), 3, 'local explicit choice precedes relevance');
  assert.equal(get(apc).ratingOf('APC Damage','offensive'), 5);
  assert.equal(get(fighter).ratingOf('APC Damage','offensive'), 0);
  assert.equal(get(apc).explain('APC Damage','offensive').source, 'override');
  DN.savePerkGroupDefaults({'single:damage':{offensive:4,defensive:3}});
  DN.updateStrategy(apc,{inheritRatings:false,overrides:{}});
  assert.equal(get(apc).ratingOf('APC Damage','offensive'), 4, 'clean strategy uses group defaults');
  const before = DN.strategyRevision();
  assert.equal(DN.strategyRevision(), before);
  DN.saveStrategyOverrides(apc, {'APC Damage':{offensive:0}});
  assert.notEqual(DN.strategyRevision(), before);
  assert.equal(get(apc).ratingOf('APC Damage','offensive'),0);
  let callbackCount = 0;
  controls.onEvent = event => { if (event.type === 'dn-strategies-changed') { callbackCount++; DN.loadStrategies(); } };
  DN.setActiveStrategy(apc);
  assert.equal(callbackCount, 1, 'listeners can synchronously read persisted state');
  assert(events.every(event => event.detail.revision && event.detail.profileId));
  const copy = DN.addStrategy('APC copy',{duplicateId:apc});
  DN.saveStrategyOverrides(copy, {'APC Damage':{offensive:-2}});
  assert.equal(get(apc).ratingOf('APC Damage','offensive'),0,'duplicate ratings are independent');
  assert.equal(get(copy).ratingOf('APC Damage','offensive'),-2);
}

{
  const originalArmy = JSON.stringify({v:1, activeId:'fighter', lastApplied:['APC'], presets:[
    {id:'fighter',name:'Fighter saved',units:['Fighter']}, {id:'tanks',name:'Tanks saved',units:['Heavy Tank']},
  ]});
  const originalGlobal = ratings({'Heavy Tank Damage':{offensive:0,defensive:4},'APC Damage':{offensive:3}});
  const originalProfile = ratings({'Heavy Infantry Damage':{offensive:5},'APC Damage':{offensive:0}});
  const originalGroups = ratings({'multi:damage':{offensive:2,defensive:3}});
  const originalLayout = JSON.stringify({Main:{mains:['a'],singles:{},hermitage:null,scannedPlaced:['a']}});
  const {DN,store} = boot({[scoped('dn-army-presets')]:originalArmy,
    'dn-artifact-perk-ratings-global':originalGlobal, [scoped('dn-artifact-perk-ratings')]:originalProfile,
    dn_perk_group_defaults_v1:originalGroups, [scoped('dn-artifact-loadout')]:originalLayout});
  const oldLayers = DN.loadActivePerkRatingLayers(), oldApplied = DN.armyEffectiveAppliedSet(['APC']);
  const oldRating = (name,axis) => DN.storedPerkRating(oldLayers.global,oldLayers.profile,name,axis) ?? DN.armyAwareDefault(defaults,oldApplied,name,axis,{expanded:true});
  const state = DN.loadStrategies(), active = DN.activeStrategy(), context = DN.createStrategyRatingContext(defaults);
  assert.equal(state.strategies.length, 3);
  assert.deepEqual(plain(active.units),['APC'],'applied state survives a different active preset');
  assert.equal(active.legacy.configured,true);
  for (const name of Object.keys(defaults)) for (const axis of DN.RATING_AXES) {
    assert.equal(context.ratingOf(name,axis),oldRating(name,axis),`${name} ${axis}: migration is score-preserving`);
  }
  assert.equal(context.ratingOf('APC Damage','offensive'),0,'explicit zero precedes linked-unit factory ratings');
  assert.equal(context.ratingOf('Heavy Infantry Damage','offensive'),10);
  assert.equal(context.ratingOf('Barracks Troop Damage','offensive'),4);
  assert.equal(context.ratingOf('Heavy Tank Hitpoints','defensive'),0,'legacy gating remains exact for both axes');
  const fighter = state.strategies.find(item=>item.id==='fighter');
  assert.equal(fighter.inheritRatings,false);
  assert.deepEqual(plain(fighter.units),['Fighter']);
  const clean = DN.createStrategyRatingContext(defaults,{strategyId:'fighter'});
  assert.equal(clean.ratingOf('Fighter Damage','offensive'),defaults['Fighter Damage'].offensive);
  const created = DN.addStrategy('New tank army',{units:['Heavy Tank']});
  const tankContext = DN.createStrategyRatingContext(defaults,{strategyId:created});
  assert.equal(tankContext.ratingOf('Heavy Tank Damage','offensive'),defaults['Heavy Tank Damage'].offensive,'old auto-zero does not leak into a new army');
  DN.saveGlobalPerkRatings({'APC Damage':{offensive:-5}});
  DN.savePerkGroupDefaults({'multi:damage':{offensive:-5}});
  assert.equal(DN.createStrategyRatingContext(defaults).ratingOf('APC Damage','offensive'),0,'legacy rating snapshot is durable');
  assert.equal(DN.createStrategyRatingContext(defaults).ratingOf('Barracks Troop Damage','offensive'),4,'group defaults are snapshotted');
  const backup = JSON.parse(store.get(scoped(DN.STRATEGY_MIGRATION_BACKUP_KEY)));
  assert.equal(backup.raw.army,originalArmy);
  assert.equal(backup.raw.profileRatings,originalProfile);
  assert.equal(backup.raw.globalRatings,originalGlobal);
  assert.equal(backup.raw.groupDefaults,originalGroups);
  assert.equal(backup.raw.loadout,originalLayout);
  assert.equal(store.get(scoped('dn-army-presets')),originalArmy,'old raw army remains available');
  DN.updateStrategy(active.id,{units:['APC']});
  assert(DN.activeStrategy().legacy,'saving unchanged units preserves exact legacy behavior');
  DN.updateStrategy(active.id,{units:['Heavy Tank']});
  assert.equal(DN.activeStrategy().legacy,undefined);
  assert.equal(DN.createStrategyRatingContext(defaults).ratingOf('Heavy Tank Damage','offensive'),defaults['Heavy Tank Damage'].offensive);
}

{
  const oldBag = ratings({'APC Damage':{offensive:0,defensive:2}});
  const {DN,store} = boot({[scoped('dn-artifact-perk-ratings')]:oldBag},{oldLayers:true});
  DN.loadStrategies();
  const backup = JSON.parse(store.get(scoped(DN.STRATEGY_MIGRATION_BACKUP_KEY)));
  assert.equal(backup.raw.profileRatings,oldBag,'raw profile ratings survive the older layer migration');
  assert.equal(DN.createStrategyRatingContext(defaults).ratingOf('APC Damage','offensive'),0);
}

{
  const canon = name => name === 'APC HP' ? 'APC Hitpoints' : name;
  const {DN} = boot({'dn-artifact-perk-ratings-global':ratings({'APC HP':{offensive:0,defensive:4}})});
  const context = DN.createStrategyRatingContext(defaults,{canonPerk:canon});
  assert.equal(context.ratingOf('APC Hitpoints','offensive'),0,'legacy aliases honor explicit zero');
  assert.equal(context.ratingOf('APC Hitpoints','defensive'),8);
}

{
  const {DN,store} = boot();
  const main = DN.activeStrategyId();
  const a = DN.addStrategy('One',{units:['APC']});
  const b = DN.addStrategy('Two',{units:['Heavy Tank']});
  assert.deepEqual(plain(DN.comparisonStrategies().map(item=>item.id)),[main,a,b],'new strategies automatically join default comparison');
  DN.setComparisonStrategyIds([a]);
  const c = DN.addStrategy('Three');
  assert.deepEqual(plain(DN.comparisonStrategies().map(item=>item.id)),[a],'explicit comparison subset persists');
  DN.setActiveStrategy(a);
  assert(DN.archiveStrategy(a));
  assert.notEqual(DN.activeStrategyId(),a);
  assert.equal(DN.setActiveStrategy(a),false);
  assert.equal(DN.comparisonStrategies().some(item=>item.id===a),false);
  DN.updateStrategy(a,{archived:false});
  DN.setComparisonStrategyIds(DN.loadStrategies().strategies.map(item=>item.id));
  assert.equal(DN.loadStrategies().comparisonAll,true);
  const oldProfile = DN.activeProfileId();
  DN.saveStrategyOverrides(main, {'APC Damage':{offensive:5}});
  const newProfile = DN.addProfile('Second account');
  DN.setActiveProfile(newProfile);
  const other = DN.activeStrategy();
  assert.equal(other.inheritRatings,true);
  assert.notEqual(other.id,main);
  assert.equal(DN.createStrategyRatingContext(defaults).ratingOf('APC Damage','offensive'),defaults['APC Damage'].offensive);
  DN.saveStrategyOverrides(other.id,{'APC Damage':{offensive:-3}});
  DN.setActiveProfile(oldProfile);
  assert.equal(DN.createStrategyRatingContext(defaults,{strategyId:main}).ratingOf('APC Damage','offensive'),5);
  store.set(scoped(DN.STRATEGY_MIGRATION_BACKUP_KEY,newProfile),'test backup');
  DN.removeProfile(newProfile);
  assert.equal(store.has(scoped(DN.STRATEGIES_KEY,newProfile)),false);
  assert.equal(store.has(scoped(DN.STRATEGY_MIGRATION_BACKUP_KEY,newProfile)),false);
  assert(DN.removeStrategy(c));
}

{
  const {DN,store} = boot();
  const first = DN.activeStrategyId();
  const second = DN.addStrategy('Second layout');
  const layout = DN.loadLoadout(first);
  layout.Main.mains = ['artifact-a'];
  layout.Main.scannedPlaced = ['artifact-a'];
  DN.saveLoadout(layout,first);
  assert.equal(DN.loadLoadout(second).Main.mains.length,0);
  DN.saveLoadout({...layout,War:{mains:[],hermitage:'artifact-a',singles:{},scannedPlaced:[]}},second);
  assert.equal(DN.artifactSlots('artifact-a').length,3,'ownership warnings cover inactive strategy slots');
  const copy = DN.addStrategy('Duplicate layout',{duplicateId:first});
  const changed = DN.loadLoadout(copy);
  changed.Main.mains.push('artifact-b');
  DN.saveLoadout(changed,copy);
  assert.deepEqual(plain(DN.loadLoadout(first).Main.mains),['artifact-a']);
  store.set(scoped(DN.LOADOUT_KEY),JSON.stringify(layout));
  DN.removeArtifactSlots('artifact-a');
  for (const strategy of DN.loadStrategies().strategies) for(const hall of ['Main','War']) {
    const entry = strategy.loadout[hall];
    assert(!entry.mains.includes('artifact-a'));
    assert.notEqual(entry.hermitage,'artifact-a');
    assert(!entry.scannedPlaced.includes('artifact-a'));
  }
  assert(!JSON.parse(store.get(scoped(DN.LOADOUT_KEY))).Main.mains.includes('artifact-a'));
}

{
  const {DN,store,controls} = boot();
  controls.failKey = scoped(DN.STRATEGIES_KEY);
  assert.throws(()=>DN.loadStrategies(),/Storage write failed/);
  assert.equal(store.has(scoped(DN.STRATEGIES_KEY)),false,'failed write cannot mark a profile migrated');
  assert(store.has(scoped(DN.STRATEGY_MIGRATION_BACKUP_KEY)));
  controls.failKey = null;
  assert(DN.loadStrategies().strategies.length);
  const {DN:second,store:secondStore,controls:secondControls} = boot();
  secondControls.failKey = scoped(second.STRATEGY_MIGRATION_BACKUP_KEY);
  assert.throws(()=>second.loadStrategies(),/Storage write failed/);
  assert.equal(secondStore.has(scoped(second.STRATEGIES_KEY)),false,'backup failure leaves migration retryable');
  secondControls.failKey = null;
  assert(second.loadStrategies().strategies.length);
}

{
  const {DN} = boot();
  DN.loadStrategies();
  for(let i=0;i<10;i++) assert(DN.addStrategy(`Army ${i}`,{units:['APC']}));
  assert.equal(DN.loadStrategies().strategies.length,11,'at least ten strategies are supported');
  const imported = Array.from({length:25},(_,i)=>({id:`import-${i}`,name:`Imported ${i}`,units:['APC']}));
  DN.saveStrategies({activeId:'import-0',strategies:imported});
  assert.equal(DN.loadStrategies().strategies.length,25,'imported strategies are never silently truncated');
  assert.equal(DN.addStrategy('Over UI limit'),null);
  const presets = Array.from({length:12},(_,i)=>({id:`p-${i}`,name:`Preset ${i}`,units:['APC']}));
  const legacy = boot({[scoped('dn-army-presets')]:JSON.stringify({activeId:'p-0',lastApplied:['APC'],presets})});
  assert.equal(legacy.DN.loadStrategies().strategies.length,12,'migration retains saved presets without duplicating the current preset');
  assert.equal(legacy.DN.activeStrategyId(),'p-0');
  assert.equal(legacy.DN.activeStrategy().name,'Preset 0');
}

{
  const {DN,store} = boot({[scoped('dn-strategies')]:JSON.stringify({strategies:[{name:'Imported without id'}]})});
  const id = DN.activeStrategyId(), revision = DN.strategyRevision();
  assert.equal(DN.activeStrategyId(),id,'imported missing IDs are durably repaired');
  assert.equal(DN.strategyRevision(),revision,'normal reads do not rewrite strategy storage');
  assert.equal(JSON.parse(store.get(scoped(DN.STRATEGIES_KEY))).strategies[0].id,id);
}

{
  for (const edited of [false, true]) {
   for (const alreadyRenamed of [false, true]) {
    const army = {activeId:'preset-1',lastApplied:['APC'],presets:[{id:'preset-1',name:'Preset 1',units:['APC']}]};
    const {DN,store} = boot({[scoped('dn-army-presets')]:JSON.stringify(army)});
    const state = plain(DN.loadStrategies());
    const current = state.strategies[0];
    const duplicate = {...plain(current), legacy:undefined, overrides:edited ? {'APC Damage':{offensive:4}} : {}};
    current.id='migration-snapshot'; current.name=alreadyRenamed ? 'Preset 1' : 'Preset 1 (Legacy)';
    current.loadout.Main.mains=['artifact-used-after-migration'];
    state.activeId=current.id;
    state.strategies.push(duplicate);
    state.comparisonIds=[current.id,duplicate.id];
    store.set(scoped(DN.STRATEGIES_KEY),JSON.stringify(state));
    const repaired=DN.loadStrategies();
    assert.equal(repaired.strategies.length,edited ? 2 : 1,'only untouched migration duplicates are consolidated');
    assert.equal(DN.activeStrategy().name,'Preset 1','current preset has an ordinary name');
    assert.equal(repaired.strategies.filter(s=>s.name==='Preset 1').length,1,'already renamed migration state has just one Preset 1');
    assert.deepEqual(plain(DN.activeStrategy().loadout.Main.mains),['artifact-used-after-migration'],'cleanup preserves current artifact layout');
    assert.deepEqual(plain(DN.activeStrategy().legacy),current.legacy,'current rating snapshot is preserved');
    assert.equal(new Set(repaired.comparisonIds).size,repaired.comparisonIds.length,'comparison selection remains valid');
    const durable=store.get(scoped(DN.STRATEGIES_KEY));
    DN.loadStrategies();
    assert.equal(store.get(scoped(DN.STRATEGIES_KEY)),durable,'repair is durable and runs once');
   }
  }
}

{
  const {DN,store,controls} = boot();
  const baseline = {'Heavy Tank Damage':{offensive:5,defensive:1},'Fighter Damage':{offensive:4,defensive:2},'All Resources Looted':{offensive:3,defensive:0}};
  DN.savePerkGroupDefaults({'single:damage':{offensive:2,defensive:1}});
  DN.saveGlobalPerkRatings({'Heavy Tank Damage':{offensive:0,defensive:-2}});
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Fighter Damage':{offensive:3,defensive:0}});
  const sharedBefore=JSON.stringify(DN.loadActivePerkRatingLayers());
  const fromDefaults=DN.addStrategy('Defaults',{units:['Heavy Tank'],baseline:'defaults',factoryDefaults:baseline});
  const fromProfile=DN.addStrategy('Profile copy',{units:[],baseline:'profile',factoryDefaults:baseline});
  const rating=(id,name,axis='offensive')=>DN.createStrategyRatingContext(baseline,{strategyId:id}).ratingOf(name,axis);
  assert.equal(rating(fromDefaults,'Heavy Tank Damage'),2,'default baseline uses army/group defaults rather than old profile zeroes');
  assert.equal(rating(fromProfile,'Heavy Tank Damage'),0,'profile baseline preserves explicit zero');
  assert.equal(rating(fromProfile,'Heavy Tank Damage','defensive'),-2,'profile baseline preserves negative ratings');
  assert.equal(rating(fromProfile,'Fighter Damage'),3);
  assert.equal(rating(fromProfile,'Fighter Damage','defensive'),0);
  DN.updateStrategy(fromDefaults,{units:['Heavy Tank'],overrides:{'Heavy Tank Damage':{offensive:-1,defensive:0}}});
  const copied=DN.addStrategy('Strategy copy',{baseline:'strategy',sourceId:fromDefaults,units:[],factoryDefaults:baseline});
  assert.deepEqual(plain(DN.loadStrategies().strategies.find(s=>s.id===copied).units),['Heavy Tank'],'existing strategy baseline copies troops');
  assert.equal(rating(copied,'Heavy Tank Damage'),-1);
  assert.equal(rating(copied,'Heavy Tank Damage','defensive'),0);
  const copiedLayout=DN.loadLoadout(copied);
  assert.equal(copiedLayout.Main.mains.length,0,'copied rating baseline starts with its own empty artifact layout');
  assert.equal(JSON.stringify(DN.loadActivePerkRatingLayers()),sharedBefore,'creation never edits shared rating sources');
  DN.saveGlobalPerkRatings({'Heavy Tank Damage':{offensive:5}});
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Fighter Damage':{offensive:-4}});
  DN.savePerkGroupDefaults({'single:damage':{offensive:5,defensive:5}});
  DN.saveStrategyOverrides(fromDefaults,{'Heavy Tank Damage':{offensive:4}});
  assert.equal(rating(copied,'Heavy Tank Damage'),-1,'strategy baseline is independent of later source edits');
  assert.equal(rating(fromProfile,'Fighter Damage'),3,'profile baseline is independent of later profile edits');
  assert.equal(rating(fromDefaults,'Heavy Tank Damage','defensive'),1,'default baseline is independent of later group edits');
  DN.saveStrategyOverrides(copied,{});
  assert.equal(rating(copied,'Heavy Tank Damage'),2,'clearing a copied rating restores its army default, not the source value');
  const beforeRoundtrip=JSON.stringify(DN.loadStrategies());
  DN.saveStrategies(JSON.parse(beforeRoundtrip));
  assert.equal(rating(copied,'Heavy Tank Damage'),2,'baseline survives backup normalization');
  DN.removeStrategy(fromDefaults);
  assert.equal(rating(copied,'Heavy Tank Damage'),2,'deleting the source does not change the copy');
  const count=DN.loadStrategies().strategies.length;
  controls.failKey=scoped(DN.STRATEGIES_KEY);
  assert.throws(()=>DN.addStrategy('Failed copy',{baseline:'profile',factoryDefaults:baseline,activate:true}),/Storage write failed/);
  controls.failKey=null;
  assert.equal(DN.loadStrategies().strategies.length,count,'failed creation is atomic');
  const firstProfile=DN.activeProfileId(), otherProfile=DN.addProfile('Other baseline profile');
  DN.setActiveProfile(otherProfile);
  assert.throws(()=>DN.addStrategy('Cross profile copy',{baseline:'strategy',sourceId:copied,factoryDefaults:baseline}),/no longer in this profile/);
  DN.setActiveProfile(firstProfile);
  DN.saveProfilePerkOverrides(firstProfile,{'Imported tank alias':{offensive:-4}});
  const canonicalCopy=DN.addStrategy('Canonical profile copy',{baseline:'profile',factoryDefaults:baseline,canonPerk:name=>name==='Imported tank alias'?'Heavy Tank Damage':name});
  assert.equal(rating(canonicalCopy,'Heavy Tank Damage'),-4,'profile baseline resolves imported aliases before copying');
  assert.equal(DN.loadStrategies().strategies.find(s=>s.id===canonicalCopy).overrides['Imported tank alias'],undefined,'aliases do not leave hidden overrides that cannot be cleared');
}

{
  const {DN,store} = boot({[scoped('dn-army-presets')]:JSON.stringify({activeId:'army',lastApplied:['Heavy Tank'],presets:[{id:'army',name:'Existing army',units:['Heavy Tank']}]})});
  const initial=DN.activeStrategyId(), other=DN.addStrategy('Previously inheriting',{units:['Fighter']});
  DN.updateStrategy(other,{inheritRatings:true});
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Fighter Damage':{offensive:0,defensive:-2}});
  const values=Object.fromEntries([initial,other].map(id=>[id,Object.fromEntries(Object.keys(defaults).map(name=>[name,Object.fromEntries(DN.RATING_AXES.map(axis=>[axis,DN.createStrategyRatingContext(defaults,{strategyId:id}).ratingOf(name,axis)]))]))]));
  DN.initializeStrategyBaselines(defaults);
  for(const id of [initial,other])for(const name of Object.keys(defaults))for(const axis of DN.RATING_AXES)assert.equal(DN.createStrategyRatingContext(defaults,{strategyId:id}).ratingOf(name,axis),values[id][name][axis],'conversion preserves existing effective rating');
  const durable=store.get(scoped(DN.STRATEGIES_KEY));
  DN.initializeStrategyBaselines(defaults);
  assert.equal(store.get(scoped(DN.STRATEGIES_KEY)),durable,'existing baselines freeze only once');
  DN.saveProfilePerkOverrides(DN.activeProfileId(),{'Fighter Damage':{offensive:5,defensive:5}});
  assert.equal(DN.createStrategyRatingContext(defaults,{strategyId:other}).ratingOf('Fighter Damage','defensive'),-2,'converted strategy is independent from its old profile source');
}

console.log('Strategies: independent ratings, relevance, linked units, exact migration, layouts, profiles, comparison selection, retries, import retention and creation baselines passed.');
