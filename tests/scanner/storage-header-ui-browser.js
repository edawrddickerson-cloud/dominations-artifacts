/* Real controller/DOM/storage: unverified titles cannot save or overwrite edits. */
(async()=>{
  const checks={},get=id=>document.getElementById('storage-'+id),scanner=id=>document.getElementById('scanner-'+id),store=DNStoredArtifacts;
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function wait(fn){const until=performance.now()+15000;while(!await fn()){if(performance.now()>until)throw Error('Header UI timeout: '+get('keep-status').textContent);await pause(25);}}
  await wait(()=>window.DNScannerReading && scanner('names').children.length && !get('saved').textContent.startsWith('Loading'));
  DNConsent?.set({});DN.setActiveProfile(DN.addProfile('Header recovery test'));
  scanner('auto').checked=false;scanner('collect').checked=false;scanner('layout').value='storage';
  const rows=Array.from({length:5},()=>({name:'Heavy Tank Damage',value:6,known:true,hasPercent:true,level:1,unlocked:true,rerollEligible:false,rerollSource:'visual'}));
  const observation={valid:true,warnings:[],expectedRows:5,hall:'main',rows,artifact:{name:'Enigma Machine',type:'Legendary',hall:'main',titleUnclear:true,titleConflict:true,rawTitle:'Enigma Machine'}};
  let finish=null,next=observation;
  DNStorageRecognition.inspect=()=>({hall:'main',expectedRows:5});
  DNScannerRecognition.create=()=>({close:async()=>{},recognize:async()=>new Promise(resolve=>{finish=()=>{const value=structuredClone(next);finish=null;resolve(value);};})});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  DNScannerReading.reset();DNScannerReading.update(canvas,{session:1,current:true});scanner('read').click();await wait(()=>finish);finish();
  await wait(()=>scanner('progress').textContent==='Finished');await pause(750);
  check('unverified complete-looking name cannot mark catalog ownership',!DN.loadCollected().has('enigma-machine-legendary'));
  check('unverified title cannot save scanned stats',(await store.read('items')).length===0 && get('keep-status').textContent==='Check the artifact name.');
  check('unverified name is highlighted for review',get('name').classList.contains('is-unknown'));
  scanner('read').click();await wait(()=>finish);
  const input=get('name');input.focus();input.value='Manual ';input.dispatchEvent(new Event('input',{bubbles:true}));
  check('manual typing preserves the trailing space',input.value==='Manual ' && document.activeElement===input);
  input.value='Manual header fixture';input.dispatchEvent(new Event('input',{bubbles:true}));finish();
  await wait(()=>scanner('progress').textContent==='Finished');
  check('in-flight OCR cannot replace a corrected name',get('name')===input && input.value==='Manual header fixture' && document.activeElement===input);
  check('manual title clears uncertainty',!input.classList.contains('is-unknown'));
  await wait(async()=>(await store.read('items')).some(item=>item.name==='Manual header fixture'));
  check('manual correction saves the reviewed name',(await store.read('items')).length===1);
  scanner('read').click();await wait(()=>finish);next={...observation,artifact:{...observation.artifact,name:'Different OCR title',titleUnclear:false,titleConflict:false}};finish();
  await wait(()=>scanner('progress').textContent==='Finished');await pause(750);
  check('later retries preserve the manual name without duplicates',input.value==='Manual header fixture' && (await store.read('items')).length===1);
  next=observation;DNScannerReading.reset();DNScannerReading.update(canvas,{session:2,current:true});scanner('read').click();await wait(()=>finish);finish();
  await wait(()=>scanner('progress').textContent==='Finished');
  check('manual name does not leak to a new capture',input.value==='Enigma Machine' && get('keep-status').textContent==='Check the artifact name.');
  DNScannerReading.reset();return {passed:true,ui:checks};
})()
