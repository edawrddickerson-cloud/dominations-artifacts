/* Worker readiness must include initial parameters while cleanup still owns
 * workers whose initialization fails or is stopped. No real OCR claims. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function setup(){
  const creation=deferred(),parameters=deferred(),entered=deferred();let terminated=0;
  const worker={setParameters(){entered.resolve();return parameters.promise;},async terminate(){terminated++;}};
  const context={URL,window:{Tesseract:{createWorker:()=>creation.promise}},document:{baseURI:'http://localhost/ui/scanner.html'}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('ui/scanner-recognition.js','utf8'),context);
  const engine=context.window.DNScannerRecognition.create({names:[],canonPerk:value=>value});
  return {creation,parameters,entered,worker,engine,terminated:()=>terminated};
}
async function main(){
  let h=await setup(),warming=h.engine.warm({fast:true});
  assert.equal(h.engine.isWarm({fast:true}),false);
  h.creation.resolve(h.worker);await h.entered.promise;
  assert.equal(h.engine.isWarm({fast:true}),false,'created workers are not ready until initial parameters complete');
  h.parameters.resolve();await warming;
  assert.equal(h.engine.isWarm({fast:true}),true);assert.equal(h.engine.isWarm(),false,'readiness is specific to the model');
  await h.engine.close();assert.equal(h.engine.isWarm({fast:true}),false);assert.equal(h.terminated(),1);

  h=await setup();warming=h.engine.warm({fast:true});h.creation.resolve(h.worker);await h.entered.promise;
  h.parameters.reject(Error('initial parameters failed'));await assert.rejects(warming,/initial parameters failed/);
  assert.equal(h.engine.isWarm({fast:true}),false);await h.engine.close();assert.equal(h.terminated(),1,'failed initialization retains ownership for cleanup');

  h=await setup();warming=h.engine.warm({fast:true});await h.engine.close();h.creation.resolve(h.worker);
  await assert.rejects(warming,/Recognition stopped/);assert.equal(h.terminated(),1,'a worker created after Stop is terminated');

  h=await setup();warming=h.engine.warm({fast:true});h.creation.resolve(h.worker);await h.entered.promise;
  await h.engine.close();h.parameters.resolve();await warming;
  assert.equal(h.engine.isWarm({fast:true}),false);assert.equal(h.terminated(),1,'Stop during initial parameters retains cleanup ownership');
  console.log('Worker readiness: model-specific initialization, failed parameters and Stop cleanup passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
