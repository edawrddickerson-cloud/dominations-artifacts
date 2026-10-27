/* Authority: User-approved independent field crops, October 2026.
 * Ownership: Calibrated crafting OCR; benefits ribbon colour determines the hall.
 * Invariants: Original signs required; no missing value fabrication; duplicates keep
 * row indices; conflicting/weak reads need review; worker parameters always restored.
 * Constraints: Box calibration does not recover clipped or unreadable pixels.
 * History: Red ribbon means Main; blue means War. Category crops isolate green ink.
 * Coloured overlapping rows split name/number imagery before focused OCR;
 * background-normalised and stronger numeric views retain original signed glyphs. */
(() => {
  'use strict';
  const R=()=>window.DNScannerRecognition;
  function snapshot(fields,{autoFit=true}={}) {
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
      const sharedPercentages=fields.template.rows.map((_,i)=>{
        const a=resolved.boxes[i+'-name'],b=resolved.boxes[i+'-percentage'];
        return ['x','y','width','height'].every(key=>a[key]===b[key]);
      });
      const reuseGeometry=JSON.stringify({boxes:resolved.boxes,template:fields.template,
        source:[fields.source.width,fields.source.height],panelSource:fields.panelSource?[fields.panelSource.width,fields.panelSource.height]:null});
      const seedCategory={x:-.3,y:-.31,width:.5,height:.2};
      const automaticCategory=fields.template.category && Object.keys(seedCategory).every(key=>fields.template.category[key]===seedCategory[key]);
      const input=fields.panelSource || fields.source,rect=fields.panelSource?{x:0,y:0,width:input.width,height:input.height}:window.DNScannerCore.cropPixels(fields.panel,input.width,input.height);
      // Freeze neighbouring pixels before any worker await. Never expand into
      // a newer live frame or store an expanded crop in the verified cache.
      if(autoFit && rect.width*rect.height<=4000000) {
        const frame=document.createElement('canvas');frame.width=rect.width;frame.height=rect.height;
        frame.getContext('2d').drawImage(input,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);crops['fit-panel']=frame;
      }
      return {valid:true,crops,template:window.DNScannerRegions.copy(fields.template),release,sharedPercentages,reuseGeometry,automaticCategory,diceRequested:fields.template.rows.map(row=>!!row.dice),unavailable:resolved.unavailable || {}};
    }catch(error){release();throw error;}
  }
  function percentageRect(data,width,height) {
    // Locate the last coloured word in this physical row. This supplies only
    // geometry; the sign, digits and percent glyph still have to pass OCR.
    const ink=(x,y)=>{const p=(y*width+x)*4,r=data[p],g=data[p+1],b=data[p+2];return data[p+3]>=128 && g>25 && (g>r*1.8 && g>b*1.2 || Math.min(g,b)>r*1.8);};
    const bands=[];let band=null,gap=0;
    for(let y=0;y<height;y++) {
      let count=0;for(let x=0;x<width;x++)if(ink(x,y))count++;
      if(count>=2){if(!band){band={y,bottom:y+1,count:0};bands.push(band);}band.bottom=y+1;band.count+=count;gap=0;}
      else if(++gap>2)band=null;
    }
    const lines=bands.filter(b=>b.bottom-b.y>=5 && b.bottom-b.y<height*.8).sort((a,b)=>b.count-a.count);
    if(!lines.length || lines[1]?.count>lines[0].count*.2)return null;
    const line=lines[0],textHeight=line.bottom-line.y,groups=[];let group=null,blank=0;
    for(let x=0;x<width;x++) {
      let count=0;for(let y=line.y;y<line.bottom;y++)if(ink(x,y))count++;
      if(count){if(!group){group={x,right:x+1};groups.push(group);}group.right=x+1;blank=0;}
      else if(++blank>Math.max(1,Math.round(textHeight*.2)))group=null;
    }
    if(groups.length<2)return null;
    const tail=groups.at(-1);let start=groups.length-1;
    // A faint or spaced sign may form a smaller separate ink group. Retain
    // nearby glyph-sized groups; the reader must still recognise the sign.
    while(start>0){const before=groups[start-1],current=groups[start];if(before.right-before.x>textHeight*1.5 || current.x-before.right>textHeight*.7 || tail.right-before.x>textHeight*5.5)break;start--;}
    const first=groups[start],prior=groups[start-1],span=tail.right-first.x;
    if(span<textHeight*.7 || span>textHeight*5.5)return null;
    const pad=Math.max(2,Math.round(textHeight*.25)),leftPad=prior?Math.min(Math.round(textHeight*.9),Math.max(1,first.x-prior.right-Math.round(textHeight*.15))):pad,x=Math.max(0,first.x-leftPad),y=Math.max(0,line.y-pad);
    return {x,y,width:Math.min(width,tail.right+pad)-x,height:Math.min(height,line.bottom+pad)-y};
  }
  function view(source,mode='contrast',compact=false,minimumScale=2,compactHeight=48) {
    const canvas=document.createElement('canvas'),scale=compact?Math.min(2,Math.max(1,compactHeight/source.height)):Math.min(minimumScale>2?6:4,Math.max(minimumScale,64/source.height));
    canvas.width=Math.ceil(source.width*scale)+32;canvas.height=Math.ceil(source.height*scale)+24;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    const raw=document.createElement('canvas');raw.width=Math.ceil(source.width*scale);raw.height=Math.ceil(source.height*scale);
    const rawCtx=raw.getContext('2d',{willReadFrequently:true});rawCtx.drawImage(source,0,0,raw.width,raw.height);
    const pixels=rawCtx.getImageData(0,0,raw.width,raw.height);let ink=0,background=0;
    const numeric=minimumScale>2;
    if(mode==='chroma' && numeric){
      const histogram=new Uint32Array(256);for(let i=0;i<pixels.data.length;i+=4)histogram[Math.max(0,Math.max(pixels.data[i+1],pixels.data[i+2])-pixels.data[i])]++;
      let total=0;for(let value=0;value<256;value++){total+=histogram[value];if(total>=pixels.data.length/8){background=value;break;}}
    }
    for(let i=0;i<pixels.data.length;i+=4) {
      const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
      const saturated=mode==='category'?g>60 && g>r*1.25 && g>b*1.05:Math.max(g,b)>r*1.8 && Math.max(g,b)>25;
      const value=mode==='neutral'?R().neutralTextContrast(r,g,b):mode==='chroma' || mode==='colour' && !compact?255-Math.min(255,Math.max(0,(numeric?Math.max(g,b):g)-r-background)*(numeric?6:mode==='chroma'?8:12)):mode==='colour' || mode==='category'?saturated?0:255:R().textContrast(r,g,b);
      if(mode==='neutral'?value<200:saturated)ink++;
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
  // Associate OCR lines with their physical cell, never their output order.
  // Missing lines leave a hole; wrapped/extra lines require a focused retry.
  function atlasEvidence(output,cells) {
    const lines=(output.data.blocks || []).flatMap(b=>(b.paragraphs || []).flatMap(p=>p.lines || []));
    return cells.map(cell=>{
      const found=lines.filter(line=>line.bbox && line.bbox.y0>=cell.top && line.bbox.y1<=cell.bottom);
      if(found.length!==1)return {text:'',confidence:0,words:[],reason:found.length?'multiple-lines':'missing-line'};
      const line=found[0];
      return {text:String(line.text || '').trim(),confidence:line.confidence || 0,words:line.words || []};
    });
  }
  async function recognize(snapshot,{worker,readView,names,canonPerk,hall='main',inferColours=false,categorySource,isClosed,ocrCalls,reuse=null,autoFit=true,fitBudget={remaining:24}}) {
    const colours=coloursOf(Array.from({length:5},(_,i)=>snapshot.crops[i+'-name']));
    const war=R().hallColour(snapshot.crops.hall || snapshot.crops['hall-banner'])==='war';
    const neutralSources=new Set(war?colours.flatMap((colour,i)=>colour==='neutral'?[snapshot.crops[i+'-name'],snapshot.crops[i+'-percentage']]:[]):[]);
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
    // A read repeatedly evaluates the same original OCR strings. Memoize only
    // within this frozen snapshot, returning fresh rows/warnings so conflict and
    // confidence annotations cannot leak between duplicate physical stats.
    const parsedFields=new Map();
    const parseField=(name,percentage)=>{
      const key=JSON.stringify([name,percentage]);
      if(!parsedFields.has(key))parsedFields.set(key,R().parseFieldRow(name,percentage,names,canonPerk));
      const parsed=parsedFields.get(key);
      return {...parsed,row:{...parsed.row},warnings:[...parsed.warnings]};
    };
    async function read(source,kind,mode='contrast',segmentation='7',shared=false) {
      check();let focused=null;
      if(neutralSources.has(source) && ['contrast','colour'].includes(mode))mode='neutral';
      if(mode!=='neutral' && (kind==='percentage' || kind==='name' && shared) && source.width/source.height>5) {
        const pixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data;
        const rect=percentageRect(pixels,source.width,source.height);
        if(rect){const area=kind==='percentage'?rect:{x:0,y:rect.y,width:rect.x,height:rect.height};if(area.width>2){focused=document.createElement('canvas');focused.width=area.width;focused.height=area.height;focused.getContext('2d').drawImage(source,area.x,area.y,area.width,area.height,0,0,area.width,area.height);}}
      }
      const prepared=view(focused || source,focused && mode==='contrast'?'chroma':mode,false,focused && kind==='percentage'?(mode==='colour'?5:4):2);
      if((mode==='colour' || mode==='category') && prepared.ink<30){prepared.canvas.width=prepared.canvas.height=0;if(focused)focused.width=focused.height=0;return null;}
      try {
        let rectangle=null,guide=null,guideConfidence=0;
        if(kind==='percentage' && !focused && source.width/source.height>5) {
          // Percentages follow variable-length names. For a deliberately wide
          // percentage box, locate its numeric suffix within that same crop.
          // This independent layout pass never borrows the name crop's text.
          await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
          guide=evidence(await readView(prepared.canvas,{}, {text:true,blocks:true}));check();
          const words=guide.words,last=words.findLastIndex(word=>(/\d/.test(word.text || '') || /^[+-][^\s]*$/.test(word.text || '')) && word.bbox);
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
          result.guideText=guide.text;
          const suffix=/([+-]\s*\d+(?:\s*[.,]\s*\d+)?)\s*%\s*$/.exec(guide.text);
          const guideValue=R().parsePercentage(suffix?suffix[1]+'%':'').value,value=R().parsePercentage(result.text).value;
          if(guideValue!==null && value!==null) {
            if(guideValue!==value)result.conflict=true;
            else {result.corroborated=true;result.focusedConfidence=result.confidence;result.guideConfidence=guideConfidence;result.confidence=Math.max(result.confidence,guideConfidence);}
          }
        }
        return result;
      }finally {prepared.canvas.width=prepared.canvas.height=0;if(focused)focused.width=focused.height=0;}
    }
    // Only an explicitly scoped encounter may replay directly verified OCR.
    // Compare the complete original RGBA crop, not a visual or approximate hash.
    // Replaying a batch cell leaves all existing retry and contradiction checks
    // in place; category, colour, stars, dice and fallback still read fresh pixels.
    const batchEvidence=new Map();let evidenceBytes=0,reusedFields=0;
    const samePixels=(first,second)=>{if(first.length!==second.length)return false;for(let i=0;i<first.length;i++)if(first[i]!==second[i])return false;return true;};
    const copyEvidence=value=>({...value,words:(value.words || []).map(word=>({...word,...(word.bbox?{bbox:{...word.bbox}}:{})}))});
    async function batch(kind,mode='contrast',indices=[0,1,2,3,4],compactHeight=48) {
      check();
      const results=Array(5),missing=[];
      for(const i of indices) {
        const source=snapshot.crops[i+'-'+kind],key=kind+':'+mode+':'+i;
        // This operation has a fixed compact view, PSM 6 and kind-specific
        // whitelist. Other views/parameters cannot consume these entries.
        if(reuse && mode==='contrast' && compactHeight===48 && evidenceBytes+source.width*source.height*4<=reuse.byteLimit) {
          const pixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data;
          evidenceBytes+=pixels.byteLength;
          batchEvidence.set(key,{key,pixels,width:source.width,height:source.height});
          const prior=reuse.entries.get(key);
          if(prior && prior.width===source.width && prior.height===source.height && samePixels(prior.pixels,pixels)) {
            results[i]={...copyEvidence(prior.evidence),reused:true};reusedFields++;continue;
          }
        }
        missing.push(i);
      }
      if(!missing.length)return results;
      const prepared=missing.map(i=>view(snapshot.crops[i+'-'+kind],neutralSources.has(snapshot.crops[i+'-'+kind]) && ['contrast','colour'].includes(mode)?'neutral':mode,true,2,compactHeight));
      if(mode==='colour' && prepared.every(item=>item.ink<30)){for(const item of prepared)item.canvas.width=item.canvas.height=0;return null;}
      const canvas=document.createElement('canvas'),cells=[];
      canvas.width=Math.max(...prepared.map(item=>item.canvas.width));
      canvas.height=prepared.reduce((height,item)=>height+item.canvas.height+16,0);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      let top=0;
      for(const item of prepared){ctx.drawImage(item.canvas,0,top);cells.push({top,bottom:top+item.canvas.height});top+=item.canvas.height+16;}
      try {
        await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:kind==='percentage'?'+-0123456789.,%':''});
        const output=await readView(canvas,{}, {text:true,blocks:true});check();
        const fresh=atlasEvidence(output,cells);
        missing.forEach((index,i)=>{results[index]=fresh[i];});
        return results;
      }finally {canvas.width=canvas.height=0;for(const item of prepared)item.canvas.width=item.canvas.height=0;}
    }
    const fields=[],firstRows=[],firstWarnings=[],fieldReads=Array.from({length:5},()=>[]);
    const recordFields=(i,pass,name,percentage)=>{
      const raw=value=>value?{text:value.text,confidence:value.confidence,...(value.rawText?{rawText:value.rawText}:{}),...(value.guideText?{guideText:value.guideText}: {}),
        ...(value.autoFit?{autoFit:value.autoFit,evidenceSource:'expanded-field'}:{}),
        ...(value.reused?{reused:true,evidenceSource:'same-encounter-identical-pixels'}:{})}:null;
      fieldReads[i].push({pass,name:raw(name),percentage:raw(percentage)});
    };
    const batchNames=await batch('name');
    // Identical calibrated boxes contain the same evidence. Read their signed
    // suffix once instead of repeating identical pixels through a guide pass.
    const batchPercentages=snapshot.sharedPercentages?.every(Boolean)?null:await batch('percentage');
    const suffixOf=name=>({text:/([+-]\s*\d+(?:\s*[.,]\s*\d+)?)\s*%\s*$/.exec(name.text)?.[0]?.trim() || '',confidence:name.confidence,words:[],source:'shared-crop',...(name.reused?{reused:true}:{})});
    const batchRows=batchNames.map((name,i)=>{
      const percentage=batchPercentages?.[i] || suffixOf(name);
      return {...parseField(name.text,percentage.text).row,confidence:Math.min(name.confidence,percentage.confidence)};
    });
    // Small atlases are quickest for clear text. Enlarge only unresolved shared
    // rows before paying for individual name, guide and percentage retries.
    // This is new OCR of the same glyphs, with the existing confidence threshold;
    // contradictory signed values or identities remain a conflict.
    const enlargedConflicts=Array(5).fill(false),initialBatchNames=batchNames.slice();
    const unclear=!batchPercentages?batchNames.flatMap((name,i)=>!parseField(name.text,suffixOf(name).text).valid || name.confidence<80?[i]:[]):[];
    const enlargedNames=unclear.length?await batch('name','contrast',unclear,96):null;
    for(const i of unclear) {
      const alternative=enlargedNames[i];
      if(alternative.confidence<80)continue;
      const first=parseField(batchNames[i].text,suffixOf(batchNames[i]).text),candidate=parseField(alternative.text,suffixOf(alternative).text);
      enlargedConflicts[i]=first.row.known && candidate.row.known && first.row.name!==candidate.row.name ||
        first.row.value!==null && candidate.row.value!==null && first.row.value!==candidate.row.value;
      if(candidate.valid && !enlargedConflicts[i])batchNames[i]=alternative;
    }
    const needsColour=!batchPercentages && batchNames.some(name=>!parseField(name.text,suffixOf(name).text).valid || name.confidence<80);
    const colourNames=needsColour?await batch('name','colour'):null;
    for(let i=0;i<5;i++) {
      let name=batchNames[i],percentage;
      if(batchPercentages)percentage=batchPercentages[i];
      else percentage=suffixOf(name);
      recordFields(i,'batch-contrast',initialBatchNames[i],batchPercentages?.[i] || suffixOf(initialBatchNames[i]));
      if(enlargedNames?.[i])recordFields(i,'batch-enlarged',enlargedNames[i],suffixOf(enlargedNames[i]));
      if(colourNames?.[i]?.text)recordFields(i,'batch-colour',colourNames[i],suffixOf(colourNames[i]));
      let fieldConflict=enlargedConflicts[i];
      if(colourNames?.[i]?.confidence>=80) {
        const alternative=colourNames[i],amount=suffixOf(alternative);
        const candidate=parseField(alternative.text,amount.text);
        const first=parseField(name.text,percentage.text);
        const conflict=first.row.known && candidate.row.known && first.row.name!==candidate.row.name ||
          first.row.value!==null && candidate.row.value!==null && first.row.value!==candidate.row.value;
        if(conflict)fieldConflict=true;
        else if(candidate.valid && (!first.valid || name.confidence<80)){name=alternative;percentage=amount;}
      }
      // A wide nonidentical percentage box needs its own numeric-suffix guide.
      const wide=!snapshot.sharedPercentages?.[i] && snapshot.crops[i+'-percentage'].width/snapshot.crops[i+'-percentage'].height>5;
      let initial=parseField(name.text,percentage.text);
      const priorName=name,priorPercentage=percentage;
      if(!initial.row.known || initial.row.assumed || name.confidence<80)name=await read(snapshot.crops[i+'-name'],'name','contrast','7',snapshot.sharedPercentages?.[i]);
      if(wide || initial.row.value===null || percentage.confidence<80)percentage=await read(snapshot.crops[i+'-percentage'],'percentage');
      if(name!==priorName || percentage!==priorPercentage)recordFields(i,'focused-fields',name,percentage);
      const attempted=parseField(name.text,percentage.text);
      // A retry supplies additional evidence. Missing glyphs must not erase an
      // earlier signed value or known name, nor promote its original confidence.
      if(initial.row.known && !initial.row.assumed && (!attempted.row.known || attempted.row.assumed))name=priorName;
      if(initial.row.value!==null && attempted.row.value===null)percentage=priorPercentage;
      const parsed=parseField(name.text,percentage.text);
      fieldConflict=fieldConflict || percentage.conflict || attempted.row.conflict || initial.row.conflict ||
        initial.row.known && parsed.row.known && initial.row.name!==parsed.row.name ||
        initial.row.value!==null && parsed.row.value!==null && initial.row.value!==parsed.row.value;
      if(fieldConflict){parsed.row.conflict=true;parsed.warnings.push('Independent field views disagree. Verify this row.');parsed.valid=false;}
      parsed.row.confidence=Math.min(name.confidence,percentage.confidence);
      if(parsed.row.confidence<80)parsed.warnings.push('Row '+(i+1)+': OCR field evidence is weak. Verify the name and percentage.');
      firstRows.push({...parsed.row,...(rerolls[i] || {})});firstWarnings.push(...parsed.warnings);fields.push({name,percentage,conflict:!!fieldConflict});
    }
    const fills=Array.from({length:5},(_,i)=>starFill(snapshot.crops[i+'-star']));
    const unlocked={...R().classifyStars(fills),fills};
    let artifact=null;
    const colourHall=R().hallColour(snapshot.crops.hall || snapshot.crops['hall-banner']);
    const category=snapshot.crops.category;
    const readCategorySource=async()=>{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '});
      const output=evidence(await readView(categorySource,{}, {text:true,blocks:true}));check();
      return {type:R().craftCategoryEvidence(output) || '',rawType:output.text,categoryConfidence:output.confidence,source:'crafting-label'};
    };
    // The generated seed box can include the title and icon. Prefer the existing
    // detected text-line crop; explicit user calibration keeps its priority.
    const sourceFirst=snapshot.automaticCategory && categorySource?.width;
    if(sourceFirst)artifact=await readCategorySource();
    if(category && !artifact?.type) {
      let output=await read(category,'category','category'),type=R().craftCategoryEvidence(output || {});
      if(!type){output=await read(category,'category');type=R().craftCategoryEvidence(output);}
      if(!type){output=await read(category,'category','category','11') || await read(category,'category','contrast','11');type=R().craftCategoryEvidence(output);}
      artifact={type:type || '',rawType:output?.text || '',categoryConfidence:output?.confidence || 0,source:'calibrated-label'};
    }else if(!category && categorySource?.width) {
      // Keep existing metadata fallback if category calibration is disabled.
      artifact=await readCategorySource();
    }
    if(category && !artifact?.type && categorySource?.width && !sourceFirst) {
      const fallback=await readCategorySource();
      if(fallback.type)artifact=fallback;
    }
    const observations=[{pass:'calibrated-fields',rows:firstRows.map(row=>({...row})),warnings:[...firstWarnings],artifact:artifact?{...artifact}:null,unlocked,...(reusedFields?{reusedFields}: {})}];
    if(batchRows.some((row,i)=>row.raw!==firstRows[i].raw || row.confidence!==firstRows[i].confidence))
      observations.unshift({pass:'calibrated-batch',rows:batchRows,warnings:[],artifact:artifact?{...artifact}:null,unlocked});
    const rows=firstRows.map(row=>({...row})),warnings=[];let retried=false;
    for(let i=0;i<5;i++) {
      const first=parseField(fields[i].name.text,fields[i].percentage.text);
      if(fields[i].conflict){first.row.conflict=true;first.warnings.push('Independent field views disagree. Verify this row.');first.valid=false;}
      let selected=first,chosenName=fields[i].name,chosenPercentage=fields[i].percentage;
      if(!first.valid || rows[i].confidence<80) {
        const alternativeName=await read(snapshot.crops[i+'-name'],'name','colour','7',snapshot.sharedPercentages?.[i]);
        const alternativePercentage=await read(snapshot.crops[i+'-percentage'],'percentage','colour');
        recordFields(i,'colour-fields',alternativeName,alternativePercentage);
        if(alternativeName || alternativePercentage) {
          retried=true;
          const name=alternativeName || fields[i].name,percentage=alternativePercentage || fields[i].percentage;
          const candidate=parseField(name.text,percentage.text);
          const conflict=percentage.conflict || first.row.conflict || candidate.row.conflict || first.row.known && candidate.row.known && first.row.name!==candidate.row.name ||
            first.row.value!==null && candidate.row.value!==null && first.row.value!==candidate.row.value;
          if(conflict){selected=first;selected.row.conflict=true;selected.warnings.push('Row '+(i+1)+': independent field reads disagree. Verify it.');}
          else if(candidate.valid && name.confidence>=80 && percentage.confidence>=80){selected=candidate;chosenName=name;chosenPercentage=percentage;rows[i].confidence=Math.min(name.confidence,percentage.confidence);}
        }
      }
      if(autoFit && snapshot.template && snapshot.crops['fit-panel'] && !selected.row.conflict && (!selected.valid || rows[i].confidence<80)) {
        for(const kind of ['name','percentage']) {
          const existing=kind==='name'?chosenName:chosenPercentage;
          if(kind==='name'?selected.row.known && !selected.row.assumed && existing.confidence>=80:selected.row.value!==null && existing.confidence>=80)continue;
          const box=snapshot.template.rows[i][kind],frame=snapshot.crops['fit-panel'];
          const bounds=R().autoFitBounds(box,i,snapshot.template.rows.map(row=>row[kind]));
          const star=snapshot.template.rows[i].star;
          bounds.x=Math.min(box.x,star.x+star.width);bounds.width=1-bounds.x;
          const fitted=await R().autoFitField({box,bounds,budget:fitBudget,isClosed,dimensions:frame,
            read:async region=>{
              const rect=window.DNScannerCore.cropPixels(region,frame.width,frame.height),crop=document.createElement('canvas');
              crop.width=rect.width;crop.height=rect.height;
              try {
                crop.getContext('2d').drawImage(frame,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
                const evidence=await read(crop,kind,'contrast','7',snapshot.sharedPercentages?.[i]);
                recordFields(i,'auto-fit-attempt-'+kind,kind==='name'?evidence:null,kind==='percentage'?evidence:null);
                // A growing name crop can include the beginning of its adjacent
                // numeric field. Keep the raw glyphs; never use them as a value.
                return kind==='name'?{...evidence,rawText:evidence.text,text:evidence.text.replace(/\s+[+-]\s*(?:\d+\s*)?$/,'')}:evidence;
              }
              finally {crop.width=crop.height=0;}
            },accept:evidence=>{
              if(evidence.conflict)return null;
              const candidate=parseField(kind==='name'?evidence.text:chosenName.text,kind==='percentage'?evidence.text:chosenPercentage.text).row;
              if(candidate.conflict || selected.row.known && candidate.known && candidate.name!==selected.row.name || selected.row.value!==null && candidate.value!==null && candidate.value!==selected.row.value)return false;
              return kind==='name'?candidate.known && candidate.nameMatch?.method==='exact'?candidate.name:null:
                candidate.value!==null && !R().signIssues([candidate]).length?candidate.value:null;
            }});
          if(fitted){if(kind==='name')chosenName=fitted;else chosenPercentage=fitted;selected=parseField(chosenName.text,chosenPercentage.text);retried=true;recordFields(i,'auto-fit-'+kind,chosenName,chosenPercentage);}
        }
        rows[i].confidence=Math.min(chosenName.confidence,chosenPercentage.confidence);
      }
      rows[i]={...selected.row,...(rerolls[i] || {}),confidence:rows[i].confidence};warnings.push(...selected.warnings);
      if(rows[i].confidence<80)warnings.push('Row '+(i+1)+': OCR field evidence is weak. Verify the name and percentage.');
    }
    if(retried)observations.push({pass:'calibrated-colour-retry',rows:rows.map(row=>({...row})),warnings:[...warnings]});
    observations[observations.length-1].fieldReads=fieldReads;
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
    const valid=annotated.valid && !conflicts.length;
    if(reuse) {
      const verified=new Map();
      for(let i=0;i<5;i++) {
        const name=initialBatchNames[i],percentage=batchPercentages?.[i] || suffixOf(name),row=tieredRows[i];
        const initial=parseField(name.text,percentage.text);
        // Never cache recovered, inferred, weak, unknown or conflicting batch
        // evidence, even when later independent reads made the row valid.
        if(!initial.valid || initial.row.assumed || name.confidence<80 || percentage.confidence<80 ||
          !row.known || row.assumed || row.inferred || row.conflict || row.tierConflict || row.confidence<80 ||
          row.name!==initial.row.name || row.value!==initial.row.value)continue;
        for(const [kind,evidence] of [['name',name],['percentage',percentage]]) {
          const key=kind+':contrast:'+i,candidate=batchEvidence.get(key);
          if(candidate)verified.set(key,{...candidate,index:i,name:row.name,value:row.value,evidence:copyEvidence(evidence)});
        }
      }
      // The engine commits this transaction only after its cancellation check.
      reuse.verified=verified;
    }
    return {...annotated,valid,warnings:[...annotated.warnings,...conflicts],artifact,hall,hallSource,colours,unlocked,inferColours,metadataConflict,recognitionPath:'calibrated-fields',ocrCalls:ocrCalls(),...(reuse?{reusedFields}:{}),observations,rows:tieredRows};
  }
  // A speculative result may be used only when these exact OCR inputs match the
  // image the ordinary settled read would consume. Pixels stay in memory, scoped
  // to one job. The panel covers temporal stat/star crops and standard fallback;
  // category/hall/dice also freeze from their original non-temporal source.
  function witness(source,fields,categorySource,context,byteLimit=8*1024*1024,titleSource=null) {
    if(!fields || !source?.width || source.width*source.height*4>byteLimit)return null;
    let frozen;
    try {
      frozen=snapshot({...fields,panelSource:source},{autoFit:false});
      if(!frozen.valid)return null;
      let bytes=0;const images=[];
      const add=(id,canvas)=>{
        if(!canvas?.width || !canvas.height)return true;
        bytes+=canvas.width*canvas.height*4;
        if(bytes>byteLimit)return false;
        images.push({id,width:canvas.width,height:canvas.height,pixels:canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data});
        return true;
      };
      if(!add('panel',source) || !add('category-source',categorySource) || !add('title-source',titleSource))return null;
      for(const [id,canvas] of Object.entries(frozen.crops))if(id==='category' || id==='hall' || id.endsWith('-dice'))if(!add(id,canvas))return null;
      return {key:JSON.stringify([context,frozen.reuseGeometry]),images};
    }catch{return null;}
    finally{frozen?.release?.();}
  }
  function sameWitness(first,second) {
    if(!first || !second || first.key!==second.key || first.images.length!==second.images.length)return false;
    return first.images.every((image,index)=>{
      const next=second.images[index];
      if(image.id!==next.id || image.width!==next.width || image.height!==next.height || image.pixels.length!==next.pixels.length)return false;
      for(let i=0;i<image.pixels.length;i++)if(image.pixels[i]!==next.pixels[i])return false;
      return true;
    });
  }
  window.DNScannerFieldRecognition={snapshot,recognize,atlasEvidence,percentageRect,witness,sameWitness};
})();
