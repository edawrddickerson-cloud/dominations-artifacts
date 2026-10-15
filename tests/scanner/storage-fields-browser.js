(async()=>{
  const get=id=>document.getElementById('scanner-'+id),field=id=>get('fields-'+id),G=window.DNStorageRegions,checks={};
  const check=(name,value)=>{checks[name]=!!value;if(!value)throw new Error(name);};
  const wait=async fn=>{const end=performance.now()+30000;while(!fn()){if(performance.now()>end)throw new Error('Timed out: '+get('result-status').textContent+' / '+field('status').textContent);await new Promise(resolve=>setTimeout(resolve,30));}};
  const fire=node=>node.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>get('names').children.length);get('auto').checked=false;get('setup').open=true;
  check('storage calibration disabled before a selected source',field('edit').disabled);
  const crafting=localStorage.getItem(window.DNScannerRegions.KEY);
  const transfer=new DataTransfer();transfer.items.add(new File([await(await fetch('../tests/scanner/storage-kusarigama.png')).blob()],'storage.png',{type:'image/png'}));get('file').files=transfer.files;fire(get('file'));
  await wait(()=>!field('edit').disabled);
  field('edit').click();check('storage calibration pauses reads on a frozen image',!field('editor').hidden && get('read').disabled);
  check('storage fields include percentages levels stars dice and identity',field('field').options.length===29 && Array.from(field('field').options).some(option=>option.value==='4-level') && Array.from(field('field').options).some(option=>option.value==='title'));
  field('save').click();await wait(()=>field('editor').hidden && !get('read').disabled);
  check('storage boxes persist independently of crafting',G.valid(G.load(5)) && localStorage.getItem(window.DNScannerRegions.KEY)===crafting && !localStorage.getItem(G.KEY).includes('data:image'));
  let seen=null;const record=window.DNScannerCollection.record;window.DNScannerCollection.record=result=>{seen=result;record(result);};
  get('read').click();await wait(()=>get('progress').textContent.startsWith('Finished'));
  check('actual OCR uses calibrated storage boxes',seen?.recognitionPath==='storage-calibrated-fields');
  check('calibrated OCR preserves five signed stats',seen.rows.length===5 && seen.rows.every((row,i)=>row.value===[13,6,11,1,1][i]) && seen.rows.every(row=>row.known));
  check('storage name category and image survive calibration',seen.artifact.name==='Kusarigama' && seen.artifact.type==='Weapon' && seen.artifact.image?.startsWith('data:image'));
  const five=G.load(5);get('rows').value='6';fire(get('rows'));field('edit').click();
  check('six-row calibration offers six upgrade levels',Array.from(field('field').options).some(option=>option.value==='5-level'));
  field('save').click();check('five and six row templates coexist',G.valid(G.load(6)) && JSON.stringify(G.load(5))===JSON.stringify(five));
  field('reset').click();check('reset clears only the current row count',!G.load(6) && !!G.load(5));
  get('rows').value='5';fire(get('rows'));
  field('edit').click();field('field').value='0-name';fire(field('field'));field('x').value='-20';field('x').dispatchEvent(new Event('input',{bubbles:true}));
  check('invalid storage fields cannot be saved',field('save').disabled);field('cancel').click();
  check('cancel preserves saved storage geometry',JSON.stringify(G.load(5))===JSON.stringify(five));
  return {passed:Object.values(checks).every(Boolean),ui:checks};
})()
