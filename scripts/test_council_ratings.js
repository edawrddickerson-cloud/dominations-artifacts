const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const store = new Map();
const sandbox = {window:{}, document:{getElementById:()=>null}, localStorage:{
  getItem:key=>store.get(key) ?? null, setItem:(key,value)=>store.set(key,String(value)), removeItem:key=>store.delete(key),
}};
vm.createContext(sandbox);
for (const file of ['data/army_catalog.js','shared.js','council-shared.js','artifact-scoring.js']) vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),sandbox);
const {DN, DNCouncil:C, DNArtifactScoring:scorer} = sandbox.window;
const artifact = JSON.parse(fs.readFileSync('ui/data/perk_rating_defaults.json','utf8'));
const council = JSON.parse(fs.readFileSync('ui/data/council_stat_rating_defaults.json','utf8'));
const canon = DN.makeCanonPerk(DN.parseMappingCsv(fs.readFileSync('ui/data/perk_name_mapping.csv','utf8')));
const name = 'Heavy Tank Damage', unique = Object.keys(council).find(n=>!Object.hasOwn(artifact,n));
DN.loadStoredGlobalPerkRatings(); DN.saveGlobalPerkRatings({});
const originalProfile = DN.activeProfileId();
let context = C.createRatingContext(artifact,council,canon);
assert.equal(context.ratingOf(name,'offensive'),artifact[name].offensive,'shared factory replaces stale Council seed');
assert.equal(context.ratingOf(unique,'offensive'),council[unique].offensive,'unique stats keep Council seeds');
DN.savePerkGroupDefaults({'single:damage':{offensive:3}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),3);
DN.saveGlobalPerkRatings({[name]:{offensive:4}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),4);
DN.saveProfilePerkOverrides(originalProfile,{[name]:{offensive:5}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),5);
C.saveRatings({[name]:{offensive:0,defensive:-3}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),0,'explicit Council zero overrides shared positive');
assert.equal(context.ratingOf(name,'defensive'),-3,'negative overrides survive');
DN.saveProfilePerkOverrides(originalProfile,{[name]:{offensive:8}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),0,'shared edits cannot replace Council overrides');
assert.equal(context.inherited(name,'offensive').value,8);
C.saveRatings({[name]:{defensive:-3}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),8,'cleared axis inherits without removing other axis');
assert.equal(context.ratingOf(name,'defensive'),-3);
DN.saveStrategyOverrides(DN.activeStrategyId(),{[name]:{offensive:10}}); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),8,'artifact strategy overrides remain separate');
const other = DN.addProfile('Council isolation'); DN.setActiveProfile(other); context.refresh();
assert.equal(context.ratingOf(name,'offensive'),4,'other profile inherits global instead of first profile');
assert.equal(context.councilValue(name,'defensive'),null);
DN.setActiveProfile(originalProfile); context.refresh();
assert.equal(context.ratingOf(name,'defensive'),-3,'original Council overrides survive profile switch');
DN.lsSet('dn-council-stat-ratings',JSON.stringify({v:1,ratings:{[name]:{offensive:3,defensive:0}}}));
context.refresh(); assert.equal(context.ratingOf(name,'offensive'),6,'legacy scale migration preserved');
C.saveRatings(context.overrides); context.refresh(); assert.equal(context.ratingOf(name,'offensive'),6,'reload never rescales twice');
const alias = value=>value==='Tank alias'?name:canon(value);
C.saveRatings({'Tank alias':{offensive:7}});
assert.equal(C.createRatingContext(artifact,council,alias).ratingOf(name,'offensive'),7,'Council aliases canonicalize');
for (const axes of [{offensive:true,defensive:true},{offensive:true,defensive:false},{offensive:false,defensive:true}]) {
  for (const [off,def] of [[5,2],[2,5],[-5,-2],[0,4],[3,3]]) {
    const result=scorer.comparisonScore({perk_1_name:name,perk_1_base:10},{canonPerk:canon,ratingOf:(_n,axis)=>axis==='offensive'?off:def,prefSortAxes:axes},{grade:'Legendary'});
    assert.equal(C.activeLineScore(off*10,def*10,axes),result.basePreference,'Council active-axis score agrees with artifacts');
  }
}
console.log('Council ratings: inheritance, unique defaults, zero/negative overrides, clearing, profile isolation, legacy migration, aliases and artifact scoring parity passed.');
