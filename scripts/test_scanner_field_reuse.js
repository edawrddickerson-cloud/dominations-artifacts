/* Exact OCR evidence reuse is opt-in and scoped to one live encounter.
 * Exercise production field parsing/atlas packing and the engine transaction,
 * including partial fallback, byte changes, conflicts and cancellation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function canvas(pixel=0,width=100,height=20,variation=0) {
  const item={pixel,width,height,variation,draws:[],getContext(){return {
    fillRect(){},putImageData(){},drawImage(input,...args){item.pixel=input.pixel;item.variation=input.variation || 0;item.draws.push({input,args});},
    getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4),rgb=Array.isArray(item.pixel)?item.pixel:[item.pixel,item.pixel,item.pixel];
      for(let i=0;i<data.length;i+=4)data.set([...rgb,255],i);
      if(item.variation && data.length>83)data[83]-=item.variation;
      return {data};},
  };}};
  return item;
}
function output(lines){return {data:{text:lines.map(line=>line.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}};}
const context={URL,Uint8ClampedArray,window:{},document:{baseURI:'http://localhost/ui/scanner.html',createElement:()=>canvas()}};
vm.createContext(context);
for(const file of ['scanner-core.js','scanner-recognition.js','scanner-field-recognition.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const R=context.window.DNScannerRecognition,F=context.window.DNScannerFieldRecognition;
let frames=0,released=0,geometry='geometry-a',namePixel=10,percentagePixel=20,variation=0,partial=false,current=true,hallPixel=0,foregroundRows=false;
F.snapshot=()=>{
  frames++;const crops={};
  for(let i=0;i<5;i++) {
    crops[i+'-name']=canvas(i===2?namePixel:10,100,20,i===2?variation:0);
    crops[i+'-percentage']=canvas(partial && i===4?99:i===2?percentagePixel:20);
    crops[i+'-star']=canvas();
  }
  crops.category=canvas([40,210,50],120,30);crops['hall-banner']=canvas(hallPixel);
  return {valid:true,crops,reuseGeometry:geometry,foregroundRows,sharedPercentages:Array(5).fill(false),release(){released++;for(const crop of Object.values(crops))crop.width=crop.height=0;}};
};
let calls=0,settings={},gate=null,failNext=false,standardCalls=0,categoryCalls=0,lastAtlasSizes=[],standardConflict=false,weakFirstBatch=false;
const worker={async setParameters(value){Object.assign(settings,value);},async terminate(){},async recognize(input){
  calls++;
  if(failNext){failNext=false;throw Error('worker failure');}
  if(gate){const waiting=gate;gate=null;await waiting;}
  if(Array.isArray(input.pixel)){categoryCalls++;return output([{text:'Weapon',confidence:95}]);}
  if(input.pixel===50){standardCalls++;return output(Array.from({length:5},(_,i)=>({text:(standardConflict && i===0?'Catapult Hitpoints':'Catapult Damage')+' +1%',confidence:95,bbox:{y0:(i+.2)*input.height/5,y1:(i+.8)*input.height/5}})));}
  const numeric=settings.tessedit_char_whitelist==='+-0123456789.,%';
  const text=cell=>numeric?(cell.pixel===99?'1%':cell.pixel===21?'+6%':'+1%'):cell.pixel===11?'Catapult Hitpoints':'Catapult Damage';
  if(settings.tessedit_pageseg_mode==='6') {
    lastAtlasSizes.push(input.draws.length);
    return output(input.draws.map(({input:cell,args},i)=>({text:text(cell),confidence:weakFirstBatch && !numeric && i===0?50:95,bbox:{y0:args[1]+12,y1:args[1]+cell.height-12}})));
  }
  return output([{text:text(input),confidence:95}]);
}};
context.window.Tesseract={createWorker:async()=>worker};
const engine=R.create({names:['Catapult Damage','Catapult Hitpoints'],canonPerk:value=>value});
const source=canvas(50,300,100),scope={epoch:'artifact-1',profile:'fast'},options=()=>({fields:{},fieldReuse:scope,isCurrent:()=>current});
async function read(extra={}){const before=calls;const result=await engine.recognize(source,{...options(),...extra});return {...result,delta:calls-before};}
async function main(){
  let result=await read();assert.equal(result.valid,true);assert.equal(result.delta,3);assert.equal(result.reusedFields,0);
  result=await read();assert.equal(result.delta,1);assert.equal(result.reusedFields,10);assert.equal(categoryCalls,2,'category evidence is always fresh');
  assert.equal(result.observations[0].reusedFields,10,'observations identify replayed evidence');
  assert.equal(result.observations.at(-1).fieldReads[0][0].name.evidenceSource,'same-encounter-identical-pixels');
  // The uniform fake canvas cannot model glyph edges. Supply neutral row
  // classification while exercising the real Hall-dependent view selection.
  const rowColours=R.rowColours;R.rowColours=()=>Array(5).fill('neutral');
  try{
    hallPixel=[20,70,160];result=await read();
    assert.equal(result.reusedFields,0,'changed Hall preprocessing cannot reuse identical glyph pixels through another view');
    hallPixel=0;result=await read();assert.equal(result.reusedFields,0,'restoring the original view also requires its own verified evidence');
    result=await read();assert.equal(result.reusedFields,10);
    hallPixel=[20,70,160];foregroundRows=true;R.rowColours=()=>Array(5).fill('green');
    result=await read();assert.equal(result.reusedFields,0);
    result=await read();assert.equal(result.reusedFields,10);
    R.rowColours=()=>Array(5).fill('blue');result=await read();
    assert.equal(result.reusedFields,0,'changing the selected foreground view cannot reuse identical original pixels');
  }finally{R.rowColours=rowColours;hallPixel=0;foregroundRows=false;}
  await read();
  namePixel=11;lastAtlasSizes=[];result=await read();
  assert.equal(result.rows[2].name,'Catapult Hitpoints');assert.equal(result.reusedFields,9);assert.equal(result.delta,2);
  assert.deepEqual(lastAtlasSizes,[1],'only the changed physical name cell enters the atlas');
  percentagePixel=21;lastAtlasSizes=[];result=await read();
  assert.equal(result.rows[2].value,6);assert.equal(result.reusedFields,9);assert.deepEqual(lastAtlasSizes,[1]);
  variation=1;result=await read();assert.equal(result.reusedFields,9,'one alpha byte change cannot reuse visually identical pixels');
  geometry='geometry-b';result=await read();assert.equal(result.reusedFields,0,'geometry changes invalidate every field');
  result=await read({fieldReuse:{...scope,profile:'other'}});assert.equal(result.reusedFields,0,'OCR profile changes invalidate every field');
  result=await read();assert.equal(result.reusedFields,0,'returning to a profile cannot resurrect an older encounter');
  result=await read({fieldReuse:null});assert.equal(result.reusedFields,undefined,'isolated calls do not opt into reuse');
  result=await read();assert.equal(result.reusedFields,0,'an isolated call clears the previous encounter');
  scope.epoch='artifact-2';result=await read();assert.equal(result.reusedFields,0,'identical pixels in a new encounter are read again');
  let resume;gate=new Promise(resolve=>{resume=resolve;});const obsolete=read();
  for(let i=0;i<30;i++)await Promise.resolve();
  current=false;resume();await assert.rejects(obsolete,/superseded|stopped/);current=true;
  result=await read();assert.equal(result.reusedFields,0,'cancellation discards even previously committed encounter evidence');
  current=false;await assert.rejects(read(),/superseded|stopped/);current=true;
  result=await read();assert.equal(result.reusedFields,0,'an already obsolete request also invalidates its cached encounter');
  failNext=true;await assert.rejects(read(),/worker failure/);
  result=await read();assert.equal(result.reusedFields,0,'a worker failure invalidates the encounter cache');
  const freeze=F.snapshot;F.snapshot=()=>{throw Error('snapshot failure');};
  try{await assert.rejects(read(),/snapshot failure/);}finally{F.snapshot=freeze;}
  result=await read();assert.equal(result.reusedFields,0,'a synchronous snapshot failure also invalidates the encounter cache');
  // One unresolved field must not force four independently verified rows to
  // repeat their batch OCR. The full standard fallback still runs each time.
  namePixel=10;percentagePixel=20;variation=0;partial=true;scope.epoch='partial';
  const beforeFallback=standardCalls;result=await read();assert.equal(result.recognitionPath,'calibrated-fields+standard-fallback');
  result=await read();assert.equal(result.reusedFields,8);assert.equal(standardCalls,beforeFallback+2,'partial reuse never skips standard fallback');
  assert.equal(result.rows[4].value,1,'the fresh standard evidence can recover the missing percentage');
  scope.epoch='conflicting-fallback';standardConflict=true;
  result=await read();assert.equal(result.rows[0].conflict,true);assert.equal(result.valid,false);
  result=await read();assert.equal(result.reusedFields,6,'a fallback contradiction prevents both fields in that row from being reused');
  standardConflict=false;partial=false;weakFirstBatch=true;scope.epoch='recovered-weak-batch';
  result=await read();assert.equal(result.valid,true);assert.equal(result.rows[0].confidence,95);
  result=await read();assert.equal(result.reusedFields,8,'a successful independent retry does not turn weak initial batch evidence into reusable OCR');
  const capped=F.snapshot({}),limited={entries:new Map(),byteLimit:1};
  try{
    const uncached=await F.recognize(capped,{worker,readView:(...args)=>worker.recognize(...args),names:['Catapult Damage','Catapult Hitpoints'],canonPerk:value=>value,isClosed:()=>false,ocrCalls:()=>calls,reuse:limited});
    assert.equal(uncached.reusedFields,0);assert.equal(limited.verified.size,0,'evidence larger than the byte budget is processed normally without being retained');
  }finally{capped.release();}
  assert.equal(released,frames,'every frozen snapshot is released, including failed and canceled jobs');
  await engine.close();
  console.log('Exact scoped field reuse, selective atlas packing, fresh metadata/fallback, byte/geometry/profile invalidation and cancellation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
