/* Real storage pixels: expansion recovers clipping without saving geometry. */
(async()=>{
  const checks={},check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
  const G=DNStorageRegions,R=DNScannerRecognition;
  const source=await createImageBitmap(await(await fetch('../tests/scanner/storage-kusarigama.png')).blob());
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json());
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=R.create({names,canonPerk}),template=G.defaults(source.width/source.height,5);
  const saved=localStorage.getItem(G.KEY);
  try {
    const clear=await engine.recognize(source,{layout:'storage',fields:{template}});
    check('clear storage percentages match independent labels',clear.rows.every((row,i)=>row.value===[13,6,11,1,1][i]));
    check('clear storage scans skip fitting',clear.evidence.every(row=>!row.label.autoFit && !row.amount.autoFit));
    for(const kind of ['name','percentage']) {
      const index=kind==='name'?1:0,expected=clear.rows[index];
      const narrow=G.copy(template),box=narrow.rows[index][kind],fraction=kind==='name'?.6:.5;
      box.x+=box.width*(1-fraction)/2;box.width*=fraction;
      const before=JSON.stringify(narrow);
      const baseline=await engine.recognize(source,{layout:'storage',fields:{template:narrow},autoFit:false});
      const result=await engine.recognize(source,{layout:'storage',fields:{template:narrow}});
      const fitted=result.evidence[index][kind==='name'?'label':'amount'];
      check(kind+' crop starts unclear',kind==='name'?baseline.rows[index].assumed || baseline.rows[index].name!==expected.name:baseline.rows[index].value!==expected.value || baseline.evidence[index].amount.confidence<80);
      check(kind+' crop recovers by automatic expansion',!!fitted.autoFit && result.rows[index].name===expected.name && result.rows[index].value===expected.value);
      check(kind+' fit preserves other storage rows',result.rows.every((row,i)=>i===index || row.name===clear.rows[i].name && row.value===clear.rows[i].value));
      check(kind+' fit leaves saved calibration unchanged',JSON.stringify(narrow)===before && localStorage.getItem(G.KEY)===saved);
    }
    return {passed:true,checks};
  } finally {await engine.close();source.close();}
})();
