const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
const data=JSON.parse(read('data/artifacts.json')),overrides=JSON.parse(read('data/raw/user_verified_artifact_overrides.json'));
assert.equal(read('data/artifacts.json'),read('ui/data/artifacts.json'));
assert.equal(new Set(data.map(r=>r.artifact_id)).size,data.length);
for(const entry of overrides.entries){
  const row=data.find(r=>r.artifact_id===entry.artifact_id);assert(row,entry.artifact_id);
  for(const [field,value] of Object.entries(entry.values))assert.equal(row[field],value,entry.artifact_id+' '+field);
  if(entry.values.grade){assert.equal(row.perk_count,entry.values.grade==='Mythical'?'6':'5');assert.equal(row.cost,entry.values.grade==='Mythical'?'1000':'300');assert.equal(row.cost_currency,'Legendary Tokens');}
}
const context={window:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};vm.createContext(context);
vm.runInContext(read('ui/data/army_catalog.js'),context);
vm.runInContext(read('ui/shared.js'),context);
const DN=context.window.DN;
assert.equal(DN.formatPerkValue('Mercenary Camp Deploys Spartans when Destroyed',1),'+1');
assert.equal(DN.formatPerkValue('APC Deploys Marines On Death',1),'+1');
assert.equal(DN.formatPerkValue('Castle spawns Sword Saints when Destroyed',2),'+2');
assert.equal(DN.formatPerkValue('Bazooka Damage',13),'+13%');
assert.equal(DN.formatPerkValue('Invading Recon Scan Duration',-10),'-10%');
assert.equal(DN.effectivePerkRange({name:'Mercenary Camp Deploys Spartans when Destroyed',base:1,max:10}).max,1);
assert.equal(DN.effectivePerkRange({name:'Castle spawns Sword Saints when Destroyed',base:2,max:11}).max,2);
console.log('Confirmed additions/corrections, unique IDs, served data parity, count formatting and fixed count ranges passed.');
