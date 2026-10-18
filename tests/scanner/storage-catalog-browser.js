/* Actual scanner controller, profile settings and Priority checkboxes. */
(async()=>{
  const checks={},get=id=>document.getElementById('storage-'+id),store=window.DNStoredArtifacts;
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw new Error(name);};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function wait(fn){const until=performance.now()+12000;while(!await fn()){if(performance.now()>until)throw new Error('Catalog ownership timeout: '+get('ownership-title').textContent);await pause(25);}}
  await wait(()=>window.DNStorageScanner && !get('saved').textContent.startsWith('Loading'));
  const DN=window.DN,profile=DN.addProfile('Catalog ownership test');DN.setActiveProfile(profile);
  DN.lsSet('dn-artifact-hall-filter','Main');
  const source=(await (await fetch('artifacts.html')).text()).replace(/<!-- Cloudflare Web Analytics -->.*<!-- End Cloudflare Web Analytics -->/g,'')
    .replace('<head>','<head><script>const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>String(url).includes("artifact_images.json")?Promise.resolve(new Response("{}")):originalFetch(url,options);</script>');
  const frame=document.createElement('iframe');frame.hidden=true;frame.srcdoc=source;document.body.append(frame);
  const checkbox=id=>frame.contentDocument?.querySelector('.collected-input[data-artifact-id="'+id+'"]');
  await wait(()=>checkbox('enigma-machine-legendary'));
  let encounter=0;
  function read(name,count=5,{type='Legendary',hall='main',reviewable=true,profileKey=store.collectionKey(),pending=false,metadataConflict=false}={}) {
    // Unknown percentages and levels must block stat saving, not name ownership.
    const rows=Array.from({length:count},()=>({name:'',value:null,known:false,hasPercent:false}));
    window.DNStorageScanner.update({valid:false,metadataConflict,warnings:[],rows,artifact:{name,type,hall}},false,
      {reviewable,pending,expectedRows:count,profileKey,encounterId:++encounter});
  }
  check('both editions begin uncollected',!checkbox('enigma-machine-legendary').checked && !checkbox('enigma-machine-mythical').checked);
  read('  ENIGMA   MACHINE ',5,{type:''});
  await wait(()=>checkbox('enigma-machine-legendary').checked);
  check('five attributes check Legendary on the already open Priority page',checkbox('enigma-machine-legendary').checked && !checkbox('enigma-machine-mythical').checked);
  check('name ownership does not require complete stats',(await store.read('items')).length===0 && get('ownership-title').textContent==='Collected · Legendary');
  read('Enigma Machine',6,{type:'Legendary'});
  await wait(()=>checkbox('enigma-machine-mythical').checked);
  check('six attributes check Mythical despite wrong banner OCR',checkbox('enigma-machine-legendary').checked && checkbox('enigma-machine-mythical').checked);
  const count=DN.loadCollected().size;
  read('Enigma Machine',6);await pause(100);
  check('rescanning does not add duplicate ownership',DN.loadCollected().size===count);
  checkbox('enigma-machine-mythical').click();
  await wait(()=>!DN.loadCollected().has('enigma-machine-mythical'));
  window.dispatchEvent(new Event('focus'));await pause(100);
  check('manual unchecking survives routine scanner refresh',!DN.loadCollected().has('enigma-machine-mythical') && !checkbox('enigma-machine-mythical').checked);
  read('Enigma Machine',6);
  await wait(()=>checkbox('enigma-machine-mythical').checked);
  read('Rosetta Stone',5,{reviewable:false});await pause(100);
  check('stale displayed reads do not mark ownership',!DN.loadCollected().has('rosetta-stone-legendary'));
  read('Rosetta Stone',5,{metadataConflict:true});await pause(100);
  check('conflicting metadata does not mark ownership',!DN.loadCollected().has('rosetta-stone-legendary'));
  read('Unlisted crafted weapon');await pause(100);
  check('ordinary and unknown titles stay unmarked',DN.loadCollected().size===count);
  read("Admiral Yi's Helmet");
  await wait(()=>DN.loadCollected().has('admiral-yi-s-helmet-legendary'));
  check('straight apostrophes match catalog punctuation',DN.loadCollected().has('admiral-yi-s-helmet-legendary'));
  read('Unlisted name');
  get('name').value='Rosetta Stone';get('name').dispatchEvent(new Event('input',{bubbles:true}));
  await pause(100);
  check('manual title corrections wait for typing to settle',!DN.loadCollected().has('rosetta-stone-legendary'));
  get('name').value='Unlisted name';get('name').dispatchEvent(new Event('input',{bubbles:true}));
  await pause(700);
  check('abandoned title corrections cannot mark an intermediate name',!DN.loadCollected().has('rosetta-stone-legendary'));
  get('name').value='Rosetta Stone';get('name').dispatchEvent(new Event('input',{bubbles:true}));
  await wait(()=>DN.loadCollected().has('rosetta-stone-legendary'));
  check('a finished title correction marks its Priority checkbox',checkbox('rosetta-stone-legendary').checked);
  frame.srcdoc=source;await wait(()=>checkbox('enigma-machine-mythical')?.checked);
  check('Priority checkboxes stay checked after reload',checkbox('enigma-machine-legendary').checked && checkbox('enigma-machine-mythical').checked);
  const staleProfile=store.collectionKey();DN.setActiveProfile(DN.addProfile('Other catalog profile'));
  read('Enigma Machine',6,{profileKey:staleProfile});await pause(100);
  check('a late old-profile scan cannot mark the new profile',DN.loadCollected().size===0);
  read('British Kettle Drum',6,{hall:'war',type:'War Legendary'});
  await wait(()=>DN.loadCollected().has('british-kettle-drum-mythical'));
  check('War Mythical edition is marked by name and six attributes',!DN.loadCollected().has('british-kettle-drum-legendary'));
  frame.remove();return {passed:true,ui:checks};
})();
