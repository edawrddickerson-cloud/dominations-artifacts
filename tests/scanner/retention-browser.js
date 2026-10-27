/* Accepted stats survive same-artifact movement and weaker real controller reads. */
(async()=>{
  const get=id=>document.getElementById('scanner-'+id),checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const wait=async fn=>{const until=performance.now()+10000;while(!fn()){if(performance.now()>until)throw Error('Retention UI timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
  await wait(()=>window.DNScannerReading && get('names').children.length);DNConsent?.set({});
  get('auto').checked=false;DNScannerCollection.isEnabled=()=>false;document.getElementById('header-war').click();
  const rows=Array.from({length:5},(_,i)=>({name:'Heavy Tank Damage',value:6,known:true,hasPercent:true,confidence:94,unlocked:i===0,level:1,levelSource:'crafting',rerollEligible:false}));
  const strong={valid:true,warnings:[],hall:'war',hallSource:'hall-colour',artifact:{name:'Retention fixture',type:'Weapon'},unlocked:{count:1,states:[true,false,false,false,false]},rows};
  let next=strong,release=null;DNScannerRecognition.create=()=>({warm:async()=>{},close:async()=>{},recognize:async()=>new Promise(resolve=>release=()=>{release=null;resolve(structuredClone(next));})});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;
  DNScannerReading.reset();DNScannerReading.update(canvas,{session:1,current:true});get('read').click();await wait(()=>release);release();await wait(()=>!get('read').disabled);
  const values=()=>[...get('result').querySelectorAll('[data-inline-field="value"]')].map(node=>node.textContent);
  const original=JSON.stringify(values());next={...strong,valid:false,rows:rows.map((row,i)=>i===2?{name:'',known:false,value:null,hasPercent:false}:{...row,confidence:45})};
  for(const reason of ['Panel moved','Field geometry refreshed']) {
    DNScannerReading.invalidate(reason,{preserveDisplay:true});DNScannerReading.update(canvas,{session:1,current:true});get('read').click();await wait(()=>release);release();await wait(()=>!get('read').disabled);
    check(reason+' preserves all five accepted percentages',JSON.stringify(values())===original);
    check(reason+' preserves the accepted stat name',get('result').querySelector('[data-inline-row="2"][data-inline-field="name"]').textContent==='Heavy Tank Damage');
  }
  get('read').click();await wait(()=>release);DNScannerReading.invalidate('Movement during retry',{preserveDisplay:true});release();await wait(()=>!get('read').disabled);
  check('stale in-flight results cannot erase accepted rows',JSON.stringify(values())===original);
  DNScannerReading.update(canvas,{session:1,current:true});get('read').click();await wait(()=>release);release();await wait(()=>!get('read').disabled);
  check('a later weak retry still retains the accepted rows',JSON.stringify(values())===original);
  next={...strong,rows:rows.map((row,i)=>i===2?{...row,value:3,confidence:99}:row)};
  get('read').click();await wait(()=>release);release();await wait(()=>!get('read').disabled);
  check('stronger evidence can replace an accepted percentage',values()[2]==='+3%');
  DNScannerReading.reset();return {passed:true,ui:checks};
})()
