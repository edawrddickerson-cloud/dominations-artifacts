const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},Date,crypto:require('node:crypto')};vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/stored-artifacts.js','utf8'),context);
const {merge,impliedRange}=context.window.DNStoredArtifacts;
const measured=context.window.DNStoredArtifacts.backfillItem({hall:'main',type:'Weapon',rows:[{name:'Damage',value:11,known:true,hasPercent:true,level:1,levelSource:'progress-bar',unlocked:true}]}).rows[0];
assert.equal(measured.level,1,'measured progress preserves an unlocked level one');
assert.equal(measured.base,11);assert.equal(measured.max,20);
assert.equal(measured.levelSource,'progress-bar');
for(const name of ['Mercenary Camp Deploys Spartans when Destroyed','APC Deploys Marines On Death','Castle spawns Sword Saints when Destroyed']) {
  assert.equal(impliedRange({name,value:1,level:10}).max,1,'Deployment counts never gain nine units from upgrade inference');
  const fixed=context.window.DNStoredArtifacts.backfillItem({hall:'war',type:'War Mythical',rows:[{name,value:1,level:1,base:1,max:10,rangeSource:'inferred-level'}]}).rows[0];
  assert.equal(fixed.max,1,'Legacy inferred count maxima are corrected in memory');
}
assert.equal(impliedRange({name:'Castle spawns Sword Saints when Destroyed',value:2,level:1}).max,2,'Profile 4 Sword Saints are a count, not an eleven-unit upgraded effect');
const item=(id='a')=>({id,name:'Example',hall:'main',type:'Weapon',reviewed:true,rows:[
  {name:'Damage',value:13,level:3,unlocked:true},{name:'Invading Damage',value:-8,level:3,unlocked:true},
  {name:'Hitpoints',value:1,level:1,unlocked:false},{name:'Hitpoints',value:6,level:1,unlocked:true}].map(row=>({...row,levelSource:'ocr'}))});
let result=merge([],[item(),item('b')]);
assert.equal(result.added,1);assert.equal(result.duplicates,1);assert.equal(result.collection.length,1);
assert.equal(result.consumedIds.length,2);
assert.equal(impliedRange(item().rows[1]).base,-6);assert.equal(impliedRange(item().rows[1]).max,-15);
const improved=item('new');improved.rows[0].value=14;improved.rows[0].level=4;improved.rows[1].value=-9;improved.rows[1].level=4;
improved.rows.reverse();result=merge([item()],[improved]);
assert.equal(result.updated,1);assert.equal(result.collection[0].id,'a');assert.equal(result.collection[0].rows[0].value,14);
assert.equal(result.collection[0].rows[1].value,-9);assert.equal(result.collection[0].rows[2].value,1,'duplicate perk order preserved');
let weaker=item('weak');weaker.rows[0].value=12;weaker.rows[0].level=2;
result=merge([item()],[weaker]);assert.equal(result.updated,1);assert.equal(result.collection[0].id,'a');assert.equal(result.collection[0].rows[0].value,12);
const mixed=item('mixed');mixed.rows[0].value=14;mixed.rows[0].level=4;mixed.rows[1].value=-7;mixed.rows[1].level=2;
assert.equal(merge([item()],[mixed]).updated,1,'latest levels replace old levels even when some rise and others fall');
const different=item('different');different.rows[0].value=6;different.rows[0].level=1;
assert.equal(merge([item()],[different]).added,1,'different implied roll allowed');
const unclear=item('unclear');unclear.rows[0].value=14;unclear.rows[0].level=null;
assert.equal(merge([item()],[unclear]).blocked,1,'unknown levels do not merge or duplicate an ambiguous item');
const entered=item('entered');entered.rows[0].base=999;entered.rows[0].max=1000;
assert.equal(merge([item()],[entered]).duplicates,1,'matching uses implied ranges, not entered endpoints');
const coincident=item('coincident');coincident.rows[0].level=8;
assert.equal(merge([item()],[coincident]).added,1,'equal current percentages with different tiers are distinct');
const renamed=item('renamed');renamed.name='Different name';
assert.equal(merge([item()],[renamed]).added,1,'different artifact names are distinct');
const repeats=item('repeats');repeats.rows[2]={...repeats.rows[3]};
assert.equal(merge([item()],[repeats]).added,1,'repeated stat tier multiplicity is significant');
console.log('Import duplicates, tier/level replacement, negative effects, row alignment and ambiguous levels passed.');
const {passivePlan,passiveMerge}=context.window.DNStoredArtifacts;
assert.equal(passivePlan([item() ],item('same')).action,'duplicate');
assert.equal(passivePlan([item()],improved).action,'updated');
assert.equal(passivePlan([item()],weaker).action,'unchanged','passive scans never lower saved stats');
assert.equal(passivePlan([item()],mixed).action,'unchanged','a larger positive value cannot hide a weaker negative stat');
assert.equal(passivePlan([item('copy-1'),item('copy-2')],improved).action,'blocked','ambiguous copies are never selected for automatic replacement');
assert.equal(passivePlan([item()],different).action,'added','a different base tier remains a distinct item');
const automatic=passiveMerge([item()],[improved]);
assert.equal(automatic.updated,1);assert.equal(automatic.collection[0].id,'a');
assert.equal(automatic.collection[0].revisions[0].rows[0].value,13,'automatic revisions preserve the previous stats');
const captureCorrection={...different,id:'a',manualCorrection:true};
assert.equal(passiveMerge([item()],[captureCorrection],{allowCorrection:true}).collection[0].rows[0].value,6,'editing a newly staged capture corrects that capture without creating a copy');
assert.equal(passiveMerge([item()],[captureCorrection]).updated,0,'capture corrections cannot bypass the owned upgrade gate');
console.log('Passive duplicates, monotonic positive/negative upgrades, ambiguity, capture corrections and revision history passed.');
const legacy={id:'legacy',rows:[{value:11,unlocked:true},{value:-5,unlocked:true,level:null},{value:6,unlocked:false},{value:8,level:3},{value:7,level:1,base:7,max:22}]};
const filled=context.window.DNStoredArtifacts.backfillItem(legacy);
assert.equal(filled.rows[0].level,undefined,'unlock state alone cannot establish an upgrade level');
assert.equal(filled.rows[1].level,null);
assert.equal(filled.rows[2].level,1,'locked rows start at level 1');
assert.equal(filled.rows[2].base,6);assert.equal(filled.rows[2].max,15);
assert.equal(filled.rows[3].base,6);assert.equal(filled.rows[3].max,15);
assert.equal(filled.rows[4].max,22,'existing endpoints are preserved');
assert.equal(legacy.rows[0].level,undefined,'migration does not mutate its input');
assert.equal(JSON.stringify(context.window.DNStoredArtifacts.backfillItem(filled)),JSON.stringify(filled),'backfill is repeatable');
console.log('Missing unlocked levels and deterministic positive/negative ranges backfill passed.');
const correct=rows=>context.window.DNStoredArtifacts.backfillItem({hall:'main',type:'Weapon',rows}).rows;
let corrected=correct([{value:13,level:3},{value:13,level:8},{value:13,level:1,unlocked:true,base:13,max:22,rangeSource:'inferred-level'},{value:-5,unlocked:true},{value:20}]);
assert.equal(corrected[0].base,11);assert.equal(corrected[0].max,20);
assert.equal(corrected[1].base,6);assert.equal(corrected[1].max,15);
assert.equal(corrected[2].base,null);assert.equal(corrected[2].level,null);
assert.equal(JSON.stringify(corrected[2].rangeCandidates.map(r=>[r.base,r.level])),'[[6,8],[11,3]]');
assert.equal(corrected[3].base,-1);assert.equal(corrected[3].level,5);assert.equal(corrected[3].max,-10);
assert.equal(corrected[4].base,11);assert.equal(corrected[4].level,10);
corrected=correct([{value:11,level:1,unlocked:true}]);
assert.equal(corrected[0].base,null,'previous forced level 1 cannot disambiguate an upgraded perk');
console.log('Main base tiers, recorded levels, unique inference, and ambiguous prior backfills passed.');
const store=context.window.DNStoredArtifacts;
const craft=(row,hall='main',type='Weapon')=>store.craftingTier(row,{hall,type});
for(const [hall,values] of [['main',[1,6,11]],['war',[1,3,6]]])for(const [index,colour] of ['neutral','green','blue'].entries())for(const sign of [1,-1]) {
  const row=craft({name:'Damage',known:true,value:sign*values[index],colour},hall);
  assert.equal(row.tier,['white','green','blue'][index]);assert.equal(row.tierSource,'colour');
  assert.equal(row.base,sign*values[index]);assert.equal(row.max,sign*(values[index]+9));
  assert.equal(row.value,sign*values[index],'current value unchanged');
}
assert.equal(craft({value:6,colour:null}).tierSource,'starting-percentage');
assert.equal(craft({value:null,colour:'blue'}).tier,'blue','colour alone records tier without inventing current percentage');
assert.equal(craft({value:null,colour:'blue'}).value,null);
assert.equal(craft({value:1,colour:'blue'}).tier,null,'contradictory colour and percentage stay unknown');
assert.equal(craft({value:1,colour:'blue'}).tierConflict,true);
assert.equal(craft({value:6,colour:'blue',inferred:true}).tier,'blue','inferred values are not independent numeric evidence');
assert.equal(craft({value:6,colour:'blue',tierSource:'manual'}).tier,'green','manual correction overrides captured colour');
const correctedInference=store.backfillItem({hall:'war',type:'Weapon',rows:[{name:'Damage',value:6,colour:'white',level:1,levelSource:'crafting',tier:'blue',tierSource:'manual',inferred:true,valueSource:'tier-level'}]});
assert.equal(correctedInference.rows[0].tier,'blue','manually confirmed inferred crafting values retain their tier on reload');
assert.equal(correctedInference.rows[0].base,6);assert.equal(correctedInference.rows[0].max,15);
assert.equal(JSON.stringify(store.backfillItem(correctedInference)),JSON.stringify(correctedInference));
assert.equal(craft({value:11,colour:'blue'},'main','Legendary').tier,null);
assert.equal(craft({value:5,colour:'blue'},'war','War Mythical').tier,null);
let tiers=correct([{value:13,level:3,levelSource:'ocr',colour:'green'},{value:13,level:8,levelSource:'ocr',colour:'blue'},{value:13,level:null,colour:'blue'},{value:20,level:null}]);
assert.equal(tiers[0].tier,'blue','storage ignores green text');assert.equal(tiers[0].tierSource,'percentage-level');
assert.equal(tiers[1].tier,'green');assert.equal(tiers[1].base,6);
assert.equal(tiers[2].tier,null,'ambiguous current percentage cannot establish a tier');assert.equal(tiers[2].tierSource,null);
assert.equal(tiers[3].tier,'blue');assert.equal(tiers[3].tierSource,'unique-percentage');
const war=store.backfillItem({hall:'war',type:'War Equipment',rows:[{value:-8,level:3,levelSource:'ocr'},{value:7,level:null}]}).rows;
assert.equal(war[0].tier,'blue');assert.equal(war[0].base,-6);assert.equal(war[0].max,-15);
assert.equal(war[1].tier,null,'overlapping War ranges need a level');
for(const [hall,value,level,base,max] of [['main',15,10,6,15],['war',6,4,3,12],['war',12,7,6,15],['war',15,10,6,15]])for(const sign of [1,-1]) {
  const confirmed=store.backfillItem({hall,type:'Weapon',rows:[{
    name:'Damage',value:sign*value,level,levelSource:'ocr',unlocked:true,tierConflict:true,
  }]}).rows[0];
  assert.equal(confirmed.tierConflict,false,'valid base and level must not block keeping');
  assert.equal(confirmed.base,sign*base);assert.equal(confirmed.max,sign*max);
  assert.equal(confirmed.level,level);
  assert.equal(confirmed.tier,hall==='war' && base===6?'blue':'green');
  assert.equal(JSON.stringify(store.backfillItem({hall,type:'Weapon',rows:[confirmed]}).rows[0]),JSON.stringify(confirmed));
  const imported=merge([],[{id:'six-'+hall+sign,name:'Confirmed six',hall,type:'Weapon',reviewed:true,rows:[confirmed]}]);
  assert.equal(imported.added,1,'confirmed 6% roll imports into collection');
  assert.equal(imported.blocked,0);
}
const warCategory=store.backfillItem({hall:'main',type:'War Weapon',rows:[{value:6,level:4,levelSource:'manual'}]}).rows[0];
assert.equal(warCategory.base,3,'explicit War category uses War tiers even with stale Main context');
assert.equal(warCategory.max,12);assert.equal(warCategory.tierConflict,false);
const mismatch=correct([{value:1,level:3,levelSource:'ocr'}])[0];
assert.equal(mismatch.tier,null);assert.equal(mismatch.tierConflict,true);assert.equal(mismatch.level,3,'do not replace conflicting OCR evidence with a unique guessed level');
const fixed=correct([{...mismatch,level:1,levelSource:'manual'}])[0];assert.equal(fixed.tier,'white');assert.equal(fixed.tierConflict,false);
const manual=correct([{value:13,level:3,base:11,max:20,rangeSource:'manual'}])[0];assert.equal(manual.tier,'blue');assert.equal(manual.tierSource,'manual');
const manualConflict=correct([{value:13,level:8,base:11,max:20,rangeSource:'manual'}])[0];assert.equal(manualConflict.tier,null);assert.equal(manualConflict.tierConflict,true,'manual tier and numeric evidence must agree');
for(const type of ['Legendary','Mythical','War Legendary','War Mythical']) {
  const special=store.backfillItem({hall:type.startsWith('War')?'war':'main',type,rows:[{value:13,level:3,levelSource:'ocr'}]}).rows[0];
  assert.equal(special.tier,null);assert.equal(special.tierSource,null);assert.equal(special.base,11,'special items retain their numeric range');
}
const logged=store.backfillItem({hall:'war',rows:[{value:-3,colour:'green',levelSource:'crafting'}]});
assert.equal(logged.rows[0].tier,'green');assert.equal(logged.rows[0].tierSource,'colour');
assert.equal(JSON.stringify(store.backfillItem(logged)),JSON.stringify(logged),'craft log tier migration is idempotent');
const imported=merge([],[{...item(),rows:item().rows.map(row=>({...row,tier:null}))}]).collection[0];
assert.equal(imported.rows[0].tier,'blue');assert.equal(imported.rows[0].tierSource,'percentage-level','collection imports keep tier provenance');
assert.equal(JSON.stringify(store.backfillItem({hall:'main',type:'Weapon',rows:tiers})),JSON.stringify({hall:'main',type:'Weapon',rows:tiers}),'storage tier migration is idempotent');
for(const sign of [1,-1]) {
  const numeric=correct([{name:'Damage',value:sign*10,level:3,levelSource:'ocr',tierConflict:true}])[0];
  assert.equal(numeric.base,sign*8);assert.equal(numeric.max,sign*17);
  assert.equal(numeric.tier,null);assert.equal(numeric.tierConflict,false,'known value and level resolve a range without an ordinary tier');
  assert.equal(JSON.stringify(correct([numeric])[0]),JSON.stringify(numeric),'tierless ranges survive reload');
  assert.equal(passivePlan([],{...item(),rows:[numeric]}).action,'added');
}
assert.equal(merge([],[{...item(),rows:[{name:'Damage',value:10,level:1,levelSource:'ocr'}]}]).added,1,'numeric storage ranges do not require an ordinary starting tier');
console.log('Main/War colour tiers, numeric storage tiers, provenance, ambiguity, conflicts, manual correction, special items and persisted backfill passed.');
