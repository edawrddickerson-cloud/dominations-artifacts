/* Title-only regressions: reviewed identities, raw OCR, context and bounded retries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},URL,document:{baseURI:'http://localhost/ui/'}};vm.createContext(context);
for(const file of ['ui/artifact-title-catalog.js','ui/artifact-title-recognition.js','ui/scanner-recognition.js','ui/storage-recognition.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const T=context.window.DNArtifactTitleRecognition,R=context.window.DNScannerRecognition,S=context.window.DNStorageRecognition;
const war={hall:'war',type:'Armor'};
const vespa={hall:'war',type:'War Legendary'};
assert.equal(T.decide([{text:'Vespa 150 TAP',confidence:95}],vespa).name,'Vespa 150 TAP');
assert.equal(S.titleDecision([{text:'Vespa 150 TAP',confidence:95,complete:true}],vespa).verified,true);
assert.equal(T.decide([{text:'Vespa 150 TAP',confidence:95}],{hall:'main',type:'Legendary'}).verified,false);
assert.equal(T.decide([{text:'Vespa 150 TAP',confidence:40}],vespa).verified,false);
assert.notEqual(T.match('Vespa 160 TAP',vespa)?.name,'Vespa 150 TAP','model digits cannot be repaired');
for(const [raw,name] of [["Casimir Zeglen’s Brewster Body Shiel |","Casimir Zeglen's Brewster Body Shield"],["Ernest Hemingway’s Field - Surgery Kit","Ernest Hemingway's Field Surgery Kit"],["Stielhandgranate","Stielhandgranate"],["Trench Knife","Trench Knife"],["Signalling Lamp","Signalling Lamp"]]){
  const matched=T.match(raw);assert.equal(matched?.name,name,raw);assert.equal(matched.automatic,true);
}
for(const [base,variant] of [['Brewster Body Shield',"Casimir Zeglen's Brewster Body Shield"],['Trench Knife',"A.E.F.'s Trench Knife"],['Field Surgery Kit',"Ernest Hemingway's Field Surgery Kit"]]){
  assert.equal(T.match(base).name,base);assert.equal(T.match(variant).name,variant);
}
assert.equal(T.match('Casimir Zeglen’s Brewster Body Shiel',war).name,"Casimir Zeglen's Brewster Body Shield");
assert.equal(T.match('Brewster Body Shield',{hall:'main',type:'Armor'}).method,'context-mismatch');
assert.equal(T.match('Brewster Body Shield',{hall:'war',type:'Weapon'}).method,'context-mismatch');
for(const raw of ['2 WwW 01,5346','ee ee | a +3% nal','|||','aaaa','War Weapon','Sell Artifact','F-1 Grenade +3%'])assert.equal(T.decide([{text:raw,confidence:99}]).verified,false,raw);
assert.equal(T.decide([{text:'Readable Uncatalogued Relic',confidence:92}]).name,'Readable Uncatalogued Relic','unknown readable names remain usable without catalogue invention');
assert.equal(T.decide([{text:'Stielhandgranate',confidence:44}]).verified,false,'exact catalogue is not a confidence bypass');
const noisy=T.fromOCR({text:'|\nStielhandgranate',confidence:44,blocks:[{paragraphs:[{lines:[{text:'|',confidence:0},{text:'Stielhandgranate',confidence:94}]}]}]});
assert.equal(noisy.confidence,94);assert.equal(T.decide([noisy]).name,'Stielhandgranate');assert.equal(noisy.rawText,'|\nStielhandgranate');
const wrapped=T.fromOCR({text:"A.E.F.'s\nTrench Knife",confidence:94,blocks:[{paragraphs:[{lines:[{text:"A.E.F.'s",confidence:94},{text:'Trench Knife',confidence:94}]}]}]});
assert.equal(T.decide([wrapped]).name,"A.E.F.'s Trench Knife",'wrapped possessor cannot collapse into the ordinary base title');
const fragment=T.fromOCR({text:'Unreviewed\nTrench Knife',confidence:94,blocks:[{paragraphs:[{lines:[{text:'Unreviewed',confidence:94},{text:'Trench Knife',confidence:94}]}]}]});
assert.equal(fragment.text,'Unreviewed Trench Knife');assert.notEqual(T.decide([fragment]).name,'Trench Knife');
const noisyLines=T.fromOCR({text:'Trench Knife\n+3%',confidence:94,blocks:[{paragraphs:[{lines:[{text:'Trench Knife',confidence:94},{text:'+3%',confidence:94}]}]}]});
assert.equal(T.decide([noisyLines]).verified,false,'readable numeric noise cannot be silently dropped');
const punctuationTitle={text:"\\ Casimir Zeglen?s Brewster\n- Body Shield ;",confidence:69,blocks:[{paragraphs:[{lines:[
  {text:"\\ Casimir Zeglen?s Brewster",confidence:91,words:[{text:'\\',confidence:0},{text:'Casimir',confidence:94},{text:'Zeglen?s',confidence:92},{text:'Brewster',confidence:93}]},
  {text:'- Body Shield ;',confidence:45,words:[{text:'-',confidence:0},{text:'Body',confidence:95},{text:'Shield',confidence:94},{text:';',confidence:0}]}
]}]}]};
const readableTitle=T.fromOCR(punctuationTitle);assert.equal(readableTitle.confidence,92);assert.equal(readableTitle.blockConfidence,69);
assert.equal(readableTitle.lines[1].confidence,45);assert.equal(readableTitle.lines[1].textConfidence,94);assert.equal(readableTitle.lines[1].confidenceSource,'words');
assert.equal(T.decide([readableTitle],war).name,"Casimir Zeglen's Brewster Body Shield");assert.equal(readableTitle.rawText,punctuationTitle.text);
const weakWord=JSON.parse(JSON.stringify(punctuationTitle));weakWord.blocks[0].paragraphs[0].lines[1].words[2].confidence=45;
assert.equal(T.decide([T.fromOCR(weakWord)],war).verified,false,'a weak readable word cannot be excluded with punctuation');
const missingWord=JSON.parse(JSON.stringify(punctuationTitle));missingWord.blocks[0].paragraphs[0].lines[1].words.splice(2,1);
assert.equal(T.fromOCR(missingWord).confidence,45,'partial word evidence retains the conservative original line confidence');
const read=(text,confidence=95,x=.31)=>({text,confidence,complete:true,box:{x,y:0,width:.55,height:.11}});
assert.equal(S.titleDecision([read('Same title'),read('Same title')],{recovering:true}).verified,false);
assert.equal(S.titleDecision([read('Brewster Body Shield'),read('Brewster Body Shield',94,.302)],{recovering:true,...war}).verified,true);
assert.equal(S.titleDecision([read('Brewster Body Shield'),read("Casimir Zeglen's Brewster Body Shield",94,.302)],{recovering:true,...war}).conflict,true);
assert.equal(S.titleDecision([read('2 WwW 01,5346')]).verified,false,'garbage cannot pass Storage fast path');
async function capture(outputs,{hall='war',type='Weapon'}={}) {
  const calls=[],parameters=[];
  context.window.Tesseract={createWorker:async()=>({setParameters:async p=>parameters.push(p),recognize:async(...args)=>{calls.push(args);return {data:outputs[Math.min(outputs.length-1,calls.length-1)]};},terminate:async()=>{}})};
  context.window.DNScannerFieldRecognition={snapshot:()=>({valid:true,crops:{},release(){}}),recognize:async()=>({valid:true,artifact:{type,hall},hall,hallSource:'hall-colour',unlocked:{count:1},rows:[]})};
  const engine=R.create({names:[],canonPerk:x=>x});
  try{return {result:await engine.recognize({width:100,height:100},{fields:{},titleSource:{width:200,height:40}}),calls,parameters};}
  finally{await engine.close();}
}
(async()=>{
  let run=await capture([{text:'Stielhandgranate',confidence:44},{text:'Stielhandgranate',confidence:95}]);
  assert.equal(run.result.artifact.name,'Stielhandgranate');assert.equal(run.calls.length,2);assert.equal(run.result.artifact.nameEvidence.reads[0].confidence,44);
  run=await capture([{text:'2 WwW 01,5346',confidence:99},{text:'Trench Knife',confidence:94}]);assert.equal(run.result.artifact.name,'Trench Knife');assert.equal(run.calls.length,2);assert.equal(run.result.artifact.nameEvidence.text,'2 WwW 01,5346');
  run=await capture([{text:'Signalling Lamp',confidence:94}],{type:'Equipment'});assert.equal(run.result.artifact.name,'Signalling Lamp');assert.equal(run.calls.length,1,'clear title retains one-read fast path');
  const weakLine={text:'Trench Knife',confidence:40,bbox:{x0:10,y0:10,x1:180,y1:30}};
  run=await capture([{text:'Trench Knife',confidence:40,blocks:[{paragraphs:[{lines:[weakLine]}]}]},{text:'Trench Knife',confidence:40},{text:'Trench Knife',confidence:94}]);
  assert.equal(run.result.artifact.name,'Trench Knife');assert.equal(run.calls.length,3,'text-line crop is the last bounded retry');assert.ok(run.calls[2][1].rectangle);
  run=await capture([{text:'Brewster Body Shield',confidence:94}],{hall:'main',type:'Armor'});assert.equal(run.result.artifact.name,undefined,'identified wrong Hall cannot accept known War identity');
  assert.equal(run.result.artifact.nameEvidence.accepted,false);
  let current=true,released=0;
  context.window.DNScannerFieldRecognition={snapshot:()=>({valid:true,crops:{},release(){released++;}})};
  context.window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>{current=false;return {data:{text:'Trench Knife',confidence:95}};},terminate:async()=>{}})};
  const cancelled=R.create({names:[],canonPerk:x=>x});
  try{await assert.rejects(cancelled.recognize({width:100,height:100},{fields:{},titleSource:{width:200,height:40},isCurrent:()=>current}),/superseded or stopped/);assert.equal(released,1,'superseded title read releases frozen field crops');}
  finally{await cancelled.close();}
  console.log('Artifact titles: reviewed identity distinctions, garbage rejection, Hall/category gates, raw evidence, text-line confidence and selective retry bounds passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
