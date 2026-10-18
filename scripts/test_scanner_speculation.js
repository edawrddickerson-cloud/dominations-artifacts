/* Production controller with deferred OCR: early work never changes visible
 * scores or logs without exact settled-input validation. No real OCR claims. */
'use strict';
const assert=require('node:assert/strict');
const {harness,parsed,flush}=require('./test_scanner_reading.js');
async function setup(options={}){
  const h=await harness({speculation:true,...options}),source=h.canvas();source.width=320;source.height=160;
  h.e.auto.checked=true;
  const fields={template:h.window.DNScannerRegions.defaults(2),panel:{x:0,y:0,width:1,height:1},source};
  const feed=(state={})=>h.reader.update(source,{session:1,current:true,live:true,fields,...state});
  return {...h,source,fields,feed};
}
async function main(){
  let h=await setup();h.feed();
  assert.equal(h.jobs.length,1,'live OCR starts before the settling delay');
  assert.equal(h.jobs[0].options.fieldReuse,null,'unvalidated work cannot populate verified encounter evidence');
  h.advance(100);h.feed();h.jobs[0].resolve(parsed());await flush();
  assert.equal(h.collector.summary().itemCount,0,'fast OCR is not logged before settling');
  assert.equal(h.comparisons.some(x=>x.confirmed),false,'fast OCR cannot publish an early score');
  h.advance(119);await flush();assert.equal(h.collector.summary().itemCount,0);
  h.advance(1);await flush();assert.equal(h.collector.summary().itemCount,1);
  assert.equal(h.comparisons.at(-1).confirmed,true,'matching fresh pixels approve the same result after the full gate');
  assert.equal(h.jobs.length,1,'matching input does not repeat OCR');

  h=await setup();const paints=[];h.window.requestAnimationFrame=callback=>paints.push(callback);
  h.feed();h.e.correct.innerHTML='Previous correction controls';h.advance(100);h.feed();h.jobs[0].resolve(parsed());await flush();h.advance(120);await flush();
  assert.match(h.e.result.innerHTML,/Heavy Tank Damage/,'score rows publish before correction controls');
  assert.doesNotMatch(h.e.correct.innerHTML,/Heavy Tank Damage/);assert.equal(h.e.accept.disabled,true);
  assert.equal(h.e.correct.innerHTML,'','previous-item controls are removed before deferring the new form');
  paints.shift()();assert.doesNotMatch(h.e.correct.innerHTML,/Heavy Tank Damage/,'the first paint belongs to the score');
  paints.shift()();assert.match(h.e.correct.innerHTML,/Heavy Tank Damage/);assert.equal(h.e.accept.disabled,false);

  h=await setup();const stalePaints=[];h.window.requestAnimationFrame=callback=>stalePaints.push(callback);
  h.feed();h.advance(100);h.feed();h.jobs[0].resolve(parsed('Bomber Damage'));await flush();h.advance(120);await flush();
  h.reader.reset();while(stalePaints.length)stalePaints.shift()();
  assert.doesNotMatch(h.e.correct.innerHTML,/Bomber Damage/,'deferred details cannot restore a stopped capture');

  h=await setup();h.feed();h.advance(100);h.source.pixel=1;h.feed();
  h.jobs[0].resolve(parsed('Bomber Damage'));await flush();h.advance(120);await flush();
  assert.equal(h.collector.summary().itemCount,0,'a tiny change below the coarse signature threshold discards the early result');
  assert.doesNotMatch(h.e.result.innerHTML,/Bomber Damage/);
  h.advance(0);assert.equal(h.jobs.length,2,'changed exact input uses an ordinary settled read');
  assert.ok(h.jobs[1].options.fieldReuse,'ordinary retry restores normal evidence caching');
  h.jobs[1].resolve(parsed());await flush();assert.equal(h.collector.summary().itemCount,1);
  assert.match(h.e.result.innerHTML,/Heavy Tank Damage/);

  h=await setup();h.feed();h.advance(100);h.source.pixel=1;h.feed();h.advance(120);
  assert.equal(h.jobs[0].options.isCurrent(),false,'a rejected read stops at the next bounded OCR checkpoint');
  assert.equal(h.jobs.length,1,'the settled retry never overlaps the rejected worker job');
  h.jobs[0].reject(Error('Recognition superseded or stopped'));await flush();h.advance(0);
  assert.equal(h.jobs.length,2);assert.equal(h.engines[0].closed,0,'pixel rejection keeps the warm worker');

  h=await setup();h.feed();h.jobs[0].resolve(parsed());await flush();h.advance(220);await flush();
  assert.equal(h.collector.summary().itemCount,0,'an aging frame without another live sample is not validation');

  h=await setup();h.feed();h.advance(100);h.feed();h.setVisible(false);h.jobs[0].resolve(parsed());await flush();h.advance(120);await flush();
  assert.equal(h.collector.summary().itemCount,0,'hidden captures cannot approve early work');

  h=await setup();h.feed();h.advance(100);h.feed({current:false});h.jobs[0].resolve(parsed());await flush();h.advance(220);await flush();
  assert.equal(h.collector.summary().itemCount,0,'pausing capture releases a pending validation without publishing');

  h=await setup();h.feed();h.advance(100);h.source.pixel=255;h.feed();
  const old=h.jobs[0];assert.equal(old.options.isCurrent(),false);
  old.resolve(parsed('Bomber Damage'));await flush();
  assert.equal(h.collector.summary().itemCount,0,'a different artifact cannot receive the old score');
  assert.equal(h.jobs.length,2,'replacement speculation begins only after the old worker is released');
  h.advance(100);h.feed();h.jobs[1].resolve(parsed());await flush();h.advance(120);await flush();
  assert.equal(h.collector.summary().itemCount,1);
  assert.doesNotMatch(h.e.result.innerHTML,/Bomber Damage/);

  h=await setup();h.feed();const stopped=h.jobs[0];h.reader.reset();stopped.resolve(parsed());await flush();h.advance(1000);await flush();
  assert.equal(h.collector.summary().itemCount,0,'Stop cannot leave a validation promise able to publish');
  h.feed({session:2});assert.equal(h.jobs.length,2,'a new session can start after stopping pending validation');

  h=await setup();h.feed();h.advance(100);h.fields.template.rows[0].name.width-=.01;h.feed();
  h.jobs[0].resolve(parsed());await flush();assert.equal(h.collector.summary().itemCount,0,'changed field geometry invalidates pending early work');

  h=await setup();h.feed();h.advance(100);h.feed();
  const originalKey=h.window.DNStoredArtifacts.collectionKey;h.window.DNStoredArtifacts.collectionKey=()=>originalKey()+'-other';
  h.jobs[0].resolve(parsed());await flush();h.advance(120);await flush();
  assert.equal(h.collector.summary().itemCount,0,'a profile change cannot validate another profile\'s early result');

  h=await setup();h.feed();h.advance(100);h.feed();h.advance(120);await flush();
  const approvedKey=h.window.DNStoredArtifacts.collectionKey;h.window.DNStoredArtifacts.collectionKey=()=>approvedKey()+'-after-gate';
  h.jobs[0].resolve(parsed());await flush();
  assert.equal(h.collector.summary().itemCount,0,'a profile change after validation still prevents publishing');

  h=await setup();h.feed();h.advance(100);h.feed();h.advance(120);await flush();
  h.setVisible(false);h.jobs[0].resolve(parsed());await flush();
  assert.equal(h.collector.summary().itemCount,0,'hiding after validation still prevents publishing');

  h=await setup();h.feed({live:false});assert.equal(h.jobs.length,0,'still images retain ordinary reading');
  h.advance(220);assert.equal(h.jobs.length,1);assert.ok(h.jobs[0].options.fieldReuse);

  h=await setup({workerWarm:false});h.feed();h.advance(100);h.feed();await flush();
  assert.equal(h.jobs.length,0,'cold worker startup is not burdened with speculative input preparation');
  h.advance(120);assert.equal(h.jobs.length,1,'cold capture still starts its ordinary read at the original gate');
  assert.ok(h.jobs[0].options.fieldReuse);

  h=await setup({workerWarm:false});h.feed();h.advance(100);h.feed();h.engines[0].finishWarm();await flush();
  assert.equal(h.jobs.length,1,'a worker ready within the settling window can overlap the remaining wait');
  assert.equal(h.jobs[0].options.fieldReuse,null);

  const stored=await harness({storage:true,speculation:true});stored.e.auto.checked=true;stored.e.layout.value='storage';
  const storedSource=stored.canvas();storedSource.width=320;storedSource.height=160;
  stored.reader.update(storedSource,{session:1,current:true,live:true});
  stored.advance(699);assert.equal(stored.jobs.length,0,'storage keeps its full settling interval');
  stored.advance(1);assert.equal(stored.jobs.length,1,'storage uses its existing ordinary read path');

  const F=h.window.DNScannerFieldRecognition,full=h.canvas();full.width=640;full.height=320;full.pixel=7;
  const fields={source:full,panel:{x:.25,y:.25,width:.5,height:.5},template:h.window.DNScannerRegions.defaults(2,true)};
  fields.template.hall={x:.03,y:.04,width:.55,height:.2};
  fields.template.rows[0].dice={x:.9,y:.3,width:.02,height:.03};
  const witness=()=>F.witness(h.source,fields,null,'context');
  const first=witness();assert.ok(first);assert.equal(F.sameWitness(first,witness()),true);
  assert.equal(first.images.some(x=>x.id==='category'),true);assert.equal(first.images.some(x=>x.id==='hall'),true);assert.equal(first.images.some(x=>x.id==='0-dice'),true);
  full.pixel=8;assert.equal(F.sameWitness(first,witness()),false,'non-temporal metadata pixels participate in validation');
  full.pixel=7;const alpha=witness();alpha.images[0].pixels[alpha.images[0].pixels.length-1]^=1;
  assert.equal(F.sameWitness(first,alpha),false,'every RGBA byte is compared, including alpha');
  assert.equal(F.witness(h.source,fields,null,'context',1),null,'oversized witnesses decline early reading');
  assert.equal(F.sameWitness(first,F.witness(h.source,fields,null,'other-context')),false);
  console.log('Speculative OCR: full settling gate, exact pixels/metadata, bounded memory, stale/profile/geometry rejection, worker ownership and normal retry passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
