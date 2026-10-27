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
vm.runInContext(fs.readFileSync('ui/scanner-core.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/scanner-regions.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/storage-field-regions.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/scanner-name-catalog.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/scanner-recognition.js','utf8'),context);
vm.runInContext(fs.readFileSync('ui/storage-recognition.js','utf8'),context);
async function scan(missing,{known=true,priorName='Positive',priorHall='war',percentage=null,retryPercentage=null,levelText=null,autoFit=false,fitPercentage=null,type='War Weapon',expectedRows=5,calibrationRows=null,manualType=null,categoryConfidence=95,categoryRetries=[]}={}) {
  const category=context.window.DNStorageRecognition.categoryType,retries=[];
  if(!manualType && !category(type))for(let i=0;i<4;i++) {
    const retry=categoryRetries[i] || {text:'',confidence:95};retries.push(retry);
    if(category(retry.text) && retry.confidence>=60)break;
  }
  const queue=['Example',type,...retries];
  const selected=manualType || category(type) || retries.find(retry=>category(retry.text) && retry.confidence>=60)?.text || '';
  const count=/^(War )?Mythical$/.test(selected.replace(/\s+/g,' ').trim())?6:5;
  for(let i=0;i<count;i++) {
    queue.push('Positive',percentage ?? (missing==='value'?'':missing==='level'?'+7%':'+12%'));
    if(retryPercentage!==null)queue.push(retryPercentage);
    if(missing==='value')queue.push(''); // Numeric retry before inference.
    queue.push(levelText ?? (missing==='level'?'':missing==='value'?'3/10':'7/10'));
    if(missing==='level')for(let attempt=0;attempt<5;attempt++)queue.push('');
    if(fitPercentage!==null)queue.push(fitPercentage,fitPercentage);
  }
  let calls=0;
  const worker={setParameters:async()=>{},recognize:async()=>{
    assert(queue.length,'unexpected OCR call');
    const evidence=queue.shift(),text=typeof evidence==='string'?evidence:evidence.text;
    const confidence=calls++===1?categoryConfidence:typeof evidence==='object'?evidence.confidence:95;
    return {data:{text,blocks:[{paragraphs:[{lines:[{confidence}]}]}]}};
  }};
  const knownTiers=known?Array.from({length:5},()=>({name:priorName,hall:priorHall,
    tier:missing==='level'?'green':'blue',tierSource:'percentage-level'})):[];
  const fields=calibrationRows?{template:context.window.DNStorageRegions.defaults(1,calibrationRows)}:null;
  const result=await context.window.DNStorageRecognition.recognize(canvas(),{
    autoFit,worker,names:['Positive'],canonPerk:value=>value,expectedRows,layout:'storage',hall:'war',knownTiers,fields,manualType,
  });
  assert.equal(queue.length,0);
  return result;
}
async function testOCRFallback() {
  const category=context.window.DNStorageRecognition.categoryType;
  assert.equal(category('Legendary','war'),'War Legendary','current blue ribbon supplies a clipped War prefix');
  assert.equal(category('Legendary'),'Legendary','without pixel evidence the selected Hall cannot supply War');
  assert.equal(category('WarLegendary','war'),'War Legendary','joined exact words retain their category');
  for(const text of ['War Legend','Legendry','War','Legendary Mythical','War Legendary bonus'])assert.equal(category(text,'war'),null,'incomplete or extra category words cannot be guessed');
  assert.equal(category('War Legendary','main'),null,'contradictory current Hall pixels do not identify a category');
  for(const [type,categoryRetries,expected] of [
    ['egend:',[{text:'War Legendary',confidence:85}],'War Legendary'],
    ['', [{text:'War',confidence:95},{text:'War Mythical',confidence:91}],'War Mythical'],
    ['', [{text:'War Legendary',confidence:20},{text:'War Legendary',confidence:65}],'War Legendary'],
  ]) {
    const result=await scan('tier',{type,categoryRetries,known:false});
    assert.equal(result.artifact.type,expected,'bounded independent banner views recover exact categories');
    assert.equal(result.rows.length,/Mythical$/.test(expected)?6:5);
    assert.equal(result.artifact.rawType,type,'original clipped OCR text remains available');
    assert.equal(result.artifact.categoryEvidence.length,categoryRetries.length+1);
  }
  const unread=await scan('tier',{type:'???',known:false});
  assert.equal(unread.artifact.categoryEvidence.length,5,'an unread category uses at most four retries including adaptive gold');
  assert.equal(unread.artifact.categoryUnclear,true);
  for(const type of ['War Mythical','  War\n Mythical  ','Mythical']) {
    const result=await scan('tier',{type,categoryConfidence:60,known:false});
    assert.equal(result.rows.length,6,'an explicit Mythical banner cannot silently become five-row Legendary when confidence is low');
    assert.equal(result.artifact.type,type.replace(/\s+/g,' ').trim());
    assert(result.artifact.metadataWarnings.includes('Check the artifact category.'));
  }
  for(const [type,manualType,expected] of [['War Legendary','War Mythical',6],['War Mythical','War Legendary',5]]) {
    const result=await scan('tier',{type,manualType,known:false});
    assert.equal(result.rows.length,expected,'manual category controls OCR geometry instead of the conflicting banner');
    assert.equal(result.artifact.type,manualType);assert.equal(result.artifact.typeSource,'manual');
  }
  for(const type of ['Weapon','War Weapon','Legendary','War Legendary','???','Mythical','War Mythical']) {
    const expected=/^(War )?Mythical$/.test(type)?6:5;
    for(const requested of [5,6]) {
      const result=await scan('tier',{type,expectedRows:requested,known:false});
      assert.equal(result.expectedRows,expected,type+' determines the row count before stat OCR');
      assert.equal(result.rows.length,expected,'a stale row selector cannot change '+type+' geometry');
      assert.equal(result.artifact.categoryUnclear,type==='???','an unread category cannot establish a Legendary edition from default geometry');
    }
  }
  for(const [type,calibrationRows,expected] of [['War Weapon',6,5],['War Legendary',6,5],['War Mythical',5,6]]) {
    const result=await scan('tier',{type,expectedRows:calibrationRows,calibrationRows,known:false});
    assert.equal(result.rows.length,expected,'wrong-count saved boxes cannot override '+type);
    assert.equal(result.recognitionPath,'storage-fields');assert(result.calibrationReason);
  }
  const originalFactory=context.document.createElement;
  context.document.createElement=()=>({width:0,height:0,getContext(){return {drawImage(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([255,190,0,255],i);return {data};}};}});
  const detector=context.window.DNStorageRecognition;
  assert.equal(detector.inspect({width:200,height:200}).expectedRows,5,'gold decorations cannot invent a sixth row');
  assert.equal(detector.inspect({width:200,height:200},{type:'War Legendary'}).expectedRows,5);
  assert.equal(detector.inspect({width:200,height:200},{type:'War Mythical'}).expectedRows,6);
  context.document.createElement=originalFactory;
  const fitted=await scan('value',{autoFit:true,fitPercentage:'+8%'});
  assert(fitted.rows.every(row=>row.value===8 && !row.inferred),'direct expanded OCR is accepted before tier inference');
  assert(fitted.evidence.every(row=>row.amount.evidenceSource==='expanded-field' && row.amount.autoFit.steps===2),'storage records bounded automatic-fit provenance');
  for(const percentage of ['+1.3%','+1,3%','+ 1 . 3 %']) {
    const corrected=await scan('tier',{known:false,percentage,levelText:'8/10'});
    assert(corrected.rows.every(row=>row.value===13 && row.level===8 && row.tier==='blue'),'storage reads whole 13 percent from stray decimal punctuation');
    assert(corrected.rows.every(row=>row.percentageCorrected && row.raw.includes(percentage)),'storage retains the original corrected OCR evidence');
    assert(corrected.evidence.every(entry=>entry.amount.text===percentage),'raw amount crop is preserved');
  }
  const retried=await scan('tier',{known:false,percentage:'+12.5%',retryPercentage:'+13%',levelText:'8/10'});
  assert(retried.rows.every(row=>row.value===13),'invalid digit joins trigger an independent glyph retry instead of keeping a decimal');
  assert(retried.evidence.every(entry=>entry.amount.alternative.text==='+12.5%'),'retry retains the rejected numeric evidence');
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
