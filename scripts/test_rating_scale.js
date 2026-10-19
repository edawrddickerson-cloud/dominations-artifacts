const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const old=overrides=>JSON.stringify({v:2,overrides});
const profile=id=>`dn-p:${id}:`;
const values={Zero:0,One:1,Two:2,Three:3,Four:4,Five:5,Penalty:-3};
const bag=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{offensive:value,defensive:-value}]));
const strategy={id:'saved',name:'Saved army',units:['Heavy Tank'],overrides:bag,baselineGroups:{'single:damage':{offensive:3}},legacy:{configured:true,ratings:bag,groupDefaults:{'single:hp':{defensive:4}}}};
const state=()=>JSON.stringify({v:1,activeId:'saved',strategies:[strategy]});
const store=new Map(Object.entries({
  'dn-profiles':JSON.stringify({v:1,activeId:'main',profiles:[{id:'main',name:'Main'},{id:'other',name:'Other'}]}),
  'dn-perk-ratings-layer-migrated':'1','dn-general-ratings-2026-10-16':'1',
  'dn-artifact-perk-ratings-global':old(bag),dn_perk_group_defaults_v1:old({'single:damage':{offensive:5,defensive:0}}),
  [profile('main')+'dn-artifact-perk-ratings']:old(bag),[profile('other')+'dn-artifact-perk-ratings']:old(bag),
  [profile('main')+'dn-strategies']:state(),[profile('other')+'dn-strategies']:state(),
  [profile('main')+'dn-council-stat-ratings']:JSON.stringify({v:1,ratings:bag}),
}));
let failKey;
function boot(){
  const context={window:{},document:{getElementById:()=>null},localStorage:{getItem:key=>store.get(key)??null,setItem(key,value){if(key===failKey)throw Error('Fixture storage full');store.set(key,String(value));},removeItem:key=>store.delete(key)}};
  vm.createContext(context);
  for(const file of ['data/army_catalog.js','shared.js','council-shared.js','artifact-scoring.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
  return context.window;
}
let {DN,DNCouncil:C,DNArtifactScoring:scorer}=boot();
assert.equal(DN.RATING_MAX,10);assert.equal(DN.RATING_MIN,-10);
const check=ratingBag=>{for(const [name,value]of Object.entries(values)){assert.equal(ratingBag[name].offensive,value*2,name);assert.equal(ratingBag[name].defensive,(-value*2)||0,name);}};
check(DN.loadStoredGlobalPerkRatings());
const row={perk_1_name:'One',perk_1_base:10,perk_2_name:'Two',perk_2_base:20,perk_3_name:'Penalty',perk_3_base:15};
const points=ratings=>scorer.comparisonScore(row,{canonPerk:name=>name,ratingOf:(name,axis)=>ratings[name]?.[axis]||0,prefSortAxes:{offensive:true,defensive:false}},{grade:'Legendary'}).basePreference;
assert.equal(points(DN.loadStoredGlobalPerkRatings()),points(bag)*2,'weighted scores scale proportionally');
const council=C.sanitizeOverrides(C.migrateRatings(C.loadRatingsRaw()));check(council);C.saveRatings(council);
check(C.migrateRatings(C.loadRatingsRaw()));assert.equal(C.RATING_MAX,10);
assert.equal(DN.loadPerkGroupDefaults()['single:damage'].offensive,10);
assert.equal(DN.loadPerkGroupDefaults()['single:damage'].defensive,0);
for(const id of ['main','other']){
  check(DN.loadProfilePerkOverrides(id));DN.setActiveProfile(id);
  const saved=DN.activeStrategy();check(saved.overrides);check(saved.legacy.ratings);
  assert.equal(saved.baselineGroups['single:damage'].offensive,6);
  assert.equal(saved.legacy.groupDefaults['single:hp'].defensive,8);
  assert.equal(DN.loadStrategies().ratingScale,10);
}
const durable=new Map(store);
DN=boot().DN;
for(const id of ['main','other']){DN.setActiveProfile(id);check(DN.activeStrategy().overrides);check(DN.loadProfilePerkOverrides(id));}
check(DN.loadStoredGlobalPerkRatings());
assert.equal(store.get('dn-artifact-perk-ratings-global'),durable.get('dn-artifact-perk-ratings-global'),'reload does not rescale current records');
DN.saveStrategyOverrides('saved',{Odd:{offensive:7},Zero:{offensive:0}});
assert.equal(DN.activeStrategy().overrides.Odd.offensive,7,'new odd values remain precise');
DN.saveGlobalPerkRatings({Odd:{offensive:9},Zero:{offensive:0}});
assert.equal(DN.loadStoredGlobalPerkRatings().Odd.offensive,9);
// A restored older record must migrate even after the rest of the store is new.
store.set('dn-artifact-perk-ratings-global',old(bag));failKey='dn-artifact-perk-ratings-global';
assert.throws(()=>DN.loadStoredGlobalPerkRatings(),/storage full/);assert.equal(store.get(failKey),old(bag));
failKey=null;check(DN.loadStoredGlobalPerkRatings());check(DN.loadStoredGlobalPerkRatings());
store.set(profile('other')+'dn-strategies',state());failKey=profile('other')+'dn-strategies';
assert.throws(()=>DN.loadStrategies(),/storage full/);assert.equal(store.get(failKey),state());
failKey=null;check(DN.activeStrategy().overrides);check(DN.activeStrategy().overrides);
const backup=JSON.parse(store.get(profile('main')+DN.STRATEGY_MIGRATION_BACKUP_KEY));
assert.equal(backup.raw.globalRatings,old(bag),'original rating evidence is preserved before conversion');
assert.equal(backup.raw.strategies,state(),'original strategies are preserved before conversion');
const defaults=JSON.parse(fs.readFileSync('ui/data/perk_rating_defaults.json','utf8'));
assert.deepEqual(defaults,JSON.parse(fs.readFileSync('data/perk_rating_defaults.json','utf8')));
for(const entry of Object.values(defaults))for(const value of Object.values(entry))assert(value>=-10&&value<=10&&value%2===0);
console.log('Rating scale: zero, positive/negative weights, profiles, strategy snapshots, baselines, old backups, reloads, odd edits and interrupted migrations passed.');
