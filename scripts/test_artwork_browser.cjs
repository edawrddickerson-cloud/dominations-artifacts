const fs=require('node:fs'),assert=require('node:assert/strict');
const {browserRun}=require('./artwork_browser.cjs');
browserRun(async({evaluate,events})=>{
 const report=await evaluate(`(async()=>{
  const checks={},assert=(name,ok)=>{checks[name]=!!ok;if(!ok)throw Error(name);};
  for(const file of ['data/artwork_ids.js','artwork-matcher.js','artwork.js','crafting-history.js','integration-core.js'])await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/ui/'+file;s.onload=ok;s.onerror=no;document.head.append(s);});
  const c=await DNArtwork.load();let matched=0,ambiguous=0,transformedMatched=0,transformedUnknown=0;const durations=[];
  for(const entry of c.entries){
   const blob=await(await fetch(DNArtwork.asset(entry.id))).blob();
   const local=await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(blob);});
   const start=performance.now(),r=await DNArtwork.match(local);durations.push(performance.now()-start);
   if(r.artworkId){assert('approved asset never selects another identity '+entry.id,r.artworkId===entry.id);matched++;}else ambiguous++;
   if(matched<25){
    const im=new Image();im.src=local;await im.decode();
    for(const change of ['compressed','scaled','shifted']){
     const canvas=document.createElement('canvas');canvas.width=change==='scaled'?144:192;canvas.height=Math.round(canvas.width*im.height/im.width);const x=canvas.getContext('2d');x.fillStyle='#080808';x.fillRect(0,0,canvas.width,canvas.height);const offset=change==='shifted'?2:0;x.drawImage(im,offset,0,canvas.width,canvas.height);
     const result=await DNArtwork.match(canvas.toDataURL('image/jpeg',change==='compressed'?.6:.88));
     assert('transformed image cannot select another identity '+entry.id+' '+change,!result.artworkId||result.artworkId===entry.id);
     if(result.artworkId)transformedMatched++;else transformedUnknown++;
    }
   }
  }
  const entry=c.entries[0],blob=await(await fetch(DNArtwork.asset(entry.id))).blob();
  const local=await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(blob);});
  const item={id:'copy-1',name:'',type:'Weapon',hall:'main',image:local,artworkId:entry.id,rows:[{name:'Damage',value:1}]};
  assert('approved image takes priority',DNArtwork.src(item)===DNArtwork.asset(entry.id));
  assert('unmatched uses local image',DNArtwork.src({...item,artworkId:null})===local);
  assert('unapproved URLs cannot become artwork',DNArtwork.src({artworkId:'https://evil.invalid'})==='');
  const node=document.createElement('img');document.body.append(node);DNArtwork.bind(node,item);node.dispatchEvent(new Event('error'));assert('asset error uses local image',node.src===local);window.dispatchEvent(new Event('online'));
  const blank=document.createElement('canvas');blank.width=192;blank.height=240;
  for(let n=0;n<12;n++){const x=blank.getContext('2d');x.fillStyle=['#000','#fff','#6b2020','#133d51'][n%4];x.fillRect(0,0,192,240);if(n>=4){x.fillStyle='#ddd';x.font='20px sans-serif';x.fillText('Notification',10,100);x.fillText('Test content',10,130);}assert('non-game image rejected '+n,!(await DNArtwork.match(blank.toDataURL('image/jpeg'))).artworkId);}
  let activeProfile='main';window.DN={activeProfileId:()=>activeProfile};
  await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/ui/stored-artifacts.js';s.onload=ok;s.onerror=no;document.head.append(s);});
  await DNStoredArtifacts.write('collection:main',[{...item,artworkId:undefined}, {...item,id:'copy-2',artworkId:undefined}]);
  await DNStoredArtifacts.backfillArtwork();let saved=await DNStoredArtifacts.read('collection:main');
  assert('backfill preserves physical copies',saved.length===2&&saved[0].id==='copy-1'&&saved[1].id==='copy-2');
  assert('backfill adds only approved IDs',saved.every(i=>i.artworkId===entry.id&&i.image===local&&i.rows[0].value===1));
  const settings={'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]})};
  const workspace=DNIntegrationCore.createWorkspace(settings,[{id:'items',items:[]},{id:'collection:main',items:saved}]);
  assert('workspace contains no image pixels',!JSON.stringify(workspace).includes('base64'));
  await DNStoredArtifacts.restoreBackupRecords(workspace.records,()=>{});saved=await DNStoredArtifacts.read('collection:main');
  assert('fresh restore needs only artwork ID',saved.every(i=>!i.image&&DNArtwork.src(i)===DNArtwork.asset(entry.id)));
  const before=JSON.stringify(saved);
  const wrong=structuredClone(workspace);wrong.records[1].items[0].artworkId='art-0000000000000000';let rejected=false;try{DNIntegrationCore.validate(wrong);}catch{rejected=true;}
  assert('invalid remote ID rejected before storage',rejected&&JSON.stringify(await DNStoredArtifacts.read('collection:main'))===before);
  const realMatch=DNArtwork.match;let release;
  DNArtwork.match=()=>new Promise(ok=>{release=ok;});
  await DNStoredArtifacts.write('collection:main',[{...item,id:'stale',artworkId:undefined}]);
  const pending=DNStoredArtifacts.backfillArtwork();while(!release)await new Promise(ok=>setTimeout(ok,5));
  await DNStoredArtifacts.write('collection:main',[]);release({status:'matched',artworkId:entry.id});await pending;
  assert('late match cannot resurrect deletion',(await DNStoredArtifacts.read('collection:main')).length===0);DNArtwork.match=realMatch;
  let finish;DNArtwork.match=()=>new Promise(ok=>{finish=ok;});
  await DNStoredArtifacts.write('collection:main',[{...item,id:'profile-stale',artworkId:undefined}]);
  const moving=DNStoredArtifacts.backfillArtwork();while(!finish)await new Promise(ok=>setTimeout(ok,5));activeProfile='other';finish({status:'matched',artworkId:entry.id});await moving;
  assert('profile switch rejects delayed artwork update',!(await DNStoredArtifacts.read('collection:main'))[0].artworkId);
  assert('profile switch cannot populate another collection',(await DNStoredArtifacts.read('collection:other')).length===0);activeProfile='main';DNArtwork.match=realMatch;
  const frame=document.createElement('iframe');frame.srcdoc=(await(await fetch('/ui/collection.html')).text()).replace('<head>','<head><base href="/ui/">').replace(/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/g,'');document.body.append(frame);
  const until=performance.now()+15000;while(!frame.contentWindow?.DNStoredArtifacts||frame.contentDocument.readyState!=='complete'){if(performance.now()>until)throw Error('Collection load timed out');await new Promise(ok=>setTimeout(ok,25));}
  const app=frame.contentWindow;app.DN.saveCollectionUi({hall:'Main',viewMode:'list',valueMode:'actual'});app.DN.lsSet('dn-artifact-hall-filter','Main');
  await app.DNStoredArtifacts.write(app.DNStoredArtifacts.collectionKey(),[{...item,name:'Approved artwork fixture'}]);
  async function rendered(expected){for(let n=0;n<100;n++){frame.contentDocument.getElementById('hall-main')?.click();frame.contentDocument.getElementById('view-list')?.click();app.dispatchEvent(new app.Event('dn-artifacts-changed'));await new Promise(ok=>setTimeout(ok,25));const img=frame.contentDocument.querySelector('#collection-list img');if(img?.src===expected)return true;}return false;}
  const hasApproved=await rendered(DNArtwork.asset(entry.id));
  if(!hasApproved)throw Error('Collection rendering: '+JSON.stringify({error:frame.contentDocument.getElementById('error')?.textContent,list:frame.contentDocument.getElementById('collection-list')?.textContent.slice(0,250),images:[...frame.contentDocument.querySelectorAll('img')].map(i=>i.src.startsWith('data:')?'local image':i.src),profile:app.DN.activeProfileId(),items:(await app.DNStoredArtifacts.read(app.DNStoredArtifacts.collectionKey())).map(i=>({id:i.id,artworkId:i.artworkId}))}));
  assert('real Collection renders approved image before local capture',hasApproved);
  const unmatched=blank.toDataURL('image/jpeg');await app.DNStoredArtifacts.write(app.DNStoredArtifacts.collectionKey(),[{...item,name:'Local artwork fixture',artworkId:undefined,image:unmatched}]);
  assert('real Collection renders unmatched local capture',await rendered(unmatched));frame.remove();
  durations.sort((a,b)=>a-b);return {checks,assets:{matched,ambiguous,total:c.entries.length},transformed:{matched:transformedMatched,unknown:transformedUnknown},p95Ms:durations[Math.floor(durations.length*.95)],maxMs:durations.at(-1)};
 })()`);
 const network=events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request).filter(r=>!r.url.startsWith('data:')&&!r.url.startsWith('blob:'));
 assert.ok(network.every(r=>r.method==='GET'&&r.url.startsWith('http://127.0.0.1:')),'No image or fingerprint uploads');
 assert.ok(!events.some(e=>e.method==='Runtime.exceptionThrown'),'No browser exceptions');
 report.network={requests:network.length,uploads:0,externalRequests:0};
 fs.writeFileSync('reports/artwork-browser.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks:Object.keys(report.checks).length,assets:report.assets,p95Ms:report.p95Ms,network:report.network}));
}).catch(e=>{console.error(e);process.exitCode=1;});
