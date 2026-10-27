/* Real pixels: wide category labels must recover from clipped field boxes. */
(async()=>{
  const checks={},runs=[],check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' '+JSON.stringify(runs.at(-1)));};
  const labels=await(await fetch('../tests/scanner/storage-coverage.labels.json')).json();
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json());
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=DNScannerRecognition.create({names,canonPerk}),saved=localStorage.getItem(DNStorageRegions.KEY);
  try {
    for(const type of ['War Legendary','Legendary','War Mythical']) {
      const label=labels.find(item=>item.type===type);
      const image=await createImageBitmap(await(await fetch('../tests/scanner/storage-'+label.stamp+'.png')).blob());
      const original=document.createElement('canvas');original.width=image.width;original.height=image.height;original.getContext('2d').drawImage(image,0,0);image.close();
      const region=DNStorageRecognition.detectPanel(original),rect=DNScannerCore.cropPixels(region,original.width,original.height);
      for(const variant of type==='War Legendary'?['native','clipped','shifted','small','prefix','dim']:['clipped']) {
        const scale=variant==='small'?.6:1,source=document.createElement('canvas');source.width=Math.round(rect.width*scale);source.height=Math.round(rect.height*scale);
        source.getContext('2d').drawImage(original,rect.x,rect.y,rect.width,rect.height,0,0,source.width,source.height);
        if(variant==='dim') {
          const ctx=source.getContext('2d'),pixels=ctx.getImageData(0,0,source.width,source.height);
          for(let y=Math.floor(source.height*.425);y<source.height*.51;y++)for(let x=Math.floor(source.width*.06);x<source.width*.26;x++) {
            const p=(y*source.width+x)*4;for(let channel=0;channel<3;channel++)pixels.data[p+channel]*=.55;
          }
          ctx.putImageData(pixels,0,0);
        }
        const template=DNStorageRegions.defaults(source.width/source.height,label.rows.length);
        if(variant==='clipped'){template.category.x+=.075;template.category.width=.065;}
        if(variant==='shifted'){template.category.y+=.035;template.category.height=.024;}
        if(variant==='prefix'){template.category.x=.125;template.category.width=.13;}
        const before=JSON.stringify(template),result=await engine.recognize(source,{layout:'storage',fields:{template}});
        runs.push({type,variant,actual:result.artifact.type,raw:result.artifact.rawType,evidence:result.artifact.categoryEvidence});
        check(type+' '+variant+' category',result.artifact.type===type && !result.artifact.categoryUnclear);
        check(type+' '+variant+' signed stats',result.rows.length===label.rows.length && result.rows.every((row,i)=>row.name===canonPerk(label.rows[i].name) && row.value===label.rows[i].value));
        check(type+' '+variant+' calibration unchanged',JSON.stringify(template)===before && localStorage.getItem(DNStorageRegions.KEY)===saved);
        source.width=source.height=0;
      }
      original.width=original.height=0;
    }
    return {passed:true,ui:checks,runs};
  } finally {await engine.close();}
})()
