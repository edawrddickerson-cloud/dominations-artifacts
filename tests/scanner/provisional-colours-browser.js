/* Display contract regression: exercise the actual multi-strategy renderer.
 * OCR is synthetic; score colour must follow displayed numbers even when the
 * separate capture/confirmation state is provisional or incomplete. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw Error(name+' / '+get('comparison').textContent+' / '+get('benchmark').className);};
  async function wait(test){const end=performance.now()+15000;while(!test()){if(performance.now()>end)throw Error('Loading timed out / '+get('hall').value+' / '+get('compare-type').value+' / '+get('benchmark-value').textContent+' / '+get('comparison').textContent);await new Promise(resolve=>setTimeout(resolve,20));}}
  await wait(()=>window.DNScannerComparison && window.DNStoredArtifacts && get('names').children.length);
  document.getElementById('header-main').click();
  const core=DNScannerComparisonCore,store=DNStoredArtifacts;
  const rows=(value,name='Heavy Tank Damage')=>Array.from({length:5},(_,i)=>({name,value,known:true,hasPercent:true,level:1,levelSource:'crafting',base:value,max:value+9,unlocked:i<2,rerollEligible:false,rerollSource:'manual'}));
  const owned=[11,20].map((value,index)=>({id:'colour-owned-'+index,name:'Owned '+index,hall:'main',type:'Weapon',rows:rows(value,'Fighter Damage')}));
  await store.write(store.collectionKey(),owned);
  const base={canonPerk:name=>name,ratingOf:()=>1,scoreMode:'combined',prefSortAxes:{offensive:true,defensive:false}};
  const strategies=['first','second'].map(id=>({id,name:id,options:{...base,strategyId:id}}));
  const options={...base,strategyId:'first',strategyName:'first',strategyOptions:strategies};
  const craft=value=>({valid:true,rows:rows(value),hall:'main',hallSource:'hall-colour',artifact:{type:'Weapon'},unlocked:{count:2,states:[true,true,false,false,false]},warnings:[]});
  const publish=(raw,opts=options)=>DNScannerComparison.update(core.estimate(raw),true,opts,{captureResult:raw});
  const red=()=>getComputedStyle(get('benchmark')).backgroundColor==='rgb(87, 29, 36)';
  const seed=await store.read(store.collectionKey());
  check('owned comparison fixture is persisted',seed.length===2);
  const expected=core.compare(core.estimate(craft(1)),{type:'Weapon',hall:'main',owned:seed.map(item=>store.toRow(item)),options:base,limit:2});
  check('owned fixture has its expected numeric cutoff',expected.threshold===100);
  window.dispatchEvent(new Event('focus'));publish(craft(1));
  await wait(()=>get('benchmark-value').textContent==='100');
  check('test exercises both strategy comparison rows',get('strategy-results').querySelectorAll('tbody tr').length===2);
  check('verified lower score is red',red());

  const inferred=craft(1);inferred.valid=false;inferred.rows[0].inferred=true;
  publish(inferred);
  check('inferred lower total remains visible and red',get('item-total').textContent==='~50' && red());
  check('estimated comparison keeps its uncertainty indicator',get('benchmark').classList.contains('is-provisional') && get('comparison').textContent.includes('Estimated'));
  const partial=craft(1);partial.valid=false;partial.rows[4]={name:'',known:false,value:null};
  publish(partial);
  check('lower incomplete subtotal is red across selected strategies',get('item-total').textContent==='~40' && red());
  check('capture completeness stays independent of score colour',get('capture-meter').value<100 && get('glance-board').classList.contains('is-incomplete'));
  const suggested=craft(1);suggested.valid=false;suggested.rows[4].assumed=true;
  publish(suggested);
  check('an uncertain name does not suppress a red displayed subtotal',get('item-total').textContent==='~40' && red());
  const dice=craft(1);dice.rows.forEach(row=>{row.rerollEligible=null;row.rerollSource='dice-background';});
  publish(dice);
  check('uncertain reroll points do not suppress red',get('item-total').textContent==='~50' && red());
  const threeStars=craft(1);threeStars.unlocked={count:3,states:[true,true,true,false,false]};
  publish(threeStars);
  check('three unlocked stats keep their reason without hiding a lower red score',red() && !get('keeper-reason').hidden);

  const mixed={...options,strategyOptions:[strategies[0],{...strategies[1],options:{...strategies[1].options,ratingOf:name=>name==='Heavy Tank Damage'?5:1}}]};
  publish(inferred,mixed);
  check('an estimated improvement in another selected strategy is not all-below',!red());
  publish(craft(11));
  check('equal scores are not lower',!red());
  DNScannerComparison.update(core.estimate(inferred),false,options,{captureResult:inferred});
  check('a paused or unavailable comparison is not a lower numeric score',get('item-total').textContent==='—' && !red());
  await store.write(store.collectionKey(),owned.slice(0,1));
  window.dispatchEvent(new Event('focus'));publish(inferred);
  await wait(()=>get('benchmark-value').textContent==='Open slot');
  check('an open slot is not a lower benchmark',!red());
  return {passed:true,ui:checks};
})();
