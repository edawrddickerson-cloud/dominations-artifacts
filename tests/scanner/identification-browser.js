/* Actual crafting controller and DOM, with synthetic OCR to verify identification
 * totals, field provenance, correction navigation and the manual-entry gate. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' / '+get('capture-percent').textContent+' / '+get('capture-detail').textContent+' / '+get('keep').title);};
  async function wait(test){const end=performance.now()+10000;while(!test()){if(performance.now()>end)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}}
  await wait(()=>get('names').children.length);
  get('auto').checked=false;get('collect').checked=false;
  const name='Heavy Tank Damage';
  const complete=()=>({valid:true,warnings:[],hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon'},unlocked:{count:2,states:[true,true,false,false,false]},
    rows:Array.from({length:5},(_,i)=>({name,value:11,known:true,hasPercent:true,unlocked:i<2,level:1,levelSource:'crafting',rerollEligible:true,rerollSource:'fresh-craft'}))});
  let response,pixel=0;
  window.DNScannerRecognition.create=()=>({recognize:async()=>structuredClone(response),close:async()=>{}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  async function read(next){response=next;pixel=(pixel+60)%240;canvas.getContext('2d').fillStyle='rgb('+pixel+','+pixel+','+pixel+')';canvas.getContext('2d').fillRect(0,0,640,360);window.DNScannerReading.update(canvas,{session:1,current:true});get('read').click();await wait(()=>!get('read').disabled && get('correct').querySelectorAll('.scanner-perk-name').length===5);}
  const edit=(input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
  check('empty identification starts at zero',get('capture-percent').textContent==='0/17 identified');
  const missing=complete();missing.valid=false;missing.rows[4].name='';missing.rows[4].known=false;
  await read(missing);
  check('one unknown field is amber without an extra warning line',get('capture-percent').textContent==='16/17 identified' && getComputedStyle(get('glance-board')).backgroundColor==='rgb(88, 64, 24)' && get('capture-review').hidden && get('capture-review').textContent==='' && get('keep').disabled);
  const incompleteBarHeight=get('glance-board').getBoundingClientRect().height;
  get('corrections').open=true;
  const nameInput=get('correct').querySelectorAll('.scanner-perk-name')[4];
  edit(nameInput,name);
  check('typed name completes identification immediately',get('capture-percent').textContent==='17/17 identified' && get('capture-detail').textContent==='16 read · 0 inferred · 1 typed' && get('capture-review').hidden);
  check('incomplete and complete bar heights stay equal',get('glance-board').getBoundingClientRect().height===incompleteBarHeight);
  get('accept').click();
  check('applying edits preserves source counts and enables Keep',get('capture-detail').textContent==='16 read · 0 inferred · 1 typed' && !get('keep').disabled);
  const inferred=complete();inferred.valid=false;inferred.rows[3].inferred=true;inferred.hallSource='percentage-tier';
  await read(inferred);
  check('inferred percentage and hall both count as identified',get('capture-percent').textContent==='17/17 identified' && get('capture-detail').textContent==='15 read · 2 inferred · 0 typed' && get('capture-review').hidden && !get('keep').disabled);
  edit(get('correct').querySelector('.scanner-perk-name'),name);get('accept').click();
  check('unrelated correction preserves inferred provenance',get('capture-detail').textContent==='14 read · 2 inferred · 1 typed');
  edit(get('correct').querySelectorAll('.scanner-perk-value')[3],'11');get('accept').click();
  check('typing an inferred percentage changes only its source',get('capture-detail').textContent==='14 read · 1 inferred · 2 typed');
  edit(get('correct').querySelector('.scanner-perk-value'),'-11');
  check('invalid signed values still require manual entry',get('capture-percent').textContent==='16/17 identified' && get('capture-review').hidden && get('keep').disabled);
  const unknownType=complete();unknownType.artifact={};await read(unknownType);
  check('unknown category needs entry',get('capture-percent').textContent==='16/17 identified' && get('capture-review').hidden && get('keep').disabled);
  get('compare-type').value='weapon';get('compare-type').dispatchEvent(new Event('change',{bubbles:true}));
  check('explicit category entry completes identification',get('capture-percent').textContent==='17/17 identified' && get('capture-detail').textContent==='16 read · 0 inferred · 1 typed' && !get('keep').disabled);
  window.dispatchEvent(new Event('focus'));
  check('background refresh retains explicit category',get('capture-detail').textContent==='16 read · 0 inferred · 1 typed');
  await read(unknownType);
  check('a new artifact requires its own category entry',get('capture-percent').textContent==='16/17 identified' && get('keep').disabled);
  const unknownHall=complete();unknownHall.hallSource='selected-hall';await read(unknownHall);
  check('remembered hall is unknown',get('capture-percent').textContent==='16/17 identified' && get('correct-hall').value==='' && get('keep').disabled);
  get('correct-hall').value='main';get('correct-hall').dispatchEvent(new Event('change',{bubbles:true}));
  check('explicit hall entry completes identification',get('capture-percent').textContent==='17/17 identified' && get('capture-detail').textContent==='16 read · 0 inferred · 1 typed' && !get('keep').disabled);
  const unknownStar=complete();unknownStar.unlocked.states[4]=null;unknownStar.rows[4].unlocked=null;await read(unknownStar);
  check('unknown star requires manual entry',get('capture-percent').textContent==='16/17 identified' && get('keep').disabled);
  get('correct').querySelectorAll('.scanner-perk-unlocked')[4].click();get('accept').click();
  check('explicit star entry counts as typed',get('capture-percent').textContent==='17/17 identified' && get('capture-detail').textContent==='16 read · 0 inferred · 1 typed');
  const settled=complete();settled.rows.forEach(row=>row.confidence=90);await read(settled);
  check('complete read starts at seventeen',get('capture-percent').textContent==='17/17 identified');
  response=complete();response.valid=false;response.artifact={};response.hallSource='selected-hall';
  response.unlocked={states:[null,null,null,null,null],count:null};
  response.rows.forEach(row=>row.unlocked=null);response.rows[2]={name:'',value:null,known:false,unlocked:null};
  get('read').click();await wait(()=>!get('read').disabled);
  check('same artifact uncertainty cannot reduce seventeen identified fields',get('capture-percent').textContent==='17/17 identified' && get('capture-detail').textContent==='17 read · 0 inferred · 0 typed' && !get('keep').disabled);
  response=complete();response.rows.forEach(row=>row.confidence=90);response.rows[2]={...response.rows[2],value:6,confidence:98};
  get('read').click();await wait(()=>!get('read').disabled);
  check('more confident stat correction keeps seventeen identified fields',get('capture-percent').textContent==='17/17 identified' && get('result').querySelectorAll('.scanner-stat-value')[2].textContent==='+6%');
  response=complete();response.rows.forEach(row=>row.confidence=90);
  get('read').click();await wait(()=>!get('read').disabled);
  check('weaker old stat cannot reverse the accepted correction',get('capture-percent').textContent==='17/17 identified' && get('result').querySelectorAll('.scanner-stat-value')[2].textContent==='+6%');
  await read(missing);get('corrections').open=false;window.scrollTo(0,0);
  const board=get('glance-board').getBoundingClientRect();
  check('bar fits the viewport without horizontal overflow',board.left>=0 && board.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth+1);
  return {passed:Object.values(checks).every(Boolean),ui:checks,viewport:{width:innerWidth,height:innerHeight}};
})()
