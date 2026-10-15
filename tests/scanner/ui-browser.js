/* Authority: Phase 3 screenshot-to-rating UI smoke test.
 * Ownership: Local harness only; exercises actual file input and Stop control.
 * Invariants: User fixture stays local, production scripts load naturally, no DOM mocks.
 * Constraints: Synthetic file selection is not a real browser screen-sharing trial.
 */
(async () => {
  const get=id=>document.getElementById('scanner-'+id);
  const wait=async predicate=>{const deadline=performance.now()+20000;while(!predicate()){if(performance.now()>deadline)throw new Error('Timed out: '+get('result-status').textContent+' / '+get('warnings').textContent);await new Promise(resolve=>setTimeout(resolve,50));}};
  await wait(()=>get('names').children.length>0);
  get('auto').checked=false;
  get('infer').checked=false;get('infer').dispatchEvent(new Event('change',{bubbles:true}));
  get('collect').checked=true;get('collect').dispatchEvent(new Event('change',{bubbles:true}));
  let categoryEvidence=null,recognitionEvidence=null;const record=DNScannerCollection.record;
  DNScannerCollection.record=result=>{categoryEvidence=result.artifact || null;recognitionEvidence=result;record(result);};
  const labels=await(await fetch('../tests/scanner/pic1.labels.json')).json();
  const blob=await(await fetch('../tests/scanner/pic1.png')).blob();
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'pic1.png',{type:'image/png'}));
  const started=performance.now();
  get('file').files=transfer.files;get('file').dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>get('result-status').textContent.startsWith('Visible perks read.'));
  const elapsedMs=performance.now()-started;
  const rows=[...get('result').querySelectorAll('.scanner-perk')].map(row=>({name:row.querySelector('span').textContent.replace(/^\d+\. /,''),value:Number(row.querySelectorAll('span')[1].textContent.replace('%',''))}));
  const exact=JSON.stringify(rows)===JSON.stringify(labels.rows);
  const automaticCategory=get('compare-type').value==='pottery' && get('item-type').textContent==='Pottery total · Def';
  const rating=get('result').querySelector('.scanner-score')?.textContent;
  const unlocked=get('result').querySelectorAll('.scanner-perk.is-unlocked').length===1;
  const colourBadges=[...get('result').querySelectorAll('.scanner-colour')].map(badge=>badge.textContent);
  // The compact crafting display intentionally removed per-stat colour blurbs.
  // Verify the underlying evidence and keep that requested compact layout.
  const coloursShown=recognitionEvidence?.colours?.length===5 && recognitionEvidence.colours.every(colour=>colour==='neutral') && colourBadges.length===0;
  const tiersCaptured=recognitionEvidence.rows.every(row=>row.tier==='white' && row.tierSource==='colour' && row.base===1 && row.max===10);
  const savedCraft=JSON.parse(localStorage.getItem('dn-crafting-scanner-log-v2'))?.items?.[0];
  const tiersSaved=savedCraft?.rows.every(row=>row.tier==='white' && row.tierSource==='colour');
  if(!tiersCaptured || !tiersSaved)throw new Error('Crafting tiers were lost before or during log persistence');
  const glance=get('result').querySelector('.scanner-traffic.is-green')?.textContent.includes('5/5') && get('result').querySelector('.scanner-enabled > strong')?.textContent==='1' && get('progress').textContent.startsWith('Finished');
  const summary=get('glance-board').getBoundingClientRect();
  const scoreSummaryVisible=summary.top>=0 && summary.bottom<=innerHeight && !get('item-total').textContent.includes('—') && get('capture-percent').textContent==='100%';
  const warnings=get('warnings').textContent;
  const resultStatus=get('result-status').textContent;
  const crop={width:get('crop').width,height:get('crop').height};
  const autoDetected=crop.width<1316 && crop.width>500 && get('layout').value==='panel';
  const collectionBeforeStop=get('collection-count').textContent;
  const collected=collectionBeforeStop.startsWith('1 distinct reads · 4 unique labels') && !!savedCraft;
  get('stop').click();
  const cleared=get('result').textContent.includes('Waiting for stat') && !get('result').querySelector('.is-unlocked') && get('correct').textContent==='' && get('read').disabled && get('stop').disabled && get('status').textContent==='Disconnected';
  await new Promise(resolve=>setTimeout(resolve,1000));
  const remainsCleared=get('result').textContent.includes('Waiting for stat') && get('result-status').textContent==='No artifact read yet.';
  const liveScoreCleared=get('item-total').textContent.includes('—') && get('capture-percent').textContent==='0%';
  const collectionRetained=get('collection-count').textContent===collectionBeforeStop && !!JSON.parse(localStorage.getItem('dn-crafting-scanner-log-v2'))?.items.length;
  return {fixture:'pic1.png',browser:navigator.userAgent,elapsedMs,rows,exact,automaticCategory,categoryEvidence,rating,unlocked,colourBadges,coloursShown,glance,scoreSummaryVisible,liveScoreCleared,warnings,resultStatus,crop,autoDetected,collected,collectionRetained,collectionBeforeStop,stopCleared:cleared,remainsCleared,passed:exact&&automaticCategory&&!!rating&&unlocked&&coloursShown&&glance&&scoreSummaryVisible&&liveScoreCleared&&!warnings&&autoDetected&&cleared&&remainsCleared&&collected&&collectionRetained,limitations:'Actual screenshot file-loading/detection/OCR/rating/collection/Stop UI exercised, including automatic Pottery category, colour labels with percentage inference disabled and pinned score visibility. Does not test getDisplayMedia permission, live game captures or background scheduling.'};
})()
