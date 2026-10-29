/* Authority: User's 29 October correction and hand-calculated scoring examples.
 * Protected rule: actual rows at level 10 + ONE best eligible reroll gain.
 * Do not change the expected examples to match an implementation regression. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const values=new Map();
const context={structuredClone,CustomEvent:class{constructor(type){this.type=type;}},window:{addEventListener(){},dispatchEvent(){}},document:{getElementById:()=>null,querySelector:()=>null},localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
vm.createContext(context);
for(const file of ['data/army_catalog.js','shared.js','data/artifact_stat_context.js','data/crafted_perk_pools.js','artifact-scoring.js','stored-artifacts.js','scanner-comparison.js','crafting-purposes.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const {DN,DNScannerComparisonCore:core,DNStoredArtifacts:store,DNCraftingPurposes:purposes}=context.window;
const weights={'Heavy Tank Damage':10,'APC Damage':2,'Heavy Cavalry Damage':4,'Armored Car Damage':1,'MRL Damage':0,'Bazooka Damage':0};
const options={canonPerk:name=>name,ratingOf:(name,axis)=>axis==='offensive'?(weights[name]||0):0,scoreMode:'combined',prefSortAxes:{offensive:true,defensive:false}};
const card=second=>({valid:true,hall:'war',artifact:{type:'Weapon'},warnings:[],rows:['Heavy Tank Damage',second,'Armored Car Damage','MRL Damage','Bazooka Damage'].map(name=>({name,value:6,known:true,hasPercent:true,level:1,levelSource:'manual',rerollEligible:true}))});
// Real War blue rows upgrade from 6% to 15%. The other four identities stay.
const a=card('APC Damage'),b=card('Heavy Cavalry Damage');
for(const [read,base,expected] of [[a,195,345],[b,225,375]]){
  const before=JSON.stringify(read),actual=core.craftPotential(read,options);
  assert.equal(actual.basePreference,base,'upgrade the actual rows to level 10');
  assert.equal(actual.rerollTarget,150);
  assert.equal(actual.potentialPreference,expected,'apply ONE best reroll, never five hypothetical replacements');
  assert.equal(actual.rerollGain,150);
  assert.equal(actual.rerollGains.filter(value=>value>0).length,1);
  assert.notEqual(actual.potentialPreference,750);assert.equal(JSON.stringify(read),before,'scoring cannot rewrite actual stats');
}
const owned=[a,b].map((read,i)=>store.toRow({id:'contract-'+i,name:'Contract '+i,hall:'war',type:'Weapon',reviewed:true,rows:read.rows}));
assert.equal(core.compare(a,{type:'Weapon',hall:'war',owned,options,limit:2}).threshold,345,'owned cutoff uses the same actual-row formula');
assert.equal(core.compare(a,{type:'Weapon',hall:'war',owned,options,limit:2}).status,'tie');
const unavailable={...a,rows:a.rows.map(row=>({...row,rerollEligible:false}))};
assert.equal(core.craftPotential(unavailable,options).potentialPreference,195,'no eligible reroll means actual upgraded score only');
DN.saveProfilePerkOverrides(DN.activeProfileId(),Object.fromEntries(Object.entries(weights).map(([name,value])=>[name,{offensive:value}])));
const id=purposes.saveCustom({label:'Protected War formula',category:'attacking',perks:Object.keys(weights)});
const target=purposes.evaluate(a,{type:'Weapon',hall:'war',owned,selected:[id],prefSortAxes:options.prefSortAxes})[0];
assert.equal(target.score,345);assert.equal(target.threshold,345);
assert.equal(target.contributions.reduce((sum,row)=>sum+(row.score||0)+row.rerollGain,0),345,'target breakdown and owned cutoff preserve the same single-reroll score');
console.log('Protected crafting formula passed: actual level-10 cards score 345 and 375, never a flattened 750.');
