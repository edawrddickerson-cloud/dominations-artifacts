/* Latest two gameplay screenshots: blue War texture must not establish a tier. */
(async()=>{
  const checks={},runs=[],check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name+' '+JSON.stringify(runs.at(-1)));};
  const labels=await(await fetch('../tests/scanner/war-crafting-colours.json')).json(),R=DNScannerRecognition,G=DNScannerRegions;
  const names=Object.keys(await(await fetch('data/perk_rating_defaults.json')).json()),canonPerk=DN.makeCanonPerk(DN.parseMappingCsv(await(await fetch('data/perk_name_mapping.csv')).text()));
  const engine=R.create({names,canonPerk});
  try {
    for(const label of labels) {
      const image=await createImageBitmap(await(await fetch('../tests/scanner/'+label.fixture+'.png')).blob());
      const frame=document.createElement('canvas');frame.width=image.width;frame.height=image.height;frame.getContext('2d').drawImage(image,0,0);image.close();
      const expectedColours=label.rows.map(row=>row.colour),expectedValues=label.rows.map(row=>row.value);
      for(const scale of [1,.6,1.5]) {
        const p=label.panel,text=document.createElement('canvas'),roi={x:p.x+p.width*.115,y:p.y+p.height*.275,width:p.width*.84,height:p.height*.657};
        text.width=Math.round(roi.width*scale);text.height=Math.round(roi.height*scale);const ctx=text.getContext('2d');ctx.drawImage(frame,roi.x,roi.y,roi.width,roi.height,0,0,text.width,text.height);
        const colours=R.rowColours(ctx.getImageData(0,0,text.width,text.height).data,text.width,text.height);
        runs.push({fixture:label.fixture,kind:'colours',scale,colours,expected:expectedColours});
        check(label.fixture+' '+scale+' foreground tiers',JSON.stringify(colours)===JSON.stringify(expectedColours));
        const inferred=R.inferColourValues({valid:false,warnings:[],rows:label.rows.map(row=>({name:canonPerk(row.name),known:true,value:null,hasPercent:false}))},colours,'war');
        check(label.fixture+' '+scale+' white rows never infer six percent',inferred.rows.every((row,i)=>row.value===expectedValues[i]));
        text.width=text.height=0;
      }
      const panel={x:label.panel.x/frame.width,y:label.panel.y/frame.height,width:label.panel.width/frame.width,height:label.panel.height/frame.height};
      const crop=document.createElement('canvas');crop.width=label.panel.width;crop.height=label.panel.height;crop.getContext('2d').drawImage(frame,label.panel.x,label.panel.y,crop.width,crop.height,0,0,crop.width,crop.height);
      const template=G.defaults(crop.width/crop.height),c=label.categoryBox;
      // Tight row boxes retain the complete names and percentages while
      // excluding the unused map artwork to the right of the text.
      template.rows.forEach(row=>{row.name.y+=row.name.height*.20;row.name.height*=.60;row.name.width=.50;row.percentage={...row.name};});
      template.category=G.fromSource({x:c.x/frame.width,y:c.y/frame.height,width:c.width/frame.width,height:c.height/frame.height},panel);
      for(const calibrated of [false,true]) {
        const result=await engine.recognize(crop,{layout:'panel',hall:'war',inferColours:true,...(calibrated?{fields:{template,panel,source:frame,panelSource:crop}}:{})});
        runs.push({fixture:label.fixture,kind:calibrated?'calibrated':'standard',colours:result.colours,rows:result.rows.map(row=>({name:row.name,value:row.value,inferred:row.inferred,tierConflict:row.tierConflict})),warnings:result.warnings});
        check(label.fixture+' '+(calibrated?'calibrated':'standard')+' no false percentages',result.rows.length===5 && result.rows.every((row,i)=>row.value===null || row.value===label.rows[i].value));
        check(label.fixture+' '+(calibrated?'calibrated':'standard')+' exact OCR values',result.rows.every((row,i)=>row.name===canonPerk(label.rows[i].name) && row.value===label.rows[i].value));
        check(label.fixture+' '+(calibrated?'calibrated':'standard')+' exact tiers',JSON.stringify(result.colours)===JSON.stringify(expectedColours) && !result.rows.some(row=>row.tierConflict));
      }
      crop.width=crop.height=frame.width=frame.height=0;
    }
    return {passed:true,ui:checks,runs};
  } finally {await engine.close();}
})()
