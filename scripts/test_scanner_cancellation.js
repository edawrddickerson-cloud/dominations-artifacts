const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const deferred=()=>{let resolve;return {promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)};};
async function main(){
  let current=true,calls=0,workers=0,released=0,pending;
  const worker={setParameters:async()=>{},recognize:()=>{calls++;pending=deferred();return pending.promise;},terminate:async()=>{}};
  const context={URL,window:{Tesseract:{createWorker:async()=>{workers++;return worker;}},DNScannerFieldRecognition:{
    snapshot:()=>({valid:true,release:()=>released++}),
    recognize:async(snapshot,{readView})=>{
      await readView({});
      await readView({}); // Recovery must not run once the first pass is obsolete.
      return {valid:true,unlocked:{count:2},rows:[]};
    },
  }},document:{baseURI:'http://localhost/ui/scanner.html'}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('ui/scanner-recognition.js','utf8'),context);
  const engine=context.window.DNScannerRecognition.create({names:[],canonPerk:name=>name});
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  const obsolete=engine.recognize({}, {fields:{},isCurrent:()=>current});
  await flush();assert.equal(calls,1);
  current=false;pending.resolve({});
  await assert.rejects(obsolete,/superseded/);
  assert.equal(calls,1,'obsolete read stops before any recovery pass');assert.equal(released,1,'frozen field crops are released');
  current=true;
  const replacement=engine.recognize({}, {fields:{},isCurrent:()=>current});
  await flush();assert.equal(calls,2);pending.resolve({});
  await flush();assert.equal(calls,3);pending.resolve({});
  await replacement;
  assert.equal(workers,1,'replacement reuses the warm worker');assert.equal(released,2);
  current=false;
  await assert.rejects(engine.recognize({}, {fields:{},isCurrent:()=>current}),/superseded/);
  assert.equal(calls,3,'already obsolete jobs never start OCR');
  await engine.close();
  console.log('Obsolete OCR stops after its active pass, releases crops and reuses the warm worker for the current artifact.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
