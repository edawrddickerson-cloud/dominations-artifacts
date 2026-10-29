/* Real selectors and local collector; deterministic evidence, no game/account. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},document:{getElementById:()=>null},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},Date};
vm.createContext(context);
for(const file of ['data/army_catalog.js','shared.js','artifact-title-catalog.js','artifact-title-recognition.js','scanner-evidence.js','scanner-name-catalog.js','scanner-recognition.js','scanner-collection.js','integration-core.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const W=context.window,E=W.DNScannerEvidence,R=W.DNScannerRecognition,clone=value=>JSON.parse(JSON.stringify(value));
const row=(changes={})=>({name:'Heavy Tank Damage',known:true,value:3,hasPercent:true,rawName:'Heavy Tank Damage',rawPercentage:'+3%',confidence:90,unlocked:true,...changes});
const read=(changes={})=>({valid:true,hall:'war',hallSource:'hall-colour',artifact:{type:'Weapon'},warnings:[],rows:Array.from({length:5},()=>row()),...changes});
const retry=(first,changes)=>({...first,rows:first.rows.map((r,i)=>i===0?{...r,...changes}:r)});
const retain=(a,b)=>R.retainCraftRead(a,b,5,{sameEncounter:true});
// Independently readable percentage improves a held exact name despite bad name OCR.
let first=read({valid:false,rows:Array.from({length:5},()=>row({value:null,hasPercent:false}))});
let next=retry(first,{name:'Hev Tnk Dmge',known:false,value:3,hasPercent:true,rawPercentage:'+3%',confidence:95});
const input=JSON.stringify([first,next]);let selected=retain(first,next);
assert.equal(selected.rows[0].name,'Heavy Tank Damage');assert.equal(selected.rows[0].value,3);
assert.equal(selected.rows[0].fieldEvidence.value.selected.raw,'+3%');assert.equal(selected.valid,false,'composed evidence is provisional');
assert.equal(JSON.stringify([first,next]),input,'selection never edits original observations');
assert.equal(retain(first,retry(next,{value:-3,rawPercentage:'-3%'})).rows[0].value,null,'independent value cannot contradict the retained sign');
assert.equal(retain(first,retry(next,{rawPercentage:'3%'})).rows[0].value,null,'missing sign cannot be repaired through evidence selection');
assert.equal(retain(first,retry(next,{name:'Invading Heavy Tank Damage',value:3})).rows[0].value,null,'opposing readable qualifier blocks composition');
// Duplicate stat labels retain their physical row, not a shared best-value map.
first=read();next=retry(first,{value:null,hasPercent:false});next.rows[1]={...next.rows[1],value:6,confidence:95};
selected=retain(first,next);assert.equal(selected.rows[0].value,3);assert.equal(selected.rows[1].value,6);
assert.equal(selected.rows[1].fieldEvidence.value.conflict,true,'competing strong numeric evidence remains reviewable');
assert.equal(selected.valid,false);
// A new exact identity must use its own percentage, never the held unit's number.
first=read();next=retry(first,{name:'Bomber Damage',value:6,confidence:99});
selected=retain(first,next);assert.equal(selected.rows[0].name,'Bomber Damage');assert.equal(selected.rows[0].value,6);
const manuallyRead=retry(first,{valueSource:'manual'});const manualKept=retain(manuallyRead,next);assert.equal(manualKept.rows[0].name,'Bomber Damage');assert.equal(manualKept.rows[0].value,3,'a manual percentage belongs to the physical row even when its OCR name improves');
// Bounded journals do not turn repeated reads into votes.
first=read();for(let i=0;i<20;i++)first=retain(first,retry(read(),{value:6,confidence:80}));
assert.equal(first.rows[0].value,3);assert.equal(first.rows[0].fieldEvidence.value.alternatives.length,1);
assert.equal(first.rows[0].fieldEvidence.value.selected.confidence,90);
for(const confidence of [70,71,72,73,74])first=retain(first,retry(read(),{value:11,confidence}));
assert(first.rows[0].fieldEvidence.value.alternatives.length<=2);
// Manual unknown is meaningful, including dice; automatic unknown is current pixel evidence.
first=read({rows:Array.from({length:5},()=>row({nameSource:'manual',valueSource:'manual',level:4,levelSource:'manual',unlockedSource:'manual',rerollEligible:null,rerollSource:'manual'}))});
selected=retain(first,read({rows:Array.from({length:5},()=>row({name:'Bomber Damage',value:6,confidence:99,level:8,levelSource:'ocr',unlocked:false,rerollEligible:true,rerollSource:'dice-background'}))}));
for(const key of ['name','value','level','unlocked','rerollEligible'])assert.equal(selected.rows[0][key],first.rows[0][key],key+' manual choice is protected');
first=read({rows:Array.from({length:5},()=>row({rerollEligible:true,rerollSource:'dice-background',rerollConfidence:'high'}))});
selected=retain(first,retry(first,{rerollEligible:null,rerollSource:'dice-background',rerollConfidence:'unknown'}));
assert.equal(selected.rows[0].rerollEligible,null,'fresh explicit unknown dice displaces old observed availability');
// Known metadata improves independently, while weak title confidence cannot win.
first=read({artifact:{type:'Weapon',name:'Casimir Zeglen’s Brewster Body Shiel',nameEvidence:{text:'clipped',confidence:99,accepted:true}}});
next=read({valid:false,artifact:{type:'Weapon',name:"Casimir Zeglen's Brewster Body Shield",nameEvidence:{text:'full title',confidence:85,accepted:true,match:{automatic:true,method:'exact'}}},rows:Array.from({length:5},()=>row({value:null}))});
selected=retain(first,next);assert.equal(selected.artifact.name,next.artifact.name);assert.equal(selected.rows[0].value,3);
assert.equal(selected.fieldEvidence.metadata.name.selected.raw,'full title');
assert.equal(selected.fieldEvidence.metadata.name.alternatives[0].value,first.artifact.name);
assert.equal(E.mergeArtifact(selected.artifact,{name:'noise',nameEvidence:{confidence:100,accepted:false},titleUnclear:true}).name,next.artifact.name);
assert.equal(E.mergeArtifact({...first.artifact,nameSource:'manual'},next.artifact).name,first.artifact.name);
assert.equal(E.mergeArtifact({image:'clear',artworkId:'art-old'},{image:'unmeasured-blurry',artworkId:'art-new'}).image,'clear');
assert.equal(E.mergeArtifact({type:'Armor',typeSource:'manual'},{type:'Weapon'}).type,'Armor');
// Callers must establish encounter/profile identity; mismatched layouts/halls reset.
selected=E.merge(first,next,{sameEncounter:false,base:first});assert.equal(selected.rows[0].value,null);
selected=E.merge(first,{...next,hall:'main',hallSource:'selected-hall'},{sameEncounter:true,base:first});assert.equal(selected.hall,'war','weak Hall fallback cannot erase observed Hall');
selected=E.merge(first,{...next,rows:[...next.rows,row()]},{sameEncounter:true,expectedRows:6});assert.equal(selected.rows.length,6);
// Field-specific confidence follows the selected observation even when rows are cloned.
first=read({evidence:Array.from({length:5},()=>({label:{confidence:40},amount:{confidence:90}}))});
next=read({evidence:Array.from({length:5},()=>({label:{confidence:98},amount:{confidence:95}})),rows:Array.from({length:5},()=>row({name:'Bomber Damage',value:6,confidence:99}))});
selected=retain(first,next);assert.equal(selected.rows[0].fieldEvidence.name.selected.confidence,98);assert.equal(selected.rows[0].fieldEvidence.value.selected.confidence,95);
const weakerField=retry(selected,{value:3,confidence:100});weakerField.evidence=Array.from({length:5},()=>({label:{confidence:100},amount:{confidence:92}}));const heldValue=retain(selected,weakerField);assert.equal(heldValue.rows[0].value,6,'better name confidence cannot displace a stronger percentage observation');
const held=read(),weakHall=read({hall:'main',hallSource:'selected-hall',rows:Array.from({length:5},()=>({name:'',known:false,value:null}))});
selected=retain(held,weakHall);assert.equal(selected.hall,'war');assert.equal(selected.rows[0].name,held.rows[0].name);
selected=retain(held,{...weakHall,hall:'war',metadataConflict:true,artifact:{type:'Armor'}});assert.equal(selected.artifact.type,'Weapon');assert.equal(selected.rows[0].name,held.rows[0].name);
// Canonical log accepts better title evidence even when stats are weaker.
const C=W.DNScannerCollectionCore.createCollector();
first=read({artifact:{type:'Weapon',name:'Shiel',nameEvidence:{text:'Shiel',confidence:99,accepted:true}}});
C.recordItem(first,'a',{expectedRows:5,encounterId:'one'});
next=read({valid:false,artifact:{type:'Weapon',name:"Casimir Zeglen's Brewster Body Shield",nameEvidence:{text:'full title',confidence:85,accepted:true,match:{automatic:true,method:'exact'}}},rows:Array.from({length:5},()=>row({value:null}))});
C.recordItem(next,'a',{expectedRows:5,encounterId:'one'});
let saved=C.exportData().items[0];assert.equal(saved.name,next.artifact.name);assert.equal(saved.rows[0].value,3);
saved=clone(saved);const reload=W.DNScannerCollectionCore.createCollector({initialData:C.exportData()});assert.equal(reload.exportData().items[0].name,saved.name);
const reviews=W.DNScannerCollectionCore.createCollector();reviews.recordItem(read({artifact:{name:'ee ee | a +3% nal',type:'Weapon',nameEvidence:{text:'ee ee | a +3% nal',confidence:62,accepted:true}}}),'bad');
assert.equal(reviews.nameReviews()[0].reason,'title-review','accepted garbage stays visible for review');
// Per-field OCR is local even inside nested kept items and historical revisions.
const cleaned=W.DNIntegrationCore.sanitizeItem({name:'Safe',fieldEvidence:{raw:'private'},nameEvidence:{text:'private'},titleMatch:{text:'private'},rawTitle:'private',titleEvidence:[{text:'private'}],rows:[{name:'Heavy Tank Damage',value:3,rawName:'private',rawPercentage:'private',fieldEvidence:selected.rows[0].fieldEvidence}],revisions:[{fieldEvidence:{selected:{raw:'private'}}}]});
assert(!JSON.stringify(cleaned).includes('private'));assert.equal(cleaned.rows[0].value,3);
const disputed=retain(read(),retry(read(),{value:6,confidence:95}));
assert.equal(disputed.rows[0].conflict,undefined,'candidate remains available for provisional scoring');
assert.equal(W.DNScannerCollectionCore.isComplete({...disputed,expectedRows:5}),false,'unresolved per-field dispute blocks explicit Keep');
const short=R.retainCraftRead(disputed,{valid:false,rows:[],warnings:[]},5,{sameEncounter:true});
assert.equal(short.fieldEvidence.conflict,true,'short retries cannot erase unresolved disputes');
const conflictLog=W.DNScannerCollectionCore.createCollector();conflictLog.recordItem(E.seed(read()),'conflict',{encounterId:'conflict'});
conflictLog.recordItem(disputed,'conflict',{encounterId:'conflict'});
const conflictSaved=conflictLog.exportData().items[0];assert.equal(conflictSaved.fieldEvidence.conflict,true);assert.equal(conflictSaved.validated,false);assert.equal(W.DNScannerCollectionCore.isComplete(conflictSaved),false,'recent-item log cannot bypass a live dispute');
const safe=W.DNIntegrationCore.sanitizeItem({rows:disputed.rows});assert.equal(safe.rows[0].conflict,true,'cloud-safe projection preserves the dispute without raw evidence');
vm.runInContext(fs.readFileSync('ui/crafting-history.js','utf8'),context);
const projected=W.DNCraftingHistory.project({version:2,items:[{id:'disputed',hall:'war',rows:disputed.rows}]});
assert.equal(projected.items[0].rows[0].conflict,true,'history projection preserves the dispute');
const preserved=W.DNCraftingHistory.preserveLocalDetails(projected,{items:[{id:'disputed',rows:disputed.rows}]});assert.equal(preserved.items[0].rows[0].fieldEvidence.value.conflict,true,'same-account reconciliation retains matching local evidence');assert.equal(W.DNScannerCollectionCore.isComplete(preserved.items[0]),false,'reconciled local details cannot bypass conflict blocking');
const resolved=E.resolveManual({...disputed.rows[0],valueSource:'manual'});assert.equal(resolved.fieldEvidence.value.conflict,false);
assert.equal(C.exportData().titleCandidates[0].name,next.artifact.name,'title spellings are exported as unverified candidates');
console.log('Independent field evidence: positional composition, signs, manual choices, conflicts, bounded journals, title retention, persistence and privacy passed.');
