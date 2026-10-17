const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = new Map();
const context = {window:{},document:{getElementById:()=>null},localStorage:{
  getItem:key=>storage.get(key) ?? null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key),
}};
vm.createContext(context);
for(const file of ['data/army_catalog.js','shared.js','artifact-scoring.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const DN=context.window.DN,scorer=context.window.DNArtifactScoring;
DN.saveGlobalPerkRatings({"Generals' Damage":{offensive:5,defensive:5},"Generals' Hitpoints":{offensive:3,defensive:3},'Tower Damage':{offensive:4}});
DN.saveProfilePerkOverrides(DN.activeProfileId(),{"Generals' Damage":{offensive:1}});
const global=DN.loadStoredGlobalPerkRatings();
const defaults=JSON.parse(fs.readFileSync('ui/data/perk_rating_defaults.json','utf8'));
assert.deepEqual(defaults,JSON.parse(fs.readFileSync('data/perk_rating_defaults.json','utf8')));
for(const [name,value] of [["Generals' Damage",3],["Generals' Hitpoints",2],["Generals' Movement Speed",2]]) {
  assert.deepEqual(structuredClone(global[name]),{offensive:value,defensive:value});
  assert.deepEqual(defaults[name],{offensive:value,defensive:value});
}
assert.equal(global['Tower Damage'].offensive,4);
assert.equal(DN.loadProfilePerkOverrides(DN.activeProfileId())["Generals' Damage"].offensive,1);
const row={perk_1_name:"Generals' Hitpoints",perk_1_base:20};
function score(offensive,defensive,ratings) {
  return scorer.comparisonScore(row,{canonPerk:name=>name,ratingOf:(name,axis)=>ratings[name][axis],prefSortAxes:{offensive,defensive}}, {grade:'Legendary'}).basePreference;
}
assert.equal(score(true,false,global),40);
assert.equal(score(false,true,global),40);
assert.equal(score(true,true,global),40);
assert.equal(score(true,true,{"Generals' Hitpoints":{offensive:3,defensive:3}}),60,'both axes count the perk once');
assert.equal(score(true,true,{"Generals' Hitpoints":{offensive:2,defensive:5}}),100,'higher defense wins');
assert.equal(score(true,true,{"Generals' Hitpoints":{offensive:5,defensive:2}}),100,'higher offense wins');
const mixed=scorer.comparisonScore({perk_1_name:'Offense perk',perk_1_base:10,perk_2_name:'Defense perk',perk_2_base:20}, {
  canonPerk:name=>name,
  ratingOf:(name,axis)=>name==='Offense perk'?(axis==='offensive'?5:1):(axis==='offensive'?1:4),
  prefSortAxes:{offensive:true,defensive:true},
},{hall:'main',grade:'Weapon',eligible:[true,false]});
assert.equal(mixed.basePreference,130,'choose the higher axis independently for each perk');
assert.equal(mixed.lines[0].preference,50);assert.equal(mixed.lines[1].preference,80);
assert.equal(mixed.potentialPreference,180,'reroll gain uses the same score without double counting');
DN.saveGlobalPerkRatings({...global,"Generals' Hitpoints":{offensive:4,defensive:1}});
assert.equal(DN.loadStoredGlobalPerkRatings()["Generals' Hitpoints"].offensive,4,'migration does not overwrite subsequent edits');
DN.saveGlobalPerkRatings({});
assert.equal(Object.keys(DN.loadStoredGlobalPerkRatings()).length,0,'reset stays reset');
console.log('General factory/global ratings, preserved profile overrides, one-time migration, reset and offense/defense scores passed.');
