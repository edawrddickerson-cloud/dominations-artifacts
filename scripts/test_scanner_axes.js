const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const values=new Map(),context={structuredClone,window:{addEventListener(){},dispatchEvent(){}},document:{getElementById:()=>null,querySelector:()=>null},
  CustomEvent:class{constructor(type){this.type=type;}},localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
vm.createContext(context);
for(const file of ['data/army_catalog.js','shared.js','data/artifact_stat_context.js','data/crafted_perk_pools.js','artifact-scoring.js','stored-artifacts.js','scanner-comparison.js','crafting-purposes.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const {DN,DNCraftingPurposes:api,DNArtifactScoring:scoring,DNScannerComparisonCore:core,DNStoredArtifacts:store}=context.window;
const axes={off:{offensive:true,defensive:false},def:{offensive:false,defensive:true},both:{offensive:true,defensive:true}};
const same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
for(const selected of Object.values(axes)) {
  for(const type of ['Weapon','Armor','Equipment'])same(scoring.craftingAxes(selected,{hall:'war',type}),selected,'all War categories follow the toggle');
  same(scoring.craftingAxes(selected,{hall:'main',type:'Weapon'}),selected,'mixed Main Weapon follows the toggle');
  for(const type of ['Armor','Pottery'])same(scoring.craftingAxes(selected,{hall:'main',type}),axes.def,'Main defensive-only categories override Off');
  same(scoring.craftingAxes(selected,{hall:'main',type:'Jewelry'}),axes.off,'Main offensive-only category overrides Def');
  same(core.craftOptions({prefSortAxes:selected,targetScoring:true},{hall:'war',type:'Weapon'}).prefSortAxes,selected,'target scoring uses the same effective axes');
}
same(scoring.craftingAxes({offensive:false,defensive:false},{hall:'main',type:'Armor'}),{offensive:false,defensive:false},'no selected axes stay disabled');
api.setDefaults(Object.fromEntries(Object.keys(context.window.DN_ARTIFACT_STAT_CONTEXT.stats).map(name=>[name,{offensive:5,defensive:5}])));
const names=['Heavy Tank Damage','Heavy Tank Hitpoints','Assault Vehicle Damage','Invading Heavy Tank Damage','Invading Heavy Tank Hitpoints'];
const weights=[10,9,4,6,1],numbers=[6,3,1,-3,-1];
const defence=api.saveCustom({label:'Defence donor',category:'defensive',perks:names.slice(3)});api.selectPurpose(defence,false);
const target=api.saveCustom({label:'Mixed target',category:'attacking',perks:names.slice(0,3),addOns:{defensive:{source:'target',targetId:defence}}});
api.configure(target,{weights:Object.fromEntries(names.map((name,i)=>[name,weights[i]]))});
const rows=numbers.map((value,i)=>({name:names[i],value,known:true,hasPercent:true,level:1,unlocked:false,rerollEligible:false}));
const read={valid:true,hall:'war',artifact:{type:'Weapon'},rows};
const owned=(id,name,stats)=>store.toRow({id,name,hall:'war',type:'Weapon',rows:stats.map(row=>({...row,base:row.value,max:Math.sign(row.value)*(Math.abs(row.value)+9)}))});
const cards=[owned('best','Best crafted card',rows.map((row,i)=>i===1?{...row,value:6}:row)),owned('second','Second crafted card',rows),owned('lower','Lower card',rows.map(row=>({...row,value:Math.sign(row.value)})))];
const original=JSON.stringify([api.settings().customPurposes,rows,cards]);
for(const [mode,expected] of [['both',380],['off',298],['def',82],['both',380],['off',298]]) {
  const result=api.evaluate(read,{hall:'war',type:'Weapon',owned:cards,selected:[target],prefSortAxes:axes[mode]})[0];
  assert.equal(result.score,expected,mode+' current craft');assert.equal(result.threshold,expected,mode+' second-owned cutoff');
  assert.equal(result.benchmarkItem.id,'second');assert.equal(result.benchmarkItem.name,'Second crafted card');
  assert.equal(result.contributions.reduce((sum,row)=>sum+(row.score || 0),0),expected,'inline contributions match the target total');
  const options=api.scoringOptions(target,{canonPerk:name=>name,prefSortAxes:axes[mode],scoreMode:'combined'},{hall:'war',type:'Weapon'});
  assert.equal(core.craftPotential(read,options).potentialPreference,expected,'reroll/base scoring uses the identical axes');
  assert(result.contributions.filter(row=>!axes[mode][row.axis]).every(row=>row.weight===0 && row.score===0),'disabled axes contribute zero');
}
assert.equal(JSON.stringify([api.settings().customPurposes,rows,cards]),original,'toggle changes never rewrite shared ratings, target membership or scans');
names.forEach((name,i)=>assert.equal(api.ratingOf(name),weights[i]));
console.log('Scanner axes: mixed War/Main toggle, single-axis overrides, 380→298→82 cutoff, contribution parity and cache invalidation passed.');
