/* Authority: User-approved crafting calibration risks, October 2026.
 * Ownership: Deterministic VM tests only. Real pixels are tested in Chrome.
 * Invariants: Geometry must fit; signs/duplicates/conflicts stay explicit;
 * field snapshots freeze before async OCR and are released after processing. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const canvases=[];
function canvas() {
  const item={width:0,height:0,pixel:0,draws:[],getContext(){return {fillRect(){},drawImage(input,...args){item.pixel=input.pixel;item.draws.push({input,args});},putImageData(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);const rgb=Array.isArray(item.pixel)?item.pixel:[item.pixel || 0,item.pixel || 0,item.pixel || 0];for(let i=0;i<data.length;i+=4){data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;}return {data};}};}};
  canvases.push(item);return item;
}
const store=new Map();
const context={window:{},URL,document:{baseURI:'http://localhost/ui/scanner.html',createElement:canvas},localStorage:{getItem:k=>store.get(k) || null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
vm.createContext(context);
for(const file of ['scanner-core.js','scanner-regions.js','scanner-name-catalog.js','scanner-recognition.js','scanner-field-recognition.js'])vm.runInContext(fs.readFileSync(path.join(root,'ui',file),'utf8'),context);
const G=context.window.DNScannerRegions,R=context.window.DNScannerRecognition,F=context.window.DNScannerFieldRecognition;
const plain=value=>JSON.parse(JSON.stringify(value));
const source=canvas();source.width=1200;source.height=800;source.pixel=42;
const panel={x:.25,y:.25,width:.5,height:.375},template=G.defaults(2);
assert.equal(G.valid(template),true);
let resolved=G.resolve(template,panel,source);assert.equal(resolved.valid,true);
const moved={x:.1,y:.1,width:.75,height:.5625};
assert.equal(G.resolve(template,moved,source).valid,true,'translation and uniform resizing preserve calibration');
assert.equal(G.resolve(template,{...moved,width:.5},source).valid,false,'incompatible panel aspect rejected');
assert.equal(G.resolve(template,null,source).valid,false,'no fields without anchor');
assert.equal(G.resolve(template,panel,{width:1200,height:0}).valid,false);
const box=template.rows[2].name,absolute=G.toSource(box,panel),roundTrip=G.fromSource(absolute,panel);
for(const key of ['x','y','width','height'])assert.ok(Math.abs(box[key]-roundTrip[key])<1e-9);
assert.equal(G.toSource({x:-1,y:-1,width:.2,height:.2},panel),null,'external label clipping rejected');
const external=G.copy(template);external.category={x:-.2,y:-.2,width:.3,height:.1};
assert.equal(G.resolve(external,panel,source).valid,true,'category may sit above/outside panel');
assert.equal(G.resolve(external,{...panel,y:0},source).valid,false,'clipped external label invalidates fields');
for(const mutate of [t=>t.version=2,t=>t.rows.pop(),t=>t.rows[0].name.width=NaN,t=>t.rows[2].percentage.y=.9,t=>t.rows[3].star.y=t.rows[2].star.y,t=>t.rows[0].name.x=-.01,t=>t.rows[1].star=null]){
  const invalid=G.copy(template);mutate(invalid);assert.equal(G.valid(invalid),false);
}
assert.equal(G.save(template),true);assert.deepEqual(plain(G.load()),plain(template));
store.set(G.KEY,'{"version":1}');assert.equal(G.load(),null,'malformed persisted template ignored');
assert.equal(G.save(template,{setItem(){throw new Error('quota');}}),false);
assert.equal(G.reset({removeItem(){throw new Error('blocked');}}),false);
G.reset();assert.equal(G.load(),null);
const names=['Catapult Damage','Invading MRL Damage'];
for(const value of ['1%','--1%','+41%','+1','+1% extra','+NaN%'])assert.equal(R.parseFieldRow('Catapult Damage',value,names,v=>v).row.value,null,value+' is not a confirmed signed percentage');
assert.equal(R.parseFieldRow('Invading MRL Damage','-11%',names,v=>v).row.value,-11);
assert.equal(R.parseFieldRow('Invading MRL Damage','+11%',names,v=>v).valid,false,'polarity is still authoritative');
assert.equal(R.parseFieldRow('Catapult Damage +6%','+1%',names,v=>v).row.conflict,true,'overlap evidence cannot contradict value crop');
assert.equal(R.parseFieldRow('Catapult Damage','+1%',names,v=>v).valid,true);
function output(lines){return {data:{text:lines.map(line=>line.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}};}
function atlasOutput(input,texts){return output(input.draws.map(({input:cell,args},i)=>({text:texts[i],confidence:95,bbox:{y0:args[1]+12,y1:args[1]+cell.height-12}})));}
const cells=Array.from({length:5},(_,i)=>({top:i*100,bottom:i*100+80}));
const sparse=F.atlasEvidence(output([
  {text:'third',confidence:90,bbox:{y0:220,y1:250}},
  {text:'first',confidence:95,bbox:{y0:20,y1:50}},
  {text:'fifth',confidence:92,bbox:{y0:420,y1:450}},
]),cells);
assert.deepEqual(plain(sparse.map(row=>row.text)),['first','','third','','fifth'],'OCR omissions and output order never shift physical rows');
assert.equal(F.atlasEvidence(output([{text:'a',bbox:{y0:5,y1:20}},{text:'b',bbox:{y0:30,y1:50}}]),cells)[0].text,'','wrapped or duplicate lines require retry');
assert.equal(F.atlasEvidence(output([{text:'crossed',bbox:{y0:70,y1:120}}]),cells)[0].text,'','cross-cell lines cannot supply field evidence');
const suffixPixels=new Uint8ClampedArray(300*60*4);
const suffixInk=(x,y,width,height,colour=[10,60,16])=>{for(let row=y;row<y+height;row++)for(let column=x;column<x+width;column++)suffixPixels.set([...colour,255],(row*300+column)*4);};
suffixInk(0,0,300,60,[35,40,75]);suffixInk(10,20,100,18);suffixInk(155,25,9,9);suffixInk(170,20,11,18);suffixInk(190,20,15,18);
let suffix=F.percentageRect(suffixPixels,300,60);
assert(suffix && suffix.x>110 && suffix.x<=155 && suffix.x+suffix.width>=205,'numeric crop retains a spaced plus, digits and percent glyph without the name');
suffixPixels.fill(0);suffixInk(10,20,100,18);suffixInk(155,28,9,2);suffixInk(170,20,11,18);suffixInk(190,20,15,18);
suffix=F.percentageRect(suffixPixels,300,60);
assert(suffix && suffix.x<=155,'a short minus sign remains inside the source crop');
suffixPixels.fill(0);suffixInk(10,20,100,18);suffixInk(155,20,23,18);suffixInk(185,20,22,18);
suffix=F.percentageRect(suffixPixels,300,60);
assert(suffix && suffix.x>110 && suffix.x<=155 && suffix.x+suffix.width>=207,'a joined plus and first digit are retained before a separated final digit and percent glyph');
suffixPixels.fill(0);suffixInk(0,0,300,60,[20,80,100]);
assert.equal(F.percentageRect(suffixPixels,300,60),null,'uniform coloured backing is not a numeric text line');
suffixPixels.fill(0);suffixInk(10,10,100,12);suffixInk(150,10,40,12);suffixInk(10,35,100,12);suffixInk(150,35,40,12);
assert.equal(F.percentageRect(suffixPixels,300,60),null,'multiple physical text lines cannot be merged into a suffix');
suffixPixels.fill(0);suffixInk(10,20,100,18,[100,100,100]);suffixInk(150,20,40,18,[100,100,100]);
assert.equal(F.percentageRect(suffixPixels,300,60),null,'uncoloured fields keep the existing OCR guide path');
async function run(percentages) {
  const narrow=G.copy(template);narrow.rows.forEach(row=>{row.percentage.x=.78;row.percentage.width=.15;});
  const snapshot=F.snapshot({template:narrow,panel,source});assert.equal(snapshot.valid,true);
  source.pixel=99;
  assert.equal(snapshot.crops['0-name'].pixel,42,'all field pixels freeze before async recognition');
  const calls=[],settings=[];
  const nameTexts=percentages.map((_,i)=>i===1?'Invading MRL Damage':'Catapult Damage');
  const result=await F.recognize(snapshot,{names,canonPerk:v=>v,hall:'main',inferColours:false,isClosed:()=>false,ocrCalls:()=>calls.length,
    worker:{async setParameters(value){settings.push(value);}},readView:async input=>{calls.push(input);return calls.length<=2?atlasOutput(input,calls.length===1?nameTexts:percentages):output([{text:percentages[0],confidence:95}]);}});
  assert.equal(calls.length,percentages[0]==='1%'?3:2,'two batched fields, with only the missing signed percentage retried');
  assert.equal(settings.filter(s=>s.tessedit_char_whitelist==='+-0123456789.,%').length,percentages[0]==='1%'?2:1);
  assert.equal(result.rows.length,5);assert.equal(result.rows[2].name,result.rows[4].name,'duplicate rows keep their positions');
  assert.equal(result.rows[1].name,'Invading MRL Damage');
  snapshot.release();assert.equal(snapshot.crops['0-name'].width,0);
  assert.ok(calls.every(input=>input.width===0),'preprocessed views cleaned up');
  source.pixel=42;return result;
}
(async()=>{
  let result=await run(['+1%','-11%','+1%','+6%','+1%']);assert.equal(result.valid,true);assert.equal(result.rows[1].value,-11);
  result=await run(['1%','-11%','+1%','+6%','+1%']);assert.equal(result.valid,false);assert.equal(result.rows[0].value,null,'missing plus is never fabricated');
  for(const retryValue of ['1%','+6%']) {
    const retryTemplate=G.copy(template);retryTemplate.rows.forEach(row=>{row.percentage.x=.78;row.percentage.width=.15;});
    const retry=F.snapshot({template:retryTemplate,panel,source});let retryCalls=0;
    const retained=await F.recognize(retry,{names,canonPerk:v=>v,hall:'main',inferColours:false,isClosed:()=>false,ocrCalls:()=>retryCalls,
      worker:{async setParameters(){}},readView:async input=>{
        retryCalls++;
        if(retryCalls<=2){const value=atlasOutput(input,Array(5).fill(retryCalls===1?'Catapult Damage':'+1%'));value.data.blocks[0].paragraphs[0].lines[0].confidence=50;return value;}
        return output([{text:retryCalls===3?'unreadable symbols':retryValue,confidence:95}]);
      }});
    assert.equal(retained.rows[0].name,'Catapult Damage','an unreadable retry retains the observed known name');
    assert.equal(retained.valid,false,'retaining earlier evidence never suppresses review');
    if(retryValue==='1%'){
      assert.equal(retained.rows[0].value,1,'a retry missing its sign cannot erase the earlier signed percentage');
      assert.equal(retained.rows[0].confidence,50,'the earlier value retains its weak confidence');
    }else assert.equal(retained.rows[0].conflict,true,'disagreeing signed values remain a conflict even when the retry name is unreadable');
    retry.release();
  }
  const metadataTemplate=G.copy(template);metadataTemplate.rows.forEach(row=>{row.percentage.x=.78;row.percentage.width=.15;});
  const metadata=F.snapshot({template:metadataTemplate,panel,source});
  metadata.crops.category=canvas();metadata.crops.category.width=120;metadata.crops.category.height=30;metadata.crops.category.pixel=[40,210,50];
  metadata.crops.hall=canvas();metadata.crops.hall.width=20;metadata.crops.hall.height=20;metadata.crops.hall.pixel=[15,50,150];
  let calls=0;
  const texts=['unreadable icon','Equipment'];
  const recovered=await F.recognize(metadata,{names,canonPerk:v=>v,hall:'main',inferColours:false,isClosed:()=>false,ocrCalls:()=>calls,
    worker:{async setParameters(){}},readView:async input=>{calls++;return calls<=2?atlasOutput(input,Array(5).fill(calls===1?'Catapult Damage':'+1%')):output([{text:texts.shift(),confidence:95}]);}});
  assert.equal(recovered.artifact.type,'Equipment','failed green category OCR retries with normal contrast');
  assert.equal(recovered.hall,'war','blue calibrated patch overrides the previous Main selection');
  assert.equal(recovered.hallSource,'hall-colour');
  assert.equal(calls,4,'two field batches plus two category attempts; hall colour needs no OCR call');metadata.release();
  const invalid=G.copy(template);invalid.rows[0].name.x=-1;
  assert.equal(F.snapshot({template:invalid,panel,source}).valid,false);
  const temporal=canvas();temporal.width=600;temporal.height=300;temporal.pixel=17;
  const snapshot=F.snapshot({template,panel,source,panelSource:temporal});
  assert.equal(snapshot.crops['0-name'].pixel,17,'calibrated fields use the median panel snapshot');snapshot.release();
  const originalSnapshot=F.snapshot,originalRecognize=F.recognize;let released=0;
  const workerModels=[],terminated=[];
  F.snapshot=()=>({valid:true,release(){released++;}});
  context.window.Tesseract={async createWorker(language,oem,options){workerModels.push(options.langPath);return {async setParameters(){},async terminate(){terminated.push(options.langPath);},async recognize(input){
    const lines=Array.from({length:5},(_,i)=>({text:'Catapult Damage +1%',confidence:95,bbox:{y0:(i+.3)*input.height/5,y1:(i+.7)*input.height/5}}));
    return {data:{text:lines.map(line=>line.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}};
  }};}};
  try {
    for(const kind of ['metadata','field']) {
      F.recognize=async()=>({rows:Array.from({length:5},()=>({name:'Catapult Damage',value:1,known:true,hasPercent:true,...(kind==='field'?{conflict:true}:{})})),artifact:{type:'Equipment'},hall:'war',hallSource:'hall-colour',warnings:['Calibrated evidence conflicts.'],valid:false,metadataConflict:kind==='metadata',unlocked:{count:null,states:Array(5).fill(null)},observations:[]});
      const engine=R.create({names,canonPerk:v=>v});
      const result=await engine.recognize(source,{fields:{},layout:'panel'});
      assert.equal(result.recognitionPath,'calibrated-fields+standard-fallback');
      assert.equal(result.valid,false,'a valid standard read cannot erase '+kind+' conflicts');
      assert.equal(result.hall,'war','standard fallback retains the calibrated banner colour');
      assert.equal(result.hallSource,'hall-colour');
      assert.equal(result.artifact.type,'Equipment','standard fallback cannot lose the calibrated category');
      assert.match(result.warnings.join(' '),/conflicts/);await engine.close();
    }
    assert.equal(released,2,'field snapshots released after fallback');
    assert.deepEqual(workerModels,['http://localhost/ui/vendor/tesseract/lang-fast/','http://localhost/ui/vendor/tesseract/lang/','http://localhost/ui/vendor/tesseract/lang-fast/','http://localhost/ui/vendor/tesseract/lang/'],'calibrated fields use the fast model and difficult fallback retains the original model');
    assert.deepEqual(terminated,workerModels,'closing each engine terminates both models');
    const warm=R.create({names,canonPerk:v=>v}),beforeWarm=workerModels.length;
    await Promise.all([warm.warm({fast:true}),warm.warm({fast:true})]);
    assert.equal(workerModels.length,beforeWarm+1,'concurrent warm calls share one model initialization');
    await warm.close();assert.equal(terminated.length,workerModels.length);
    const stopped=R.create({names,canonPerk:v=>v});await stopped.close();
    await assert.rejects(stopped.recognize(source,{fields:{}}),/stopped/i);
    assert.equal(released,2,'already stopped recognition never allocates field snapshots');
    let finishInitialization;
    context.window.Tesseract.createWorker=()=>new Promise(resolve=>{finishInitialization=resolve;});
    const initializing=R.create({names,canonPerk:v=>v});
    const interrupted=initializing.recognize(source,{fields:{}});
    await initializing.close();
    finishInitialization({async terminate(){}});
    await assert.rejects(interrupted,/stopped/i);
    assert.equal(released,3,'field snapshots released when recognition stops during initialization');
  }finally {F.snapshot=originalSnapshot;F.recognize=originalRecognize;}
  console.log('Scanner field geometry, persistence, independent row association, signs, conflicts, frozen crops and temporal input passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
