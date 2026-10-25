const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
const app={window:{},TextEncoder,crypto};vm.createContext(app);for(const f of ['crafting-history','integration-core','cloud-sync'])vm.runInContext(fs.readFileSync('ui/'+f+'.js','utf8'),app);
const copy=v=>JSON.parse(JSON.stringify(v)),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const workspace=n=>({kind:'dominations-cloud-workspace',version:1,game:'dominations',settings:{'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]}),'dn-artifact-perk-ratings-global':JSON.stringify({n})},records:[{id:'items',items:[]},{id:'collection:main',items:[]}]});
function fixture(){
 const f={local:workspace(1),row:{revision:1,operation_id:'initial',data:workspace(2)},binding:null,reads:0,writes:0,backups:0,applied:0,hold:null,backupError:false};
 f.sync=app.window.DNCloudSyncCore.create({capture:async()=>copy(f.local),readBinding:()=>f.binding,saveBinding:v=>f.binding=copy(v),recover:async()=>{f.backups++;if(f.backupError)throw Error('Safety backup failed');},apply:async(data,options)=>{f.applied++;f.options=options;f.local=copy(data);},remote:{read:async()=>{f.reads++;f.onRead?.(f.reads);const hold=f.hold;if(hold){f.hold=null;hold.started.resolve();await hold.finish.promise;}return copy(f.row);},write:async()=>{f.writes++;throw Error('Unexpected write');}}});
 f.sync.setOwner('owner');return f;
}
async function holdInspection(f){const hold={started:deferred(),finish:deferred()};f.hold=hold;const inspection=f.sync.inspect();await hold.started.promise;return {inspection,release:()=>hold.finish.resolve()};}
(async()=>{
 const f=fixture(),pending=await holdInspection(f),choice=f.sync.choose('cloud');
 await f.sync.inspect();assert.equal(f.reads,1,'background inspection cannot overtake a queued explicit choice');
 await assert.rejects(()=>f.sync.choose('cloud'),/already in progress/);
 pending.release();await pending.inspection;const result=await choice;
 assert.equal(result.status,'synced');assert.equal(result.reload,true);assert.equal(f.applied,1);assert.equal(f.backups,1);assert.equal(f.reads,3);assert.equal(f.writes,0);assert.deepEqual(f.local,f.row.data);
 assert.equal(f.options.preserveArtwork,true,'explicit first account linking preserves matching local images');
 const anotherAccount=fixture();anotherAccount.binding={owner:'previous-account',hash:'old'};await anotherAccount.sync.inspect();await anotherAccount.sync.choose('cloud');assert.equal(anotherAccount.options.preserveArtwork,false,'adopting another account does not transfer its predecessor images');
 const stale=fixture();await stale.sync.inspect();const displayed=stale.sync.state().comparison,busy=await holdInspection(stale);const rejected=assert.rejects(()=>stale.sync.choose('cloud',displayed),/changed/);stale.row.revision=2;stale.row.data=workspace(3);busy.release();await busy.inspection;await rejected;assert.equal(stale.applied,0);assert.equal(stale.backups,0);
 const unchanged=fixture();await unchanged.sync.inspect();const reviewed=unchanged.sync.state().comparison;unchanged.row.revision=2;await unchanged.sync.choose('cloud',reviewed);assert.equal(unchanged.applied,1,'identical account content at a new revision remains the reviewed version');
 const reread=fixture();await reread.sync.inspect();reread.onRead=n=>{if(n===3)reread.row.revision++;};await reread.sync.choose('cloud',reread.sync.state().comparison);assert.equal(reread.binding.revision,2);assert.equal(reread.applied,1);
 const changedReread=fixture();await changedReread.sync.inspect();changedReread.onRead=n=>{if(n===3){changedReread.row.revision++;changedReread.row.data=workspace(99);}};await assert.rejects(()=>changedReread.sync.choose('cloud',changedReread.sync.state().comparison),/cloud version changed/);assert.equal(changedReread.applied,0);
 const switched=fixture(),old=await holdInspection(switched),cancelled=assert.rejects(()=>switched.sync.choose('cloud'),/account changed/);switched.sync.setOwner('other');old.release();await old.inspection;await cancelled;assert.equal(switched.applied,0);assert.equal(switched.backups,0);
 const retry=fixture(),waiting=await holdInspection(retry);retry.backupError=true;const failed=assert.rejects(()=>retry.sync.choose('cloud'),/Safety backup failed/);waiting.release();await waiting.inspection;await failed;assert.equal(retry.applied,0);retry.backupError=false;await retry.sync.choose('cloud');assert.equal(retry.applied,1,'failed choices release their reservation for retry');
 const history=app.window.DNCraftingHistory,backfill=fixture(),records=Array.from({length:2020},(_,i)=>({id:'record-'+String(i).padStart(4,'0'),firstSeen:'2026-10-22T10:00:00Z',rows:[]}));
 backfill.binding={owner:'owner',hash:'previous'};backfill.local.craftingLog=history.project({version:2,items:records.slice(0,1)});backfill.row.data.craftingLog=history.project({version:2,items:records});
 await backfill.sync.inspect();const comparison=backfill.sync.state().comparison;assert.equal(comparison.cloud.lifetimeCraftsLogged,2020);
 backfill.local.craftingLog=history.project({version:2,items:records.slice(0,2)});await backfill.sync.choose('cloud',comparison);
 assert.equal(history.totals(backfill.local.craftingLog).logged,2020,'history-only browser updates cannot prevent the reviewed backfill from loading');assert.equal(backfill.applied,1);assert.equal(backfill.backups,1);
 console.log('Saved-data choice concurrency: waits for background reads, reserves priority, rejects stale choices/account switches and retries safely.');
})().catch(error=>{console.error(error);process.exitCode=1;});
