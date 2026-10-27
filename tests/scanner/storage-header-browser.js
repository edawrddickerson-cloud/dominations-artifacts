/* Real header pixels: bounded title recovery and dim gold category lettering. */
(async()=>{
  const checks={},runs=[],check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' '+JSON.stringify(runs.at(-1)));};
  const labels=await(await fetch('../tests/scanner/storage-coverage.labels.json')).json();
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json());
  const canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const normalized=text=>String(text).normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();
  const engine=DNScannerRecognition.create({names,canonPerk}),saved=localStorage.getItem(DNStorageRegions.KEY);
  try {
    for(const label of labels) {
      const image=await createImageBitmap(await(await fetch('../tests/scanner/storage-'+label.stamp+'.png')).blob());
      const original=document.createElement('canvas');original.width=image.width;original.height=image.height;original.getContext('2d').drawImage(image,0,0);image.close();
      const panel=DNStorageRecognition.detectPanel(original),rect=DNScannerCore.cropPixels(panel,original.width,original.height);
      const variants=['title-left','title-right','title-shifted','title-dim',...(/Mythical$/.test(label.type)?['banner-dim']:[]),...(label.type==='War Legendary'?['title-oversized']:[])];
      for(const variant of variants) {
        const source=document.createElement('canvas');source.width=rect.width;source.height=rect.height;
        const ctx=source.getContext('2d');ctx.drawImage(original,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
        const template=DNStorageRegions.defaults(source.width/source.height,label.rows.length);
        if(variant==='title-left'){template.title.x+=.15;template.title.width-=.15;}
        if(variant==='title-right')template.title.width*=.65;
        if(variant==='title-shifted')template.title.y+=.08;
        if(variant==='title-oversized')template.title={x:.30,y:.005,width:.66,height:.35};
        if(variant==='title-dim' || variant==='banner-dim') {
          const pixels=ctx.getImageData(0,0,source.width,source.height),box=variant==='title-dim'?{x:.30,y:0,width:.57,height:.13}:{x:.06,y:.425,width:.20,height:.085};
          for(let y=Math.floor(source.height*box.y);y<source.height*(box.y+box.height);y++)for(let x=Math.floor(source.width*box.x);x<source.width*(box.x+box.width);x++) {
            const p=(y*source.width+x)*4;for(let channel=0;channel<3;channel++)pixels.data[p+channel]*=.55;
          }
          ctx.putImageData(pixels,0,0);
        }
        const before=JSON.stringify(template),result=await engine.recognize(source,{layout:'storage',fields:{template}});
        const artifact=result.artifact;
        runs.push({fixture:label.type,variant,actual:artifact.name,expected:label.name,titleUnclear:artifact.titleUnclear,titleEvidence:artifact.titleEvidence,categoryEvidence:artifact.categoryEvidence});
        check(label.type+' '+variant+' complete title',normalized(artifact.name)===normalized(label.name));
        check(label.type+' '+variant+' verified title',!artifact.titleUnclear && !artifact.titleConflict);
        check(label.type+' '+variant+' category',artifact.type===label.type && !artifact.categoryUnclear);
        check(label.type+' '+variant+' signed stats',result.rows.length===label.rows.length && result.rows.every((row,i)=>row.name===canonPerk(label.rows[i].name) && row.value===label.rows[i].value));
        check(label.type+' '+variant+' calibration unchanged',JSON.stringify(template)===before && localStorage.getItem(DNStorageRegions.KEY)===saved);
        check(label.type+' '+variant+' recovery stays inside header',artifact.titleEvidence.filter(read=>read.complete).every(read=>read.box.x>=.302 && read.box.y>=.016 && read.box.x+read.box.width<=.868 && read.box.y+read.box.height<=.132));
        check(label.type+' '+variant+' bounded title reads',artifact.titleEvidence.length<=8);
        if(variant!=='banner-dim')check(label.type+' '+variant+' distinct corroborating crops',new Set(artifact.titleEvidence.filter(read=>read.complete && read.confidence>=80 && normalized(read.text)===normalized(label.name)).map(read=>read.pixelKey)).size>=2);
        if(variant==='banner-dim')check(label.type+' adaptive gold banner evidence',artifact.categoryEvidence.some(read=>read.ink==='gold'));
        source.width=source.height=0;
      }
      original.width=original.height=0;
    }
    return {passed:true,ui:checks,runs};
  } finally {await engine.close();}
})()
