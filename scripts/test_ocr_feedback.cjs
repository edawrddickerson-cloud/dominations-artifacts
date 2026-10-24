const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
let optedIn=false,who='account-a';
const context={window:{DNCloud:{user:()=>({id:who})},DNOCRFeedback:{allowed:()=>optedIn}},document:{getElementById:()=>null},crypto,TextEncoder,Date};vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/scanner-collection.js','utf8'),context);vm.runInContext(fs.readFileSync('ui/ocr-feedback.js','utf8'),context);
const F=context.window.DNOCRFeedbackCore,C=context.window.DNScannerCollectionCore,copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
const result={valid:true,hall:'main',artifact:{name:'Wrong Watch',type:'Jewelry',nameEvidence:{text:'Wrong Watch',accepted:true,confidence:90}},rows:[{name:'Tower Damage',rawName:'Tower Damage',raw:'Tower Damage +6%',known:true,value:6,nameMatch:{name:'Tower Damage',method:'exact',automatic:true,confidence:1}}]};
const collector=C.createCollector();collector.recordItem(result,'before',{encounterId:'before'});assert.equal(collector.ocrFeedbackItems()[0].ocrEvidence.length,0,'no optional evidence before consent');
optedIn=true;
const sources=['crafting','storage'];
for(const source of sources){
 const options={encounterId:source,scannerSource:source,captureMethod:'live-capture'};
 collector.recordItem(result,source,options);
 const id=collector.itemForEncounter(source).id;
 const fixed=copy(result);fixed.rows[0]={...fixed.rows[0],name:'Tower Hitpoints',nameSource:'manual'};
 collector.recordItem(fixed,source,{...options,corrected:true});collector.updateItem(id,{name:'Pomander Watch',nameSource:'manual'});
 const item=collector.ocrFeedbackItems().find(i=>i.id===id),samples=F.samples([item],'test');
 assert.equal(item.rows[0].raw,'Tower Damage +6%');assert.equal(samples.length,2);assert.equal(samples[0].sample.observed_text,'Wrong Watch');
 assert.equal(samples[1].sample.observed_text,'Tower Damage');assert.equal(samples[1].sample.match_method,'exact');assert.equal(samples[1].sample.corrected_name,'Tower Hitpoints');assert.equal(samples[1].sample.scanner,source);
}
const titleOnly=C.createCollector();titleOnly.recordItem({rows:[],artifact:{nameEvidence:{text:'Rejected title',accepted:false,confidence:20}}},'title-only',{encounterId:'title-only',scannerSource:'storage'});assert.equal(F.samples(titleOnly.ocrFeedbackItems(),'test')[0].sample.match_status,'rejected','a rejected title with no perk rows is retained');
const retry=C.createCollector(),failed=copy(result);failed.valid=false;failed.rows[0]={raw:'Tovver +6%',rawName:'Tovver',name:'Tovver',known:false,value:6};
retry.recordItem(failed,'retry',{encounterId:'retry',scannerSource:'crafting'});
for(let i=0;i<30;i++)retry.recordItem(failed,'retry',{encounterId:'retry',scannerSource:'crafting'});
retry.recordItem(result,'retry',{encounterId:'retry',scannerSource:'crafting'});
const resolved=F.samples(retry.ocrFeedbackItems(),'test');assert.equal(resolved.filter(e=>e.sample.observed_text==='Tovver').length,1);assert.equal(resolved.find(e=>e.sample.observed_text==='Tovver').sample.resolution,'later-ocr');
retry.recordItem(result,'independent',{encounterId:'independent',newEncounter:true,scannerSource:'crafting'});assert.equal(retry.historyItems().length,2);
for(let i=0;i<100;i++){const next=copy(failed);next.rows[0].rawName='Unknown '+i;retry.recordItem(next,'retry',{encounterId:'retry',scannerSource:'crafting'});}
assert(retry.ocrFeedbackItems()[0].ocrEvidence.length<=42);
assert.equal(F.safeText('www.private.invalid',500),null);assert.equal(F.safeText('private@example.invalid',500),null);
(async()=>{
 let connected=true,writes=0,enabled=false,epoch=null;const saved=new Map(),calls=[],operations=new Map();let lose=false;
 const store={get:async k=>copy(saved.get(k)||null),put:async(k,v)=>{writes++;saved.set(k,copy(v));},remove:async k=>saved.delete(k)};
 const rpc=async(name,args)=>{
  if(!connected)throw Error('offline');calls.push({name,args:copy(args),who});
  if(name==='planner_get_ocr_feedback_consent')return {enabled,epoch,since:new Date(0).toISOString()};
  if(name==='planner_set_ocr_feedback_consent'){
   if(operations.has(args.p_operation))return operations.get(args.p_operation);
   if(args.p_enabled && args.p_expected!==epoch)throw Error('stale consent');
   enabled=args.p_enabled;epoch=crypto.randomUUID();const receipt={enabled,epoch,since:new Date(0).toISOString()};operations.set(args.p_operation,receipt);
   if(lose){lose=false;throw Error('lost response');}return receipt;
  }
  if(name==='planner_submit_ocr_feedback'){if(!enabled || args.p_epoch!==epoch)throw Error('revoked');if(lose){lose=false;throw Error('lost response');}return {accepted:true};}
 };
 const create=()=>F.create({store,rpc,owner:()=>who,consent:()=>optedIn,ready:()=>true,online:()=>connected,build:'test'});
 const items=collector.ocrFeedbackItems();let client=create();optedIn=false;await client.collect(items);await client.flush();assert.equal(writes,0);assert.equal(calls.length,0);
 lose=true;assert.equal(await client.setSharing(true),false);assert.equal(await client.setSharing(true),true,'lost grant response retried with same operation');optedIn=true;
 connected=false;await client.collect(items);assert.equal(client.status().pending,4);const ids=Object.values(saved.get('ocr-feedback:account-a').entries).map(e=>e.sample.id);await client.flush();
 client=create();connected=true;lose=true;assert.equal(await client.flush(),false);await client.flush();assert.equal(client.status().pending,0);
 const batches=calls.filter(c=>c.name==='planner_submit_ocr_feedback');assert.deepEqual(batches[0].args.p_samples.map(e=>e.id),ids);assert.deepEqual(batches[1].args.p_samples.map(e=>e.id),ids);
 await client.collect(items);await client.flush();assert.equal(calls.filter(c=>c.name==='planner_submit_ocr_feedback').length,2,'retry dedup');
 who='account-b';await client.setSharing(true);await client.collect(items);assert.equal(client.status().pending,0,'no grant for switched account');who='account-a';
 enabled=false;epoch=crypto.randomUUID();const grants=calls.filter(c=>c.name==='planner_set_ocr_feedback_consent').length;
 await client.collect(items.map(i=>({...i,revision:i.revision+1})));assert.equal(await client.flush(),false);assert.equal(calls.filter(c=>c.name==='planner_set_ocr_feedback_consent').length,grants,'stale upload never restores consent');
 connected=false;optedIn=false;assert.equal(await client.withdraw(),false);client=create();connected=true;assert.equal(await client.retryWithdrawal(),true);assert.equal(enabled,false);assert.equal(Object.keys(saved.get('ocr-feedback:account-a').entries).length,0);
 optedIn=true;await client.setSharing(true);await client.collect(Array.from({length:400},(_,n)=>({...items[1],id:'bulk-'+n})));assert.equal(client.status().pending,500,'bounded queue');await client.flush();assert.equal(client.status().pending,0);assert(calls.filter(c=>c.name==='planner_submit_ocr_feedback').every(c=>c.args.p_samples.length<=50));
 console.log('OCR feedback passed: both scanner sources, original text and exact-match corrections, retry resolution/dedup, bounded evidence/queue, no pre-consent writes, lost responses, offline reload, account switching and durable withdrawal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
