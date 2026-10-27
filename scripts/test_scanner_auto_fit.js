/* Bounded geometry, agreement, strict glyph evidence and cancellation. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/scanner-recognition.js','utf8'),context);
const R=context.window.DNScannerRecognition;
const box={x:.4,y:.3,width:.1,height:.1},bounds={x:.2,y:.25,width:.6,height:.2};
const accept=evidence=>R.parsePercentage(evidence.text).value;
async function run(texts,{remaining=24,isClosed=()=>false}={}) {
  const regions=[],budget={remaining};let count=0;
  const result=await R.autoFitField({box,bounds,budget,isClosed,accept,read:async region=>{
    regions.push(region);const value=texts[Math.min(count++,texts.length-1)];
    return typeof value==='string'?{text:value,confidence:95}:value;
  }});
  return {result,regions,budget};
}
(async()=>{
  let read=await run(['1%','+1%','+1%']);
  assert.equal(read.result.autoFit.steps,3,'missing signs cannot establish agreement');
  assert.equal(read.result.text,'+1%');
  assert(Math.abs(read.regions[0].width-box.width*1.1)<1e-9);
  for(const region of read.regions){assert(region.x>=bounds.x && region.y>=bounds.y);assert(region.x+region.width<=bounds.x+bounds.width+1e-9);assert(region.y+region.height<=bounds.y+bounds.height+1e-9);}
  read=await run(['+1%','+6%','+6%']);assert.equal(read.result,null,'contradictory strong crops cannot choose a value');
  read=await run(['+1%',{text:'???',confidence:30},'+1%']);assert.equal(read.result.text,'+1%','weak intermediate views cannot erase good evidence');
  read=await run(['1%']);assert.equal(read.result,null);assert.equal(read.regions.length,8,'eight expansions maximum per field');
  read=await run(['1%'],{remaining:3});assert.equal(read.regions.length,3);assert.equal(read.budget.remaining,0,'one scan shares a bounded budget');
  read=await run(['+1%'],{remaining:0});assert.equal(read.regions.length,0,'budget exhaustion schedules no work');
  let cancelled=false,calls=0;
  await assert.rejects(()=>R.autoFitField({box,bounds,budget:{remaining:24},isClosed:()=>cancelled,accept,read:async()=>{calls++;cancelled=true;return {text:'+1%',confidence:99};}}),/stopped/);
  assert.equal(calls,1,'cancelled results never complete a fit');
  const original=JSON.stringify(box);await run(['+1%']);assert.equal(JSON.stringify(box),original,'geometry proposals never mutate calibration');
  console.log('Automatic field fit bounds, 10% growth, strict signs, agreement, conflicts, budget, cancellation and immutable geometry passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
