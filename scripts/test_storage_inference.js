const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{DN:{expectedPerkSign:name=>name==='Negative'?-1:name==='Positive'?1:null}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/stored-artifacts.js','utf8'),context);
const store=context.window.DNStoredArtifacts;
for(const [hall,bases] of [['main',[1,6,11]],['war',[1,3,6]]]) {
  for(const [index,tier] of ['white','green','blue'].entries())for(let level=1;level<=10;level++)for(const sign of [1,-1]) {
    const value=sign*(bases[index]+level-1),name=sign===1?'Positive':'Negative';
    const input={name,known:true,value,level,levelSource:'ocr',tierEvidence:tier,unlocked:true};
    const resolve=row=>store.backfillItem({hall,type:'Weapon',rows:[row]}).rows[0];
    const missingValue=resolve({...input,value:null,hasPercent:false});
    assert.equal(missingValue.value,value);assert.equal(missingValue.valueSource,'tier-level');
    assert.equal(missingValue.level,level);assert.equal(missingValue.tier,tier);
    assert.equal(missingValue.base,sign*bases[index]);assert.equal(missingValue.max,sign*(bases[index]+9));
    const missingLevel=resolve({...input,level:null,levelSource:null});
    assert.equal(missingLevel.level,level);assert.equal(missingLevel.levelSource,'tier-percentage');
    assert.equal(missingLevel.tier,tier);assert.equal(missingLevel.value,value);
    const missingTier=resolve({...input,tierEvidence:null});
    assert.equal(missingTier.tier,tier);assert.equal(missingTier.level,level);assert.equal(missingTier.value,value);
    assert.equal(input.value,value,'inference must not mutate input');
  }
}
const resolve=row=>store.backfillItem({hall:'war',type:'Weapon',rows:[row]}).rows[0];
for(const [hall,bases] of [['main',[1,6,11]],['war',[1,3,6]]])for(const [index,tier] of ['white','green','blue'].entries())for(const sign of [1,-1]) {
  const base=bases[index],name=sign===1?'Positive':'Negative';
  const locked=store.backfillItem({hall,type:'Weapon',rows:[{name,known:true,value:sign*base,level:null,unlocked:false}]}).rows[0];
  assert.equal(locked.level,1);assert.equal(locked.levelSource,'locked-star');assert.equal(locked.tier,tier);
  assert.equal(locked.base,sign*base);assert.equal(locked.max,sign*(base+9));
  const missing=store.backfillItem({hall,type:'Weapon',rows:[{name,known:true,value:null,level:null,unlocked:false,tierEvidence:tier}]}).rows[0];
  assert.equal(missing.value,sign*base);assert.equal(missing.level,1);
  const badLevel=store.backfillItem({hall,type:'Weapon',rows:[{name,known:true,value:sign*base,level:7,unlocked:false,rangeSource:'inferred-level',base:99,max:108}]}).rows[0];
  assert.equal(badLevel.level,1);assert.equal(badLevel.observedLevel,7);assert.equal(badLevel.tier,tier);
}
for(const unlocked of [true,null])assert.equal(resolve({value:6,level:null,unlocked}).level,null,'unknown and unlocked stars do not assume level 1');
assert.equal(resolve({name:'Unknown sign',known:true,value:null,level:3,tierEvidence:'blue'}).value,null);
assert.equal(resolve({name:'Positive',known:true,value:7,level:null}).level,null,'ambiguous one-field reads stay unknown');
const accurate=resolve({value:12,level:7,levelSource:'ocr',tierEvidence:'green'});
assert.equal(accurate.value,12);assert.equal(accurate.level,7);assert.equal(accurate.tier,'blue','numeric pair beats colour evidence');
const conflicting=resolve({value:12,level:7,tier:'green',tierSource:'manual'});
assert.equal(conflicting.tierConflict,true,'contradictory manual tier stays flagged');
assert.equal(resolve({value:15,level:null,tierEvidence:'green'}).tierConflict,true,'inferred level outside 1–10 is rejected');
const special=store.backfillItem({hall:'war',type:'Legendary',rows:[{name:'Positive',known:true,value:null,level:3,tierEvidence:'blue'}]}).rows[0];
assert.equal(special.value,null,'ordinary tiers do not apply to special artifacts');
console.log('All three inference directions passed for 120 tier/level/sign combinations; ambiguity, signs, conflicts, and special artifacts passed.');

// Exercise the actual storage OCR adapter with missing fields, not just the range helper.
function canvas() {
  return {width:200,height:200,toDataURL:()=>'',getContext:()=>({
    drawImage(){},fillRect(){},putImageData(){},
    getImageData:(x,y,w,h)=>({data:w===30 && h===30?new Uint8ClampedArray(Array.from({length:w*h},()=>[255,190,0,255]).flat()):new Uint8ClampedArray(w*h*4)}),
  })};
}
context.document={createElement:canvas};
vm.runInContext(fs.readFileSync('ui/scanner-name-catalog.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/scanner-recognition.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/storage-recognition.js','utf8'),context);
async function scan(missing,{known=true,priorName='Positive',priorHall='war'}={}) {
  const queue=['Example','War Weapon'];
  for(let i=0;i<5;i++) {
    queue.push('Positive',missing==='value'?'':missing==='level'?'+7%':'+12%');
    if(missing==='value')queue.push(''); // Numeric retry before inference.
    queue.push(missing==='level'?'':missing==='value'?'3/10':'7/10');
    if(missing==='level')for(let attempt=0;attempt<5;attempt++)queue.push('');
  }
  const worker={setParameters:async()=>{},recognize:async()=>{
    assert(queue.length,'unexpected OCR call');
    const text=queue.shift();
    return {data:{text,blocks:[{paragraphs:[{lines:[{confidence:95}]}]}]}};
  }};
  const knownTiers=known?Array.from({length:5},()=>({name:priorName,hall:priorHall,
    tier:missing==='level'?'green':'blue',tierSource:'percentage-level'})):[];
  const result=await context.window.DNStorageRecognition.recognize(canvas(),{
    worker,names:['Positive'],canonPerk:value=>value,expectedRows:5,layout:'storage',hall:'war',knownTiers,
  });
  assert.equal(queue.length,0);
  return result;
}
async function testOCRFallback() {
  const value=await scan('value');
  for(const row of value.rows) {
    assert.equal(row.value,8);assert.equal(row.level,3);assert.equal(row.tier,'blue');
    assert.equal(row.hasPercent,true);assert.equal(row.inferred,true);
  }
  assert(value.warnings.some(w=>w.includes('value inferred')));
  const level=await scan('level');
  for(const row of level.rows)assert.equal(row.level,5);
  assert(level.warnings.some(w=>w.includes('level inferred')));
  const tier=await scan('tier',{known:false});
  for(const row of tier.rows)assert.equal(row.tier,'blue');
  const unknown=await scan('value',{known:false});
  assert(unknown.rows.every(row=>row.value===null),'missing percentage without a known tier stays unknown');
  for(const options of [{priorName:'Other stat'},{priorHall:'main'}]) {
    const mismatch=await scan('value',options);
    assert(mismatch.rows.every(row=>row.value===null),'another stat or hall cannot supply tier evidence');
  }
  console.log('Storage OCR adapter infers each missing field, labels inferred values, and rejects unrelated tier evidence.');
}
testOCRFallback().catch(error=>{console.error(error);process.exitCode=1;});
