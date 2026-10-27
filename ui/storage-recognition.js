/*
 * Authority: User-requested stored-artifact scanner, artwork and eleven category screenshots.
 * Ownership: Stored-item crops and OCR using the existing local worker/parser.
 * Invariants: Five/six ordered rows, duplicates and locked perks survive; upgraded
 * accurate numeric reads take priority; a confirmed tier plus one numeric field can fill an unclear field. Only the requested
 * artwork crop is returned for explicit Keep; full screenshots never persist.
 * History: Ordinary tiers now resolve from signed percentages and read levels;
 * percentage text colour is not tier evidence; inferred fields remain marked for review.
 * Constraints: English storage dialog; tested against the user's Main/War category set.
 */
(() => {
  'use strict';
  const recognition=window.DNScannerRecognition;
  const types=['Weapon','Armor','Jewelry','Pottery','Legendary','Mythical','War Weapon','War Armor','War Equipment','War Legendary','War Mythical'];
  function detectPanel(source) { return recognition.detectPanel(source,{storage:true}); }
  const rowsForType=type=>/^(?:War )?Mythical$/i.test(String(type || '').trim())?6:5;
  function inspect(source,{type=null}={}) {
    const c=document.createElement('canvas');c.width=source.width;c.height=source.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
    const {data}=ctx.getImageData(0,0,c.width,c.height);
    let red=0,blue=0;
    for(let y=Math.round(c.height*.42);y<c.height*.52;y+=2)for(let x=Math.round(c.width*.015);x<c.width*.28;x+=2) {
      const p=(y*c.width+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(r>60 && r>g*1.3 && r>b*1.3)red++;
      if(b>60 && b>r*1.25 && b>g*1.1)blue++;
    }
    const hall=blue>100 && blue>red*2?'war':red>100 && red>blue*2?'main':null;
    c.width=c.height=0;return {hall,expectedRows:rowsForType(type)};
  }
  function levelOf(text) {
    const match=/^\s*(10|[1-9])\s*\/\s*10\s*$/.exec(text);
    return match?Number(match[1]):null;
  }
  function starState(pixels) {
    let yellow=0;
    for(let p=0;p<pixels.length;p+=4)if(pixels[p]>160 && pixels[p+1]>100 && pixels[p+2]<pixels[p+1]*.8)yellow++;
    const fill=yellow/(pixels.length/4);
    return fill>=.3?true:fill<=.1?false:null;
  }
  const signedPercent=text=>window.DNScannerRecognition.parsePercentage(text).value!==null;
  function colouredInk(r,g,b,soft=false) {
    const strongest=Math.max(g,b);
    return strongest>25 && (soft?strongest-r>8 && strongest>r*1.15:strongest>r*1.6);
  }
  async function recognize(source,{worker,names,canonPerk,expectedRows=5,layout='storage',hall='main',manualType=null,knownTiers=[],fields=null,isClosed=()=>false,autoFit=true,fitBudget={remaining:24}}) {
    expectedRows=Number(expectedRows)===6?6:5;
    const canvases=[];
    const make=()=>{const c=document.createElement('canvas');canvases.push(c);return c;};
    const full=layout==='storage';
    let calibrated=full && fields?.template?.kind==='storage';
    if(calibrated && !window.DNStorageRegions?.resolve(fields.template,{x:0,y:0,width:1,height:1},source).valid)throw new Error('Saved storage field boxes do not fit this dialog. Recalibrate fields.');
    let boxes=calibrated?Object.fromEntries(window.DNStorageRegions.fields(fields.template).map(field=>[field.id,field.box])):null;
    const box=(id,fallback)=>calibrated?boxes[id]:fallback;
    // Full dialog includes the left type banner, title, all row stars and footer.
    // Legacy rows-only crops end at percentages. Dice-inclusive crops extend
    // that same stat geometry; expanding it must not move any OCR field.
    const area=full?{x:.303,y:.151,width:.568,height:expectedRows===6?.785:.659}:{x:0,y:0,width:layout==='storage-rows-dice'?.568/.66:1,height:1};
    const original=make();original.width=source.width;original.height=source.height;
    const originalContext=original.getContext('2d',{willReadFrequently:true});originalContext.drawImage(source,0,0);
    const sourcePixels=originalContext.getImageData(0,0,source.width,source.height).data;
    source=original;
    // Fixed before the first async worker call; never borrow a previous item.
    const readRerolls=()=>(calibrated?fields.template.rows.map((row,i)=>{
      const rect=row.dice && window.DNScannerCore.cropPixels(row.dice,source.width,source.height);
      return rect?window.DNScannerRerollRecognition?.classify(sourcePixels,source.width,source.height,rect):window.DNScannerRerollRecognition?.unknown('uncalibrated-dice');
    }):window.DNScannerRerollRecognition?.detectStorage(sourcePixels,source.width,source.height,{expectedRows,layout})) ||
      Array.from({length:expectedRows},()=>({rerollEligible:null,rerollSource:null,rerollConfidence:'unknown'}));
    function fitInk(rect,colour=false,soft=false) {
      const left=Math.round(rect.x*source.width),top=Math.round(rect.y*source.height),width=Math.ceil(rect.width*source.width),height=Math.ceil(rect.height*source.height),counts=[];
      for(let y=top;y<Math.min(source.height,top+height);y++) {
        let count=0;
        const measureWidth=colour?width:Math.ceil(width*.6);
        for(let x=left;x<Math.min(source.width,left+measureWidth);x++) {
          const p=(y*source.width+x)*4,r=sourcePixels[p],g=sourcePixels[p+1],b=sourcePixels[p+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
          if(colour?colouredInk(r,g,b,soft):(max-min<65 && .299*r+.587*g+.114*b>70))count++;
        }
        counts.push(!colour && count>measureWidth*.7?0:count);
      }
      const peak=counts.indexOf(Math.max(...counts));if(counts[peak]<3)return rect;
      let a=peak,b=peak;while(a>0&&counts[a-1]>1)a--;while(b<counts.length-1&&counts[b+1]>1)b++;
      const y=Math.max(top,top+a-2),bottom=Math.min(top+height,top+b+3);
      return {...rect,y:y/source.height,height:(bottom-y)/source.height};
    }
    function field(rect,ink='normal') {
      const c=make(),scale=['level','level-green'].includes(ink)?6:Math.max(2,Math.min(4,2901/source.width));
      const sx=Math.round(rect.x*source.width),sy=Math.round(rect.y*source.height);
      const sw=Math.ceil(rect.width*source.width),sh=Math.ceil(rect.height*source.height);
      const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
      c.width=w+24;c.height=h+24;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(source,sx,sy,sw,sh,12,12,w,h);
      const pixels=ctx.getImageData(12,12,w,h);
      for(let i=0;i<pixels.data.length;i+=4) {
        const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
        if(ink==='raw')continue;
        const v=ink==='title'?(r>205 && g>160?0:255):
          ink==='title-soft'?(r>190 && g>145?0:255):
          ink==='banner'?(.299*r+.587*g+.114*b>145?0:255):
          ink==='grey'?(.299*r+.587*g+.114*b>65?0:255):
          ink==='colour' || ink==='colour-soft'?(colouredInk(r,g,b,ink==='colour-soft')?0:255):
          // Fractions are pale grey over a green/black progress bar. Using
          // the green channel alone merges the glyphs with the filled bar.
          ink==='level-green'?(g>35 && g>r*1.12 && g>b*1.12?0:255):
          ink==='level-channel'?255-Math.min(255,Math.max(0,(g-30)*4)):
          ink.startsWith('level')?(Math.max(r,g,b)-Math.min(r,g,b)<70 && .299*r+.587*g+.114*b>(ink==='level-soft'?35:75)?0:255):recognition.textContrast(r,g,b);
        pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;
      }
      ctx.putImageData(pixels,12,12);return c;
    }
    async function read(rect,whitelist='',ink='normal',mode='7') {
      if(isClosed())throw new Error('Recognition stopped');
      await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist});
      const c=field(rect,ink);
      try {
        const output=await worker.recognize(c,{}, {text:true,blocks:true});
        if(isClosed())throw new Error('Recognition stopped');
        const lines=(output.data.blocks || []).flatMap(b=>(b.paragraphs || []).flatMap(p=>p.lines || []));
        return {text:output.data.text.trim(),confidence:lines.length?Math.min(...lines.map(l=>l.confidence)):0};
      } finally {c.width=c.height=0;}
    }
    let rowHeight=area.height/expectedRows;
    const rect=(index,x,width,y,height)=>({x:area.x+x*area.width,width:width*area.width,y:area.y+(index+y)*rowHeight,height:height*rowHeight});
    const rows=[],warnings=[],evidence=[];
    const checkedType=types.includes(manualType)?manualType:null;
    let artifact={name:'',type:checkedType || '',...(checkedType?{typeSource:'manual',hall:/^War /i.test(checkedType)?'war':'main'}:{}),source:'storage',metadataWarnings:[]};
    let calibrationReason=null;
    try {
      if(full) {
        const titleRect=box('title',{x:.31,y:.018,width:.553,height:.110});
        let title=await read(titleRect,'','title','6');
        if(title.confidence<80) {
          for(const ink of ['title-soft','raw']) {
            const alternative=await read(titleRect,'',ink,'6');
            if(alternative.confidence>title.confidence)title=alternative;
          }
        }
        const type=await read(box('category',{x:.072,y:.439,width:.2,height:.058}),'','banner');
        const normalizedType=type.text.replace(/\s+/g,' ').trim().toLowerCase();
        const matched=types.find(t=>t.toLowerCase()===normalizedType),selected=types.includes(manualType)?manualType:matched;
        artifact={...artifact,name:title.text.replace(/\s+/g,' '),type:selected || '',rawType:type.text,typeConfidence:type.confidence,...(checkedType?{typeSource:'manual'}:{}),titleConfidence:title.confidence,hall:checkedType?(/^War /i.test(checkedType)?'war':'main'):inspect(source).hall};
        artifact.categoryUnclear=!selected;
        if(calibrated && boxes.hall && !checkedType) {
          const rect=window.DNScannerCore.cropPixels(boxes.hall,source.width,source.height);
          const pixels=originalContext.getImageData(rect.x,rect.y,rect.width,rect.height).data;
          artifact.hall=recognition.classifyHallColour(pixels) || hall;
        }
        const picture=make();picture.width=192;picture.height=Math.round(192*(source.height*.295)/(source.width*.226));
        const artwork=box('artwork',{x:.037,y:.067,width:.226,height:.295});
        if(artwork){picture.height=Math.max(1,Math.round(192*(source.height*artwork.height)/(source.width*artwork.width)));picture.getContext('2d').drawImage(source,source.width*artwork.x,source.height*artwork.y,source.width*artwork.width,source.height*artwork.height,0,0,picture.width,picture.height);artifact.image=picture.toDataURL('image/jpeg',.88);}
        if(!artifact.name || title.confidence<80)artifact.metadataWarnings.push('Check the artifact name.');
        if(!selected)artifact.metadataWarnings.push('Choose the artifact category.');
        else if(!types.includes(manualType) && type.confidence<80)artifact.metadataWarnings.push('Check the artifact category.');
        // All ordinary and Legendary artifacts have five rows. Gold footer
        // decorations and a previous item's template cannot establish six.
        const detectedRows=rowsForType(selected);
        if(expectedRows!==detectedRows)knownTiers=[];
        expectedRows=detectedRows;area.height=expectedRows===6?.785:.659;rowHeight=area.height/expectedRows;
        if(calibrated && fields.template.rows.length!==expectedRows) {
          calibrated=false;boxes=null;knownTiers=[];
          calibrationReason='Saved boxes use a different row count. Using the category layout.';
        }
      } else artifact.metadataWarnings.push('Enter the artifact name and category for this rows-only crop.');
      const rerolls=readRerolls();
      for(let i=0;i<expectedRows;i++) {
        const labelRect=box(i+'-name',expectedRows===5?rect(i,.15,.665,.12,.31):fitInk(rect(i,.15,.665,.06,.54)));
        const amountRect=box(i+'-percentage',fitInk(rect(i,.85,.15,.20,.60),true));
        let label=await read(labelRect,'','grey');
        let amount=await read(amountRect,'+-0123456789.,%','colour');
        if(!signedPercent(amount.text)) {
          // Capture can reduce colour saturation, especially on locked rows.
          // Retry actual glyphs before using tier evidence as a backup.
          const alternative=await read(calibrated?amountRect:fitInk(rect(i,.85,.15,.20,.60),true,true),'+-0123456789.,%','colour-soft');
          if(signedPercent(alternative.text))amount={...alternative,alternative:amount,method:'soft-colour'};
        }
        if(!calibrated && expectedRows===6 && !recognition.parseText(label.text+' '+amount.text,names,canonPerk,1).rows[0]?.known) {
          const fixed=await read(rect(i,.15,.665,.12,.31),'','grey');
          if(recognition.parseText(fixed.text+' '+amount.text,names,canonPerk,1).rows[0]?.known)label=fixed;
        }
        if(label.confidence<80) {
          const alternative=await read(labelRect);
          const a=recognition.parseText(label.text+' '+amount.text,names,canonPerk,1).rows[0];
          const b=recognition.parseText(alternative.text+' '+amount.text,names,canonPerk,1).rows[0];
          const corroborated=a?.known && b?.known && !a.assumed && !b.assumed && a.name===b.name && label.confidence>=60 && alternative.confidence>=60;
          if(alternative.confidence>label.confidence)label={...alternative,alternative:label,corroborated};
          else label={...label,alternative,corroborated};
        }
        const levelRect=box(i+'-level',rect(i,.40,.14,.51,.32));
        let level=await read(levelRect,'0123456789/','level');
        const tightLevel=calibrated?levelRect:rect(i,.422,.085,.59,.18);
        for(const [crop,ink,mode] of [[tightLevel,'level-green','7'],[tightLevel,'level-soft','7'],[tightLevel,'level-channel','7'],[tightLevel,'raw','7'],[levelRect,'raw','7']]) {
          if(levelOf(level.text)!==null && level.confidence>=60)break;
          const alternative=await read(crop,'0123456789/',ink,mode);
          if(levelOf(alternative.text)!==null && alternative.confidence>=60)level={...alternative,alternative:level};
        }
        const autoFitAttempts=[];
        if(autoFit)for(const kind of ['name','percentage']) {
          const existing=kind==='name'?label:amount;
          const current=recognition.parseFieldRow(label.text,amount.text,names,canonPerk).row;
          if(current.conflict || (kind==='name'?current.known && !current.assumed && (label.confidence>=80 || label.corroborated):current.value!==null && amount.confidence>=80))continue;
          const region=kind==='name'?labelRect:amountRect;
          const boxes=Array.from({length:expectedRows},(_,j)=>box(j+'-'+kind,kind==='name'?rect(j,.15,.665,.12,.31):rect(j,.85,.15,.20,.60)));
          const bounds=recognition.autoFitBounds(region,i,boxes);
          const star=box(i+'-star',rect(i,.043,.048,.40,.30));bounds.x=Math.min(region.x,star.x+star.width+3/source.width);bounds.width=1-bounds.x;
          // Name growth stops before the upgrade fraction on the next line.
          if(kind==='name') {
            const labelArea=rect(i,.15,.665,.12,.31);
            bounds.y=Math.max(bounds.y,Math.min(region.y,labelArea.y));
            bounds.height=Math.max(region.y+region.height,labelArea.y+labelArea.height)-bounds.y;
            bounds.width=Math.min(1,Math.max(region.x+region.width,amountRect.x))-bounds.x;
          }
          const fitted=await recognition.autoFitField({box:region,bounds,budget:fitBudget,isClosed,dimensions:source,
            read:async region=>{
              const evidence=await read(region,kind==='percentage'?'+-0123456789.,%':'',kind==='name'?'grey':'colour-soft');
              autoFitAttempts.push({kind,box:region,...evidence});
              return kind==='name'?{...evidence,rawText:evidence.text,text:evidence.text.replace(/\s+[+-]\s*(?:\d+\s*)?$/,'')}:evidence;
            },
            accept:evidence=>{
              const candidate=recognition.parseFieldRow(kind==='name'?evidence.text:label.text,kind==='percentage'?evidence.text:amount.text,names,canonPerk).row;
              if(candidate.conflict || current.known && candidate.known && candidate.name!==current.name || current.value!==null && candidate.value!==null && candidate.value!==current.value)return false;
              return kind==='name'?candidate.known && candidate.nameMatch?.method==='exact'?candidate.name:null:
                candidate.value!==null && !recognition.signIssues([candidate]).length?candidate.value:null;
            }});
          if(fitted){if(kind==='name')label={...fitted,alternative:existing};else amount={...fitted,alternative:existing};}
        }
        const parsed=recognition.parseText(label.text.replace(/[’‘]/g,"'")+' '+amount.text,names,canonPerk,1);
        const canonical=canonPerk(label.text);
        const row=parsed.rows.length===1?parsed.rows[0]:{name:canonical,raw:label.text+' '+amount.text,value:null,known:names.includes(canonical),hasPercent:false};
        const star=box(i+'-star',rect(i,.043,.048,.40,.30)),c=make();c.width=30;c.height=30;
        const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,star.x*source.width,star.y*source.height,star.width*source.width,star.height*source.height,0,0,30,30);
        const unlocked=starState(ctx.getImageData(0,0,30,30).data);
        const value=level.confidence>=60?levelOf(level.text):null;
        const prior=knownTiers[i];
        const sameHall=prior?.hall===(artifact.hall || hall);
        const tierEvidence=sameHall && prior?.name===row.name && !prior.tierConflict && ['manual','percentage-level','unique-percentage'].includes(prior.tierSource)?prior.tier:null;
        const ranged={...row,...rerolls[i],level:value,levelSource:value==null?null:'ocr',unlocked,tierEvidence,
          ...(amount.confidence<60 && tierEvidence && value!==null && row.known?{observedValue:row.value,value:null,hasPercent:false}:{} )};
        const range=window.DNStoredArtifacts?.impliedRange(ranged);
        rows.push({...ranged,...(range?{...range,rangeSource:'inferred-level'}:{})});
        if(value===null)artifact.metadataWarnings.push('Row '+(i+1)+': upgrade level unclear; enter it in Correct Recognition if needed.');
        warnings.push(...parsed.warnings.filter(w=>!w.startsWith('Expected ')).map(w=>'Row '+(i+1)+': '+w));
        if((label.confidence<80 && !label.corroborated) || amount.confidence<80)warnings.push('Row '+(i+1)+': OCR evidence is weak. Verify the name and percentage.');
        evidence.push({index:i,label,amount,level,reroll:rerolls[i],...(autoFitAttempts.length?{autoFitAttempts}:{})});
      }
      const states=rows.map(r=>r.unlocked),count=states.every(s=>s!==null)?states.filter(Boolean).length:null;
      const tiered=window.DNStoredArtifacts?.backfillItem({hall:artifact.hall || hall,type:artifact.type,rows}).rows || rows;
      warnings.push(...recognition.signIssues(tiered));
      if(tiered.some(r=>!r.known || !recognition.usefulRow(r)))warnings.push('Each visible row needs a known perk and signed percentage.');
      for(const [index,row] of tiered.entries())if(row.inferredFields?.length)warnings.push('Row '+(index+1)+': '+row.inferredFields.join(' and ')+' inferred from tier evidence. Verify before keeping.');
      return {rows:tiered,warnings:[...new Set(warnings)],valid:warnings.length===0,artifact,expectedRows,hall:artifact.hall,recognitionPath:calibrated?'storage-calibrated-fields':'storage-fields',...(calibrationReason?{calibrationReason}:{}),
        unlocked:{count,states,method:'storage-row-stars'},reroll:window.DNScannerRerollRecognition?.summarize(tiered),observations:[{pass:'storage-fields',rows:tiered,warnings}],evidence};
    } finally {
      for(const c of canvases)c.width=c.height=0;
      if(!isClosed())await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
    }
  }
  window.DNStorageRecognition={detectPanel,inspect,recognize,levelOf,starState,types,rowsForType};
})();
