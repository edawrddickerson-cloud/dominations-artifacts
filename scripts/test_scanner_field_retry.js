/* Exercise selective retry evidence with production parsing and physical atlas
 * positioning. Real OCR accuracy is covered by the paired screenshot audit. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function canvas(pixel=0,width=100,height=24){
  const item={pixel,width,height,draws:[],getContext(){return {
    fillRect(){},putImageData(){},drawImage(source,...args){item.pixel=source.pixel;item.draws.push({source,args});},
    getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([pixel,pixel,pixel,255],i);return {data};},
  };}};return item;
}
const context={window:{},document:{createElement:()=>canvas()}};
vm.createContext(context);
for(const file of ['scanner-recognition.js','scanner-field-recognition.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const F=context.window.DNScannerFieldRecognition;
function output(lines){return {data:{text:lines.map(line=>line.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}};}
async function run({weak=false,contradiction=false,valueConflict=false,missingSign=false,missingLine=false,automaticCategory=false,sourceReadable=true,percentage='+1%',guidePercentage=percentage,warGuide=false,separate=false}={}){
  const crops={};for(let i=0;i<5;i++){crops[i+'-name']=canvas(i+1,warGuide?180:100);crops[i+'-percentage']=separate?canvas(i+1,180):crops[i+'-name'];crops[i+'-star']=canvas();}
  crops.category=canvas(30);crops['hall-banner']=canvas();
  const categorySource=canvas(40),snapshot={crops,sharedPercentages:Array(5).fill(!separate),automaticCategory},settings={};
  const calls=[],reuse={entries:new Map(),byteLimit:8*1024*1024};
  const worker={async setParameters(value){Object.assign(settings,value);}};
  const readView=async(input,options={})=>{
    calls.push({pixels:input.pixel,rectangle:options.rectangle,atlas:settings.tessedit_pageseg_mode==='6'?input.draws.map(cell=>cell.source.pixel):null});
    if(input.pixel>=30)return output([{text:input.pixel===40?(sourceReadable?'Armor':'???'):'Weapon',confidence:95}]);
    if(settings.tessedit_pageseg_mode==='6'){
      const initial=input.draws.length===5;
      return output(input.draws.flatMap(({source,args})=>{
        if(!initial && missingLine)return [];
        const name=!initial && contradiction?'Catapult Hitpoints':'Catapult Damage';
        const numeric=warGuide && separate && settings.tessedit_char_whitelist==='+-0123456789.,%';
        return [{text:numeric?percentage:name+' '+(warGuide?'+19':missingSign?'1%':!initial && valueConflict?'+6%':percentage),confidence:numeric?0:initial && weak && source.pixel===1?50:95,bbox:{y0:args[1]+12,y1:args[1]+source.height-12}}];
      }));
    }
    if(warGuide && settings.tessedit_char_whitelist===''){
      if(options.rectangle)return output([{text:'Catapult Damage',confidence:95}]);
      const words=['Catapult','Damage',guidePercentage].map((text,i)=>({text,confidence:95,bbox:{x0:16+i*50,y0:12,x1:56+i*50,y1:32}}));
      return output([{text:'Catapult Damage '+guidePercentage,confidence:95,words}]);
    }
    return output([{text:settings.tessedit_char_whitelist==='+-0123456789.,%'?(missingSign?'1%':percentage):'Catapult Damage '+guidePercentage,confidence:95}]);
  };
  const R=context.window.DNScannerRecognition,colour=R.hallColour,rows=R.rowColours;
  if(warGuide){R.hallColour=()=> 'war';R.rowColours=()=>Array(5).fill('neutral');}
  try{
    const result=await F.recognize(snapshot,{worker,readView,names:['Catapult Damage','Catapult Hitpoints'],canonPerk:value=>value,hall:'main',isClosed:()=>false,ocrCalls:()=>calls.length,reuse,categorySource});
    return {result,calls,reuse};
  }finally{R.hallColour=colour;R.rowColours=rows;}
}
async function main(){
  let read=await run();
  assert.equal(read.result.valid,true);assert.equal(read.calls.filter(call=>call.atlas).length,1,'clear rows need no extra OCR batch');
  read=await run({weak:true,percentage:'+1.1%',guidePercentage:'+11%'});
  assert.equal(read.result.valid,true,'decimal punctuation does not create a false independent-crop conflict');
  assert(read.result.rows.every(row=>row.value===11 && !row.conflict),'field reads use the same whole-number normalization');
  read=await run({weak:true});
  assert.equal(read.result.valid,true);assert.equal(read.result.rows[0].confidence,95);
  assert.deepEqual(read.calls.filter(call=>call.atlas).map(call=>call.atlas),[[1,2,3,4,5],[1]],'only the unclear physical row is enlarged');
  assert.equal(read.result.rows.every(row=>row.name==='Catapult Damage' && row.value===1),true);
  assert.equal(read.reuse.verified.size,4,'a recovered weak batch is not stored as verified initial evidence');
  read=await run({weak:true,contradiction:true});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].conflict,true,'a stronger alternative identity cannot erase a contradiction');
  assert.equal(read.result.rows.slice(1).every(row=>!row.conflict),true,'memoized parsing cannot spread one row conflict to duplicate physical stats');
  read=await run({weak:true,valueConflict:true});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].conflict,true,'a different signed value remains a conflict');
  assert.equal(read.result.rows[0].value,1,'a conflicting enlarged percentage cannot silently overwrite the first reading');
  read=await run({weak:true,missingLine:true});
  assert.equal(read.result.valid,true,'a missing enlarged OCR line falls through to focused recovery');
  assert.equal(read.result.rows[0].name,'Catapult Damage');
  read=await run({missingSign:true});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows.every(row=>row.value===null),true,'enlargement cannot invent a missing sign');
  read=await run({automaticCategory:true});
  assert.equal(read.result.artifact.type,'Armor');assert.equal(read.calls.filter(call=>call.pixels>=30).length,1,'automatic category reads the tight line first');
  read=await run();
  assert.equal(read.result.artifact.type,'Weapon','explicit category calibration retains priority over the automatic line');
  read=await run({automaticCategory:true,sourceReadable:false});
  assert.equal(read.result.artifact.type,'Weapon','unreadable automatic text falls back to the calibrated pixels');
  assert.equal(read.calls.filter(call=>call.pixels>=30).length,2,'an unsuccessful automatic crop is not read a second time');
  read=await run({warGuide:true});
  assert.equal(read.result.valid,true,'a signed suffix misread inside a shared name field can be separated using actual guide bounds');
  assert(read.result.rows.every(row=>row.name==='Catapult Damage' && row.value===1 && !row.inferred),'both fields require their own direct OCR');
  assert(read.calls.some(call=>call.rectangle?.left===0),'the name is read from its own rectangle');
  assert.equal(read.reuse.verified.size,0,'recovered guide evidence cannot become verified first-atlas cache entries');
  assert(read.calls.some(call=>call.rectangle?.left>106),'the numeric crop excludes the preceding name while retaining the guide-located sign');
  read=await run({warGuide:true,separate:true});
  assert.equal(read.result.valid,true,'separate wide name and percentage boxes retain independent guide recovery');
  assert(read.result.rows.every(row=>row.name==='Catapult Damage' && row.value===1 && row.confidence>=80));
  read=await run({warGuide:true,missingSign:true});
  assert.equal(read.result.valid,false);assert(read.result.rows.every(row=>row.value===null),'a guide sign cannot supply a missing sign in numeric OCR');
  read=await run({warGuide:true,guidePercentage:'+6%'});
  assert.equal(read.result.valid,false);assert(read.result.rows.every(row=>row.conflict),'contradictory guide and direct numeric values remain conflicts');
  console.log('Selective retry recovery, physical row isolation, conflicts, missing signs, cache provenance and category priority passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
