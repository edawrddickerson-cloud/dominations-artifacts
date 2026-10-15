/* Authority: User-requested capture percentage and item-total benchmark, October 2026.
 * Ownership: Real crafting page/controller and responsive layout verification.
 * Invariants: Synthetic OCR does not establish recognition accuracy; scoring stays shared.
 * Constraints: The actual screenshot OCR is covered by the separate UI fixture. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw new Error(name);};
  const wait=async fn=>{const until=performance.now()+15000;while(!fn()){if(performance.now()>until)throw new Error('Timed out: '+get('result-status').textContent+' / total '+get('item-total').textContent+' / cutoff '+get('benchmark-value').textContent+' / '+get('comparison').textContent+' / axes '+get('off').checked+','+get('def').checked);await new Promise(resolve=>setTimeout(resolve,25));}};
  await wait(()=>get('names').children.length && window.DNStoredArtifacts && window.DNScannerComparisonCore);
  const bounds=element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right};};
  const visible=element=>{const rect=bounds(element);return rect.top>=0 && rect.bottom<=innerHeight && rect.left>=0 && rect.right<=innerWidth;};
  check('setup starts collapsed above summary',!get('setup').open && !!(get('setup').compareDocumentPosition(get('glance-board')) & Node.DOCUMENT_POSITION_FOLLOWING));
  check('old score category and hall strip removed',!document.querySelector('.scanner-score-controls') && !get('category-label') && !get('hall-label'));
  check('manual category correction moved out of top bar',!document.querySelector('.scanner-session').contains(get('compare-type')) && get('compare-type').closest('details').querySelector('summary').textContent==='Correct Recognition');
  check('empty capture begins red at zero',get('capture-percent').textContent==='0%' && getComputedStyle(get('glance-board')).getPropertyValue('--capture-hue').trim()==='0');
  get('auto').checked=false;get('collect').checked=false;
  document.getElementById('header-main').click();
  if(!get('off').checked)document.getElementById('header-off').click();
  if(!get('def').checked)document.getElementById('header-def').click();
  const perk='Heavy Tank Damage';DN.saveGlobalPerkRatings({[perk]:{offensive:1,defensive:1}});
  const rows=value=>Array.from({length:5},(_,i)=>({name:perk,value,base:value,max:value+9,level:1,levelSource:'crafting',known:true,hasPercent:true,raw:perk+' +'+value+'%',unlocked:i<2}));
  const complete=value=>({valid:true,rows:rows(value),artifact:{type:'Weapon',source:'calibrated-label'},hall:'main',hallSource:'hall-colour',unlocked:{count:2,states:[true,true,false,false,false]},warnings:[]});
  await DNStoredArtifacts.write(DNStoredArtifacts.collectionKey(),[11,6].map((value,index)=>({id:'baseline'+index,name:'Owned Weapon '+index,hall:'main',type:'Weapon',reviewed:true,rows:rows(value)})));
  window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,100));
  let response,pixel=0,delayed=null;
  DNScannerRecognition.create=()=>({recognize:async()=>delayed?await delayed.promise:JSON.parse(JSON.stringify(response)),close:async()=>{}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;
  async function read(result){response=result;pixel=(pixel+30)%240;canvas.getContext('2d').fillStyle='rgb('+pixel+','+pixel+','+pixel+')';canvas.getContext('2d').fillRect(0,0,640,320);DNScannerReading.update(canvas,{session:1,current:true});get('read').click();await wait(()=>!get('read').disabled);}
  await read(complete(11));await wait(()=>get('benchmark-value').textContent==='150');
  check('all 17 captured fields show 100 percent',get('capture-percent').textContent==='100%' && get('capture-detail').textContent==='17 / 17 fields captured' && get('capture-meter').value===100);
  check('complete capture is green',get('glance-board').style.getPropertyValue('--capture-hue')==='120');
  check('type total and same-type cutoff use shared maximum scores',get('item-type').textContent==='Weapon total' && get('item-total').textContent==='200' && get('benchmark-value').textContent==='150');
  check('qualifying top-two item is red',get('benchmark').classList.contains('is-top-two') && get('comparison').textContent==='Makes top 2' && getComputedStyle(get('benchmark')).backgroundColor==='rgb(87, 29, 36)');
  for(const id of ['glance-board','benchmark','capture-percent','item-total','benchmark-value'])check(id+' fits initial viewport',visible(get(id)));
  const captureFont=parseFloat(getComputedStyle(get('capture-percent')).fontSize),scoreFont=parseFloat(getComputedStyle(get('item-total')).fontSize);
  check('summary numbers are prominent',captureFont>=36 && scoreFont>=36);
  check('no horizontal overflow',document.documentElement.scrollWidth<=innerWidth+1);
  check('five-stat weighted rows remain visible',get('result').querySelectorAll('.scanner-stat-score').length===5 && [...get('result').querySelectorAll('.scanner-stat-score')].every(element=>element.textContent==='40'));
  const total=get('item-total').textContent,cutoff=get('benchmark-value').textContent;
  delayed={};delayed.promise=new Promise(resolve=>delayed.resolve=resolve);get('read').click();
  check('retry retains last score and benchmark explicitly',get('item-total').textContent===total && get('benchmark-value').textContent===cutoff && get('score-freshness').textContent.includes('LAST READ'));
  check('pending retry retains capture completeness with a last-read label',get('capture-percent').textContent==='100%' && get('capture-detail').textContent.includes('Last read'));
  check('all five weighted scores remain visible during retry',[...get('result').querySelectorAll('.scanner-stat-score')].every(element=>element.textContent==='40'));
  delayed.resolve(JSON.parse(JSON.stringify(response)));delayed=null;await wait(()=>!get('read').disabled);
  check('new current result restores completion and clears last-read label',get('capture-percent').textContent==='100%' && !get('score-freshness').textContent);
  window.scrollTo(0,document.body.scrollHeight);await new Promise(resolve=>requestAnimationFrame(resolve));
  check('both summary boxes stay pinned while scrolling',visible(get('glance-board')) && visible(get('benchmark')));window.scrollTo(0,0);
  await read(complete(6));check('tie does not qualify',get('comparison').textContent==='Ties benchmark' && !get('benchmark').classList.contains('is-top-two'));
  await read(complete(1));check('below-cutoff item is green',get('comparison').textContent==='Below top 2' && get('benchmark').classList.contains('is-below-cutoff'));
  const partial=complete(11);partial.valid=false;partial.rows[4]={name:'',value:null,known:false,unlocked:false};partial.warnings=['One stat unread'];
  await read(partial);
  check('unread name and percentage reduce completion',get('capture-percent').textContent==='88%' && get('capture-detail').textContent.startsWith('15 / 17'));
  check('optimistic score is marked without inflating captured fields',get('item-total').textContent.startsWith('~') && get('benchmark').classList.contains('is-provisional') && get('score-assumption').textContent.includes('4/5 read'));
  const unknownName=complete(1);unknownName.valid=false;unknownName.rows[4].known=false;unknownName.rows[4].name='Unknown stat';
  await read(unknownName);check('unrecognised name loses only its own field credit',get('capture-percent').textContent==='94%');
  const weights=()=>[...get('result').querySelectorAll('.scanner-stat-score')].map(element=>element.textContent).join('|');
  const heldWeights=weights(),heldColour=get('glance-board').style.getPropertyValue('--capture-hue');
  for(let attempt=0;attempt<3;attempt++) {
    delayed={};delayed.promise=new Promise(resolve=>delayed.resolve=resolve);get('read').click();
    check('94 percent remains visible throughout retry '+attempt,get('capture-percent').textContent==='94%' && get('glance-board').style.getPropertyValue('--capture-hue')===heldColour);
    check('partial-read weighted scores remain visible throughout retry '+attempt,weights()===heldWeights);
    delayed.resolve(JSON.parse(JSON.stringify(response)));delayed=null;await wait(()=>!get('read').disabled);
  }
  DNScannerReading.invalidate('Panel moved',{preserveDisplay:true});
  check('automatic panel movement retains percentage and weighted rows',get('capture-percent').textContent==='94%' && weights()===heldWeights && get('capture-detail').textContent.includes('Last read'));
  await read(unknownName);
  DNScannerReading.update(canvas,{session:1,current:false});
  check('paused capture retains numbers without presenting them as current',get('capture-percent').textContent==='94%' && weights()===heldWeights && get('score-freshness').textContent.includes('Capture paused'));
  await read(unknownName);
  const rowNodes=[...get('result').querySelectorAll('.scanner-perk')];
  window.dispatchEvent(new Event('focus'));
  check('unchanged refresh reuses stat rows',rowNodes.every((node,i)=>node===get('result').querySelectorAll('.scanner-perk')[i]));
  const weak=complete(1);weak.valid=false;weak.rows[3]={name:'',known:false,value:null,unlocked:false};weak.rows[4]={name:'',known:false,value:null,unlocked:false};
  await read(weak);check('too little stat evidence leaves benchmark available without a score',get('item-total').textContent==='—' && get('benchmark-value').textContent==='150' && get('capture-percent').textContent==='76%');
  const threeStars={...complete(1),unlocked:{count:3,states:[true,true,true,false,false]}};
  await read(threeStars);check('three stars alone do not turn a below-cutoff item red',!get('benchmark').classList.contains('is-top-two'));
  DNScannerReading.reset();check('reset clears score and captured fields',get('item-total').textContent==='—' && get('capture-percent').textContent==='0%');
  await read(complete(11));
  return {passed:Object.values(checks).every(Boolean),viewport:{width:innerWidth,height:innerHeight},ui:checks,captureFont,scoreFont,
    captureBounds:bounds(get('glance-board')),benchmarkBounds:bounds(get('benchmark')),limitations:'Actual page/controller and shared scoring tested with synthetic OCR responses. Real screenshot OCR is tested separately.'};
})()
