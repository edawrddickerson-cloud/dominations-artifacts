/* Category corrections must reread the current image with the selected layout. */
const assert=require('node:assert/strict');
const {harness,parsed,flush}=require('./test_scanner_reading.js');
const types=['Weapon','Legendary','Mythical','War Legendary','War Mythical'];
const rowsForType=type=>/Mythical$/.test(type)?6:5;
const result=type=>({...parsed(),expectedRows:rowsForType(type),hall:type.startsWith('War ')?'war':'main',
  artifact:{name:'Category fixture',type},rows:Array.from({length:rowsForType(type)},()=>({...parsed().rows[0],hasPercent:true,level:1,unlocked:true}))});
async function main(){
  const h=await harness({storage:true}),{reader,e,window,jobs,keepStates}=h;
  Object.assign(window.DNStorageRecognition,{types,rowsForType});
  e.layout.value='storage';
  const frame=h.canvas();reader.update(frame,{session:1,current:true});
  e.read.fire('click');jobs.at(-1).resolve(result('Legendary'));await flush();
  reader.setStorageType('Mythical');
  assert.equal(e.rows.value,'6','correcting to Mythical immediately selects six rows');
  assert.equal(jobs.length,2,'correction starts OCR even with automatic reading disabled');
  assert.equal(jobs.at(-1).options.manualType,'Mythical');
  assert.equal(jobs.at(-1).options.expectedRows,6);
  assert.equal(keepStates.at(-1).reviewable,false,'wrong-layout observations cannot be saved during rereading');
  assert.equal(keepStates.at(-1).result.rows.length,0,'all wrong-layout crops are discarded');
  jobs.at(-1).resolve(result('Mythical'));await flush();
  assert.equal(keepStates.at(-1).result.rows.length,6);
  assert.equal(keepStates.at(-1).manualCorrection,true);
  assert.equal((e.correct.innerHTML.match(/scanner-perk-name/g)||[]).length,6);
  // A correction made during OCR cancels that result and waits for the worker.
  e.read.fire('click');const stale=jobs.at(-1);
  reader.setStorageType('War Legendary');
  assert.equal(jobs.length,3,'the existing worker is never used concurrently');
  stale.resolve(result('Mythical'));await flush();
  assert.equal(jobs.length,4,'worker release starts the pending corrected read');
  assert.equal(jobs.at(-1).options.manualType,'War Legendary');
  assert.equal(jobs.at(-1).options.hall,'war','manual Hall wins over conflicting pixel inspection');
  assert.equal(jobs.at(-1).options.expectedRows,5);
  assert.equal(keepStates.at(-1).reviewable,false,'cancelled six-row results cannot restore old rows');
  jobs.at(-1).resolve(result('War Legendary'));await flush();
  assert.equal(keepStates.at(-1).result.rows.length,5);
  e.read.fire('click');assert.equal(jobs.at(-1).options.manualType,'War Legendary','manual retry retains the correction');
  jobs.at(-1).resolve(result('War Legendary'));await flush();
  frame.pixel=240;reader.update(frame,{session:1,current:true});e.read.fire('click');
  assert.equal(jobs.at(-1).options.manualType,null,'a new artifact cannot inherit the manual category');
  jobs.at(-1).resolve(result('Weapon'));await flush();
  reader.reset();reader.update(frame,{session:2,current:true});e.read.fire('click');
  assert.equal(jobs.at(-1).options.manualType,null,'capture reset clears the category override');
  jobs.at(-1).resolve(result('Weapon'));await flush();
  console.log('Storage category correction: automatic reread, five/six rows, stale worker rejection, Hall, retry and encounter reset passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
