/* Authority: User-approved independent field crops, October 2026.
 * Ownership: Calibrated crafting OCR; benefits ribbon colour determines the hall.
 * Invariants: Original signs required; no missing value fabrication; duplicates keep
 * row indices; conflicting/weak reads need review; worker parameters always restored.
 * Constraints: Box calibration does not recover clipped or unreadable pixels.
 * History: Red ribbon means Main; blue means War. Category crops isolate green ink. */
(() => {
  'use strict';
  const R=()=>window.DNScannerRecognition;
  function snapshot(fields) {
    const resolved=window.DNScannerRegions.resolve(fields.template,fields.panel,fields.source);
    if(!resolved.valid)return resolved;
    const crops={};
    const release=()=>{for(const canvas of Object.values(crops))canvas.width=canvas.height=0;};
    try {
      for(const [id,rect] of Object.entries(resolved.boxes)) {
        if(rect.width*rect.height>4000000){release();return {valid:false,reason:'Field crop is too large. Recalibrate at a smaller resolution.'};}
        const canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;
        const field=window.DNScannerRegions.fields(fields.template).find(field=>field.id===id);
        // Dice controls always freeze from the original frame. A channel-wise
        // median during a button transition must not manufacture eligibility.
        const temporal=field.kind!=='dice' && field.index!==undefined && fields.panelSource && window.DNScannerRegions.validBox(field.box);
        const input=temporal?fields.panelSource:fields.source;
        const box=temporal?window.DNScannerCore.cropPixels(field.box,input.width,input.height):rect;
        canvas.getContext('2d').drawImage(input,box.x,box.y,box.width,box.height,0,0,rect.width,rect.height);crops[id]=canvas;
      }
      if(!crops.hall) {
        const input=fields.panelSource || fields.source;
        const box=fields.panelSource?{x:0,y:0,width:input.width,height:input.height}:
          window.DNScannerCore.cropPixels(fields.panel,input.width,input.height);
        const rect={x:box.x+Math.floor(box.width*.03),y:box.y+Math.floor(box.height*.04),width:Math.max(1,Math.floor(box.width*.55)),height:Math.max(1,Math.floor(box.height*.20))};
        const canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;
        canvas.getContext('2d').drawImage(input,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
        crops['hall-banner']=canvas;
      }
      return {valid:true,crops,release,diceRequested:fields.template.rows.map(row=>!!row.dice),unavailable:resolved.unavailable || {}};
    }catch(error){release();throw error;}
  }
  function view(source,mode='contrast') {
    const canvas=document.createElement('canvas'),scale=Math.min(4,Math.max(2,64/source.height));
    canvas.width=Math.ceil(source.width*scale)+32;canvas.height=Math.ceil(source.height*scale)+24;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    const raw=document.createElement('canvas');raw.width=Math.ceil(source.width*scale);raw.height=Math.ceil(source.height*scale);
    const rawCtx=raw.getContext('2d',{willReadFrequently:true});rawCtx.drawImage(source,0,0,raw.width,raw.height);
    const pixels=rawCtx.getImageData(0,0,raw.width,raw.height);let ink=0;
    for(let i=0;i<pixels.data.length;i+=4) {
      const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
      const saturated=mode==='category'?g>60 && g>r*1.25 && g>b*1.05:Math.max(g,b)>r*1.8 && Math.max(g,b)>25;
      const value=mode==='colour' || mode==='category'?saturated?0:255:R().textContrast(r,g,b);
      if(saturated)ink++;
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;
    }
    rawCtx.putImageData(pixels,0,0);ctx.drawImage(raw,16,12);raw.width=raw.height=0;
    return {canvas,ink};
  }
  function starFill(source) {
    const data=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data;
    let yellow=0;for(let i=0;i<data.length;i+=4)if(data[i]>160 && data[i+1]>100 && data[i+2]<data[i+1]*.8)yellow++;
    return yellow/(data.length/4);
  }
  function coloursOf(crops) {
    // Reuse the existing colour classifier on five equal-sized name crops.
    const canvas=document.createElement('canvas');canvas.width=Math.max(...crops.map(c=>c.width));
    const height=Math.max(...crops.map(c=>c.height));canvas.height=height*5;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    crops.forEach((crop,i)=>ctx.drawImage(crop,0,i*height,canvas.width,height));
    const colours=R().rowColours(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
    canvas.width=canvas.height=0;return colours;
  }
  async function recognize(snapshot,{worker,readView,names,canonPerk,hall='main',inferColours=false,categorySource,isClosed,ocrCalls}) {
    const rerolls=Array.from({length:5},(_,i)=>{
      if(!snapshot.diceRequested?.[i] && !snapshot.crops[i+'-dice'])return null;
      return snapshot.crops[i+'-dice']?window.DNScannerRerollRecognition?.classifyCanvas(snapshot.crops[i+'-dice']) ||
        {rerollEligible:null,rerollSource:'dice-background',rerollConfidence:'unknown',rerollEvidence:{reason:'detector-unavailable'}}:
        window.DNScannerRerollRecognition?.unknown(snapshot.unavailable?.[i+'-dice'] || 'missing') ||
        {rerollEligible:null,rerollSource:'dice-background',rerollConfidence:'unknown'};
    });
    const check=()=>{if(isClosed())throw new Error('Recognition stopped');};
    const evidence=output=>{
      const lines=(output.data.blocks || []).flatMap(b=>(b.paragraphs || []).flatMap(p=>p.lines || []));
      return {text:String(output.data.text || '').trim(),confidence:lines.length?Math.min(...lines.map(line=>line.confidence)):0,words:lines.flatMap(line=>line.words || [])};
    };
    async function read(source,kind,mode='contrast',segmentation='7') {
      check();const prepared=view(source,mode);
      if((mode==='colour' || mode==='category') && prepared.ink<30){prepared.canvas.width=prepared.canvas.height=0;return null;}
      try {
        let rectangle=null,guide=null,guideConfidence=0;
        if(kind==='percentage' && source.width/source.height>5) {
          // Percentages follow variable-length names. For a deliberately wide
          // percentage box, locate its numeric suffix within that same crop.
          // This independent layout pass never borrows the name crop's text.
          await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
          guide=evidence(await readView(prepared.canvas,{}, {text:true,blocks:true}));check();
          const words=guide.words,last=words.findLastIndex(word=>/\d/.test(word.text || '') && word.bbox);
          if(last>=0) {
            const tail=[words[last]];
            if(last && /^[+-]$/.test(words[last-1].text.trim()) && words[last-1].bbox)tail.unshift(words[last-1]);
            if(words[last+1]?.bbox && /%/.test(words[last+1].text))tail.push(words[last+1]);
            guideConfidence=Math.min(...tail.map(word=>Number.isFinite(word.confidence)?word.confidence:0));
            const minX=Math.min(...tail.map(w=>w.bbox.x0)),maxX=Math.max(...tail.map(w=>w.bbox.x1)),
              minY=Math.min(...tail.map(w=>w.bbox.y0)),maxY=Math.max(...tail.map(w=>w.bbox.y1)),padding=(maxY-minY)*.55;
            const left=Math.max(0,Math.floor(minX-padding)),top=Math.max(0,Math.floor(minY-padding));
            rectangle={left,top,width:Math.min(prepared.canvas.width,Math.ceil(maxX+padding))-left,height:Math.min(prepared.canvas.height,Math.ceil(maxY+padding))-top};
          }
        }
        await worker.setParameters({tessedit_pageseg_mode:segmentation,tessedit_char_whitelist:kind==='percentage'?'+-0123456789.,%':kind==='category'?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ':''});
        const output=await readView(prepared.canvas,rectangle?{rectangle}:{}, {text:true,blocks:true});check();
        const result=evidence(output);
        if(guide) {
          const suffix=/([+-]\s*\d+(?:[.,]\d+)?)\s*%\s*$/.exec(guide.text),value=/^([+-]\s*\d+(?:[.,]\d+)?)\s*%$/.exec(result.text);
          if(suffix && value) {
            if(Number(suffix[1].replace(/\s/g,'').replace(',','.'))!==Number(value[1].replace(/\s/g,'').replace(',','.')))result.conflict=true;
            else {result.corroborated=true;result.focusedConfidence=result.confidence;result.guideConfidence=guideConfidence;result.confidence=Math.max(result.confidence,guideConfidence);}
          }
        }
        return result;
      }finally {prepared.canvas.width=prepared.canvas.height=0;}
    }
    const fields=[],firstRows=[],firstWarnings=[];
    for(let i=0;i<5;i++) {
      const name=await read(snapshot.crops[i+'-name'],'name'),percentage=await read(snapshot.crops[i+'-percentage'],'percentage');
      const parsed=R().parseFieldRow(name.text,percentage.text,names,canonPerk);
      if(percentage.conflict){parsed.row.conflict=true;parsed.warnings.push('Percentage views disagree. Verify this row.');parsed.valid=false;}
      parsed.row.confidence=Math.min(name.confidence,percentage.confidence);
      if(parsed.row.confidence<80)parsed.warnings.push('Row '+(i+1)+': OCR field evidence is weak. Verify the name and percentage.');
      firstRows.push({...parsed.row,...(rerolls[i] || {})});firstWarnings.push(...parsed.warnings);fields.push({name,percentage});
    }
    const colours=coloursOf(Array.from({length:5},(_,i)=>snapshot.crops[i+'-name']));
    const fills=Array.from({length:5},(_,i)=>starFill(snapshot.crops[i+'-star']));
    const unlocked={...R().classifyStars(fills),fills};
    let artifact=null;
    const colourHall=R().hallColour(snapshot.crops.hall || snapshot.crops['hall-banner']);
    const category=snapshot.crops.category;
    if(category) {
      let output=await read(category,'category','category'),type=R().craftCategoryEvidence(output || {});
      if(!type){output=await read(category,'category');type=R().craftCategoryEvidence(output);}
      if(!type){output=await read(category,'category','category','11') || await read(category,'category','contrast','11');type=R().craftCategoryEvidence(output);}
      artifact={type:type || '',rawType:output.text,categoryConfidence:output.confidence,source:'calibrated-label'};
    }else if(categorySource?.width) {
      // Keep existing metadata fallback if category calibration is disabled.
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '});
      const output=evidence(await readView(categorySource,{}, {text:true,blocks:true}));check();
      artifact={type:R().craftCategoryEvidence(output) || '',rawType:output.text,categoryConfidence:output.confidence,source:'crafting-label'};
    }
    const observations=[{pass:'calibrated-fields',rows:firstRows.map(row=>({...row})),warnings:[...firstWarnings],artifact:artifact?{...artifact}:null,unlocked}];
    const rows=firstRows.map(row=>({...row})),warnings=[];let retried=false;
    for(let i=0;i<5;i++) {
      const first=R().parseFieldRow(fields[i].name.text,fields[i].percentage.text,names,canonPerk);
      if(fields[i].percentage.conflict){first.row.conflict=true;first.warnings.push('Percentage views disagree. Verify this row.');first.valid=false;}
      let selected=first;
      if(!first.valid || rows[i].confidence<80) {
        const alternativeName=await read(snapshot.crops[i+'-name'],'name','colour');
        const alternativePercentage=await read(snapshot.crops[i+'-percentage'],'percentage','colour');
        if(alternativeName || alternativePercentage) {
          retried=true;
          const name=alternativeName || fields[i].name,percentage=alternativePercentage || fields[i].percentage;
          const candidate=R().parseFieldRow(name.text,percentage.text,names,canonPerk);
          const conflict=percentage.conflict || first.row.conflict || candidate.row.conflict || first.row.known && candidate.row.known && first.row.name!==candidate.row.name ||
            first.row.value!==null && candidate.row.value!==null && first.row.value!==candidate.row.value;
          if(conflict){selected=first;selected.row.conflict=true;selected.warnings.push('Row '+(i+1)+': independent field reads disagree. Verify it.');}
          else if(candidate.valid && name.confidence>=80 && percentage.confidence>=80){selected=candidate;rows[i].confidence=Math.min(name.confidence,percentage.confidence);}
        }
      }
      rows[i]={...selected.row,...(rerolls[i] || {}),confidence:rows[i].confidence};warnings.push(...selected.warnings);
      if(rows[i].confidence<80)warnings.push('Row '+(i+1)+': OCR field evidence is weak. Verify the name and percentage.');
    }
    if(retried)observations.push({pass:'calibrated-colour-retry',rows:rows.map(row=>({...row})),warnings:[...warnings]});
    const classification=R().craftHall({colourHall,colourOnly:true,selected:hall});
    let hallSource=classification.source;
    hall=classification.hall;
    let metadataConflict=false;
    // Category must exist in the detected hall; uncertain labels keep the dropdown.
    if(artifact?.type && !(hall==='war'?['Weapon','Armor','Equipment']:['Weapon','Armor','Jewelry','Pottery']).includes(artifact.type)){
      metadataConflict=true;artifact={...artifact,type:''};warnings.push('Category is unsupported for this hall. Choose it manually.');
    }
    if(artifact)artifact={...artifact,hall};
    const parsed={rows,warnings,valid:!warnings.length};
    const annotated=inferColours?R().inferColourValues(parsed,colours,hall):parsed;
    const tieredRows=annotated.rows.map((row,i)=>{
      const next={...row,colour:colours[i],unlocked:unlocked.states[i],level:1,levelSource:'crafting'};
      return window.DNStoredArtifacts?.craftingTier(next,{hall,type:artifact?.type}) || next;
    });
    const conflicts=tieredRows.flatMap((row,i)=>row.tierConflict?['Row '+(i+1)+': colour and starting percentage conflict. Verify the tier.']:[]);
    return {...annotated,valid:annotated.valid && !conflicts.length,warnings:[...annotated.warnings,...conflicts],artifact,hall,hallSource,colours,unlocked,inferColours,metadataConflict,recognitionPath:'calibrated-fields',ocrCalls:ocrCalls(),observations,rows:tieredRows};
  }
  window.DNScannerFieldRecognition={snapshot,recognize};
})();
