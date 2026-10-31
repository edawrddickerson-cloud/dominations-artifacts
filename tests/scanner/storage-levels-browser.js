/* User screenshot 2026-10-31 00:33:02, independently transcribed.
 * Exercises real OCR of full green progress bars and the abbreviated count stat. */
(async()=>{
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json());
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=DNScannerRecognition.create({names,canonPerk}),runs=[];
  try {
    const image=await createImageBitmap(await(await fetch('../tests/scanner/storage-leonidas.png')).blob());
    const original=document.createElement('canvas');original.width=image.width;original.height=image.height;
    original.getContext('2d').drawImage(image,0,0);image.close();
    const expectedNames=['Bazooka Damage','Mercenary Camp Deploys Spartans when Destroyed','Quick Victory Time',"Generals' Hitpoints & Damage",'Bazooka Damage','Bazooka Hitpoints'];
    for(const [scale,calibrated] of [[1,false],[.75,false],[1.5,false],[.75,true]]) {
      const input=document.createElement('canvas');input.width=Math.round(original.width*scale);input.height=Math.round(original.height*scale);
      input.getContext('2d').drawImage(original,0,0,input.width,input.height);
      // The screenshot contains both app and game; isolate the visible dialog.
      const factor=input.width/2048,rect={x:Math.round(1234*factor),y:Math.round(78*factor),width:Math.round(675*factor),height:Math.round(502*factor)};
      const source=document.createElement('canvas');source.width=rect.width;source.height=rect.height;
      source.getContext('2d').drawImage(input,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      const fields=calibrated?{template:DNStorageRegions.defaults(source.width/source.height,6)}:null;
      const result=await engine.recognize(source,{layout:'storage',expectedRows:6,fields});
      const exact=result.rows.length===6 && result.rows.every((row,i)=>row.name===expectedNames[i] && row.value===[13,2,20,20,11,11][i] && !row.assumed);
      const levels=result.rows.every((row,i)=>row.level===[1,2,10,10,1,1][i]);
      const count=DNScannerRecognition.usefulRow(result.rows[1]) && result.rows[1].hasPercent===false;
      let saved=true,saveStatus=null,savedItems=null;
      if(scale===1) {
        // Feed the actual OCR result through the current reading controller,
        // so Hall changes, review state and passive saving use production code.
        const create=DNScannerRecognition.create;
        DNScannerRecognition.create=()=>({warm:async()=>{},close:async()=>{},recognize:async()=>structuredClone(result)});
        document.getElementById('scanner-auto').checked=false;
        document.getElementById('scanner-collect').checked=false;
        document.getElementById('scanner-layout').value='storage';
        DNScannerReading.reset();DNScannerReading.update(source,{session:1,current:true});
        document.getElementById('scanner-read').click();
        const deadline=performance.now()+10000;
        saved=false;
        while(performance.now()<deadline) {
          const items=[...await DNStoredArtifacts.read('items'),...await DNStoredArtifacts.read(DNStoredArtifacts.collectionKey())];
          saved=items.some(item=>item.name==='Leonidas Bust' && item.rows[1].value===2 && item.rows[1].base===2 && item.rows[1].max===2);
          if(saved)break;
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        saveStatus=Object.fromEntries(['storage-keep-status','storage-saved','storage-name','storage-ownership-title','scanner-progress','scanner-message','scanner-correction-status'].map(id=>[id,document.getElementById(id)?.value || document.getElementById(id)?.textContent]));
        savedItems=[...await DNStoredArtifacts.read('items'),...await DNStoredArtifacts.read(DNStoredArtifacts.collectionKey())].map(item=>({name:item.name,rows:item.rows}));
        DNScannerRecognition.create=create;
      }
      runs.push({scale,calibrated,exact,levels,count,saved,saveStatus,savedItems,passed:exact&&levels&&count&&saved,artifact:result.artifact,rows:result.rows,evidence:result.evidence,warnings:result.warnings});
      source.width=source.height=input.width=input.height=0;
    }
    return {passed:runs.every(run=>run.passed),runs};
  } finally {await engine.close();}
})()
