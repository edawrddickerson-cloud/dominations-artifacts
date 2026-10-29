/* Targeted fresh-craft numeric retries use production field parsing and tier
 * annotation. OCR text is injected; these fixtures do not measure live accuracy. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function canvas(pixel=0,width=100,height=24){
  const item={pixel,width,height,draws:[],getContext(){return {
    fillRect(){},putImageData(){},drawImage(source,...args){item.pixel=source.pixel;item.draws.push({source,args});},
    getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([pixel,pixel,pixel,255],i);return {data};},
  };}};return item;
}
function output(lines){return {data:{text:lines.map(line=>line.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}};}
const context={window:{DN:{expectedPerkSign:()=>-1}},document:{createElement:()=>canvas()}};
vm.createContext(context);
for(const file of ['scanner-recognition.js','stored-artifacts.js','scanner-field-recognition.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const R=context.window.DNScannerRecognition,F=context.window.DNScannerFieldRecognition;
async function run({name='Invading APC Damage',initial='-32%',confidence=95,retries=['-3%','-3%'],nameSuffix=false,hall='war',type='Armor',autoFit=true,cancel=false}={}){
  const crops={};for(let i=0;i<5;i++){crops[i+'-name']=canvas(i+1);crops[i+'-percentage']=canvas(i+11);crops[i+'-star']=canvas();}
  crops.category=canvas(30);crops['hall-banner']=canvas();
  const snapshot={crops,sharedPercentages:Array(5).fill(false)},settings={},calls=[],reuse={entries:new Map(),byteLimit:8*1024*1024};
  const worker={async setParameters(value){Object.assign(settings,value);}};
  let stopped=false,numericPhase=false,numericCount=0;
  const readView=async(input,options={})=>{
    const numeric=settings.tessedit_char_whitelist==='+-0123456789.,%';
    if(numeric && settings.tessedit_pageseg_mode==='13')numericPhase=true;
    const targeted=numericPhase && numeric && input.pixel===11;
    calls.push({pixel:input.pixel,psm:settings.tessedit_pageseg_mode,numeric,targeted,rectangle:options.rectangle,width:input.width,height:input.height});
    if(targeted){const text=retries[Math.min(numericCount++,retries.length-1)];if(cancel)stopped=true;return output([{text,confidence:95}]);}
    if(input.pixel===30)return output([{text:type,confidence:95}]);
    if(settings.tessedit_pageseg_mode==='6')return output(input.draws.map(({source,args})=>({
      text:numeric?(source.pixel===11?initial:'-1%'):name+(nameSuffix?' '+initial:''),
      confidence:numeric && source.pixel===11?confidence:95,bbox:{y0:args[1]+12,y1:args[1]+source.height-12},
    })));
    return output([{text:numeric?(input.pixel===11?initial:'-1%'):name+(nameSuffix?' '+initial:''),confidence:numeric && input.pixel===11?confidence:95}]);
  };
  const oldHall=R.hallColour,oldColours=R.rowColours;
  R.hallColour=()=>hall;R.rowColours=()=>['green','neutral','neutral','neutral','neutral'];
  try{
    const result=await F.recognize(snapshot,{worker,readView,names:[name],canonPerk:value=>value,isClosed:()=>stopped,ocrCalls:()=>calls.length,reuse,autoFit});
    return {result,calls,reuse};
  }catch(error){error.retryCalls=calls;error.retryReuse=reuse;throw error;}finally{R.hallColour=oldHall;R.rowColours=oldColours;}
}
(async()=>{
  for(const [name,initial] of [['Invading APC Damage','-32%'],['Invading Paratrooper Hitpoints','-34%'],['Invading Attack Helicopter Damage','-35%']]){
    const read=await run({name,initial});
    assert.equal(read.calls.filter(call=>call.targeted).length,2,'readable tier conflict gets exactly two numeric retries');
    assert.equal(read.result.rows[0].value,Number(initial.slice(0,-1)),'credible original digits are not truncated');
    assert.equal(read.result.rows[0].conflict,true);assert.equal(read.result.valid,false,'credible signed contradictions never confirm');
    assert(read.calls.filter(call=>call.targeted).every(call=>!call.rectangle),'numeric retry cannot use a potentially clipped OCR guide rectangle');
    assert.equal(read.reuse.verified.size,8,'a disputed row never enters verified crop evidence');
    const fields=read.result.observations.at(-1).fieldReads[0];
    assert.equal(fields.filter(field=>field.pass.startsWith('tier-percentage-')).length,2);
    assert(fields.some(field=>field.percentage?.text===initial),'all original digits remain in raw evidence');
    assert(fields.filter(field=>field.percentage?.numericRetry).every(field=>field.percentage.evidenceSource==='original-percentage-crop'));
  }
  let read=await run({confidence:50});
  assert.equal(read.result.rows[0].value,-3,'two strong explicit signed views can recover a weak original');
  assert.equal(read.result.rows[0].numericRetry,true);assert.equal(read.result.rows[0].inferred,undefined,'direct retry provenance is separate from colour inference');
  assert.equal(read.result.valid,true);assert.equal(read.reuse.verified.size,8,'recovery never promotes the rejected initial batch into reusable truth');
  read=await run({confidence:50,retries:['3%','3%']});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].value,-32,'missing retry signs cannot supply a replacement value');
  read=await run({confidence:50,retries:['+3%','+3%']});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].value,-32,'retry cannot repair the polarity');
  read=await run({confidence:50,retries:['-32%','-32%']});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].value,-32,'the same impossible result repeated on one frozen crop cannot establish truth');
  read=await run({confidence:50,retries:['-3%','-6%']});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].conflict,true,'two credible but different legal retries remain conflicting');
  read=await run({confidence:50,nameSuffix:true});
  assert.equal(read.result.valid,false);assert.equal(read.result.rows[0].value,-32,'a strong adjacent signed suffix remains contradictory evidence');
  read=await run({initial:'+0%',confidence:50});
  assert.equal(read.result.rows[0].value,-3);assert.equal(read.result.valid,true,'a weak zero can recover only through explicit signed OCR');
  read=await run({initial:'+0%',confidence:95});
  assert.equal(read.result.rows[0].value,0);assert.equal(read.result.valid,false,'a credible zero is retained for review');
  read=await run({initial:'-32%',confidence:50,retries:['-0.3%','-0.3%']});
  assert.equal(read.result.valid,false,'leading-zero decimal joins remain forbidden');
  read=await run({initial:'-32%',confidence:50,hall:'main',retries:['-1.1%','-1,1%']});
  assert.equal(read.result.rows[0].value,-11);assert.equal(read.result.rows[0].percentageCorrected,true,'existing whole-number join normalization remains authoritative');
  assert.equal(read.result.valid,true);
  for(const options of [{autoFit:false},{hall:null},{type:'Legendary'}]){
    read=await run(options);assert.equal(read.calls.filter(call=>call.targeted).length,0,'speculative/unknown Hall/special category never gets crafting-tier retries');
  }
  read=await run({initial:'-3%'});assert.equal(read.calls.filter(call=>call.targeted).length,0,'clear legal fields keep their original latency');
  await assert.rejects(()=>run({cancel:true}),error=>{
    assert.match(error.message,/stopped/);
    assert.equal(error.retryCalls.filter(call=>call.targeted).length,1,'cancelled work stops before its second retry');
    assert.equal(error.retryReuse.verified,undefined,'cancelled numeric work cannot publish verified crop evidence');
    return true;
  });
  console.log('Targeted numeric tier retries: exact signs/digits, weak recovery, strong contradictions, zero, decimal joins, bounded work, cache exclusion and cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
