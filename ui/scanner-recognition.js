/*
 * Authority: Approved scanner brief; pic1.png is the first verified five-row layout.
 * Ownership: Local panel candidate detection and OCR input validation, never scoring.
 * Invariants: Preserve locked/duplicate rows; unknown or partial input needs review;
 * pixels remain local; five or six percentage-bearing rows; strong unique name matches register automatically;
 * each stat has fixed polarity and every Invading effect is negative; raw signs stay untouched.
 * History: Gold-frame layout evidence comes from one screenshot, not all game UIs.
 * Saved crafting field boxes use independent OCR with a bounded standard fallback;
 * conflicting field, hall and star evidence remains unconfirmed across that fallback.
 * Gameplay category crops follow the lowest green text line above the panel,
 * separate word-shaped ink from icons, and reject title-sized/header-only evidence.
 */
(() => {
  "use strict";
  const normalized = text => String(text || "").replace(/['’‘]/g, "").replace(/[-–—.,:;“”"()=]/g," ").replace(/\s+/g, " ").trim().toLowerCase();
  function distance(a,b) {
    let previous=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {
      const next=[i];
      for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
      previous=next;
    }
    return previous[b.length];
  }
  function glyphDistance(a,b) {
    // OCR glyph substitutions cost less than an arbitrary letter change.
    // This operates on names only. Values never enter this matcher.
    const rows=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i?j?0:i:j));
    const alike=(a,b)=>['il1','o0','uv'].some(group=>group.includes(a) && group.includes(b));
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++) {
      rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:alike(a[i-1],b[j-1])?.3:1));
      if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+.7);
      for(const [wide,narrow] of [['rn','m'],['ri','n'],['vv','w'],['cl','d']]) {
        if(i>1 && a.slice(i-2,i)===wide && b[j-1]===narrow)rows[i][j]=Math.min(rows[i][j],rows[i-2][j-1]+.4);
        if(j>1 && b.slice(j-2,j)===wide && a[i-1]===narrow)rows[i][j]=Math.min(rows[i][j],rows[i-1][j-2]+.4);
      }
    }
    return rows[a.length][b.length];
  }
  const nameParts=new WeakMap(),nameVocabulary=new WeakMap();
  function splitName(text,recoverPrefix=false) {
    let words=normalized(text).replace(/^[^a-z]+/,'').split(' '),prefix='',prefixCost=0;
    if(['enemy','invading'].includes(words[0]))prefix=words.shift();
    else if(recoverPrefix) {
      const candidates=[];
      for(const count of [1,2]) {
        if(count===2 && words[0].length>3)continue;
        const start=words.slice(0,count).join('');
        for(const target of ['enemy','invading']) {
          if(start.length<4 || start[0]!==target[0] && !(target==='invading' && start[0]==='l'))continue;
          const cost=glyphDistance(start,target);
          const limit=target==='enemy'?2:/[gm]$/.test(start)?5:3;
          if(cost<=limit)candidates.push({target,cost,count});
        }
      }
      candidates.sort((a,b)=>a.cost-b.cost);
      if(candidates[0]){prefix=candidates[0].target;prefixCost=candidates[0].cost;words=words.slice(candidates[0].count);}
    }
    const effect=words.pop() || '';
    return {prefix,prefixCost,words,entity:words.join(''),effect};
  }
  function structuredName(label,names,value) {
    const source=splitName(label,true);
    if(source.effect.length<5 || source.entity.length<3)return null;
    if(!nameParts.has(names))nameParts.set(names,names.map(name=>({name,...splitName(name)})));
    const candidates=[];
    for(const candidate of nameParts.get(names)) {
      if(candidate.prefix!==source.prefix || candidate.effect.length<5)continue;
      if(Number.isFinite(value) && expectedSign(candidate.name)!==null && expectedSign(candidate.name)!==Math.sign(value))continue;
      const effect=glyphDistance(source.effect,candidate.effect), entity=glyphDistance(source.entity,candidate.entity);
      if(source.prefixCost>3 && (entity!==0 || effect>3))continue;
      if(effect>Math.max(1.8,candidate.effect.length*.4) || entity>Math.max(.8,Math.min(3,candidate.entity.length*.22)))continue;
      if(effect>2 && entity>1.1)continue;
      // Long compound objects need an intact anchor, unless almost exact overall.
      if(candidate.entity.length>10 && entity>1.4 && !source.words.some(word=>word.length>=3 && candidate.words.includes(word)))continue;
      const cost=entity+effect+source.prefixCost*.25;
      if(cost<=4.5)candidates.push({name:candidate.name,cost,effect:candidate.effect});
    }
    candidates.sort((a,b)=>a.cost-b.cost);
    return candidates[0] && ['hitpoints','damage','healing'].includes(candidates[0].effect) && (!candidates[1] || candidates[1].cost>=candidates[0].cost+1.25)?candidates[0].name:null;
  }
  const expectedSign = name => window.DN?.expectedPerkSign?.(name) ?? (/^invading\b/i.test(name) ? -1 : null);
  function signIssues(rows) {
    const warnings=[], signs=new Map();
    for(const row of rows) {
      if(row.value===null || !Number.isFinite(row.value))continue;
      const expected=expectedSign(row.name), actual=Math.sign(row.value);
      if(expected!==null && actual!==expected)warnings.push('Invalid sign for '+row.name+': expected a '+(expected<0?'negative':'positive')+' value. Verify the original percentage.');
      const name=normalized(row.name);
      if(!signs.has(name))signs.set(name,new Set());
      signs.get(name).add(actual);
    }
    for(const [name,values] of signs)if(values.has(-1) && values.has(1))warnings.push('Mixed signs for '+name+'. A stat has one fixed sign; verify these rows.');
    return warnings;
  }
  function closeName(label,names,value) {
    // Observed OCR token confusions only. Still a suggestion against the catalogue,
    // never an alias, a new perk definition, or a percentage correction.
    const words=correctNameWords(normalized(label),names).text.split(' ');
    if(words[0]?.length>=5 && !['enemy','invading'].includes(words[0])) {
      const prefixes=['enemy','invading'].filter(prefix=>distance(words[0],prefix)<=2);
      if(prefixes.length===1)words[0]=prefixes[0];
    }
    const text=words.join(' '), qualifier=value=>value.match(/^(enemy|invading)\b/)?.[1] || '';
    if(text.length<10)return null;
    const candidates=names.map(name=>({name,text:normalized(name)}))
      .filter(item=>qualifier(item.text)===qualifier(text))
      .filter(item=>!Number.isFinite(value) || expectedSign(item.name)===null || expectedSign(item.name)===Math.sign(value))
      .map(item=>({...item,distance:distance(text,item.text)})).sort((a,b)=>a.distance-b.distance);
    const best=candidates[0], limit=text.length>=28?3:text.length>=20?2:1;
    return best && best.distance<=limit && (!candidates[1] || candidates[1].distance>best.distance+1)?best.name:structuredName(label,names,value);
  }
  // Similarity is a matching heuristic, not a calibrated OCR probability.
  // Require strong absolute evidence and separation from the runner-up.
  const NAME_MATCH_THRESHOLD=.90, NAME_MATCH_MARGIN=1.25;
  function correctNameWords(text,names) {
    if(!nameVocabulary.has(names))nameVocabulary.set(names,new Set(names.flatMap(name=>normalized(name).split(' '))));
    const protectedWords=nameVocabulary.get(names);
    return window.DNScannerNameCatalog?.correct(text,{protectedWords}) || {text,corrections:[],confidence:1};
  }
  function matchName(label,names,value,{threshold=NAME_MATCH_THRESHOLD}={}) {
    const raw=normalized(label),exact=names.find(name=>normalized(name)===raw);
    if(exact)return {name:exact,confidence:1,automatic:true,method:'exact'};
    const corrected=correctNameWords(raw,names),text=corrected.text,source=splitName(text,true);
    if(text.length<10 || source.entity.length<3)return null;
    if(!nameParts.has(names))nameParts.set(names,names.map(name=>({name,...splitName(name)})));
    const effects=new Set(nameParts.get(names).map(item=>item.effect));
    const candidates=[],input=text.replace(/\s/g,''),rawInput=raw.replace(/\s/g,'');
    const rawSimilarity=name=>{
      const target=normalized(name).replace(/\s/g,'');
      return Math.max(0,1-glyphDistance(rawInput,target)/Math.max(rawInput.length,target.length));
    };
    for(const candidate of nameParts.get(names)) {
      if(source.prefix!==candidate.prefix)continue;
      if(Number.isFinite(value) && expectedSign(candidate.name)!==null && expectedSign(candidate.name)!==Math.sign(value))continue;
      if(effects.has(source.effect) && source.effect!==candidate.effect)continue;
      const target=normalized(candidate.name).replace(/\s/g,'');
      const cost=glyphDistance(input,target),similarity=Math.max(0,1-cost/Math.max(input.length,target.length));
      candidates.push({name:candidate.name,cost,confidence:similarity*corrected.confidence});
    }
    candidates.sort((a,b)=>a.cost-b.cost || a.name.localeCompare(b.name));
    const best=candidates[0],margin=best?(candidates[1]?.cost ?? Infinity)-best.cost:0;
    if(best && best.confidence>=threshold && best.cost<=4 && margin>=NAME_MATCH_MARGIN && source.prefixCost<=1) {
      return {name:best.name,confidence:best.confidence,rawSimilarity:rawSimilarity(best.name),corrections:corrected.corrections,margin:Number.isFinite(margin)?margin:null,automatic:true,method:corrected.corrections.length?'ocr-catalogue':'ocr-glyphs'};
    }
    const suggestion=closeName(label,names,value);
    const candidate=candidates.find(item=>item.name===suggestion);
    return suggestion?{name:suggestion,confidence:candidate?.confidence ?? 0,rawSimilarity:rawSimilarity(suggestion),corrections:corrected.corrections,margin:Number.isFinite(margin)?margin:null,automatic:false,method:'suggestion'}:null;
  }
  function parsePercentage(text) {
    const match=/^([+-])\s*(\d+)(?:\s*([.,])\s*(\d+))?\s*%$/.exec(String(text || '').trim());
    if(!match)return {value:null,corrected:false,outOfRange:false};
    // Artifact percentages are whole numbers. OCR may insert punctuation
    // between the original digits; join those digits, never round a fraction.
    const corrected=!!match[3],digits=match[2]+(match[4] || '');
    const amount=Number(match[1]+digits),outOfRange=!Number.isSafeInteger(amount) || Math.abs(amount)>40;
    const ambiguous=corrected && (digits.length!==2 || digits[0]==='0');
    return {value:outOfRange || ambiguous?null:amount,corrected:corrected && !outOfRange && !ambiguous,outOfRange};
  }
  function usefulRow(row) {
    if(!row || !Number.isInteger(row.value) || Math.abs(row.value)>40)return false;
    if(signIssues([row]).length)return false;
    if(row.hasPercent===false || (!row.inferred && row.raw && !/^.+?\s*[+-]\s*\d+(?:\s*[.,]\s*\d+)?\s*%\s*$/.test(row.raw) && !(row.known && row.trailingNoise)))return false;
    if(row.known)return true;
    const name=String(row.name || '').trim(), words=name.split(/\s+/);
    return /^[a-z][a-z'’ -]*$/i.test(name) && words.filter(word=>word.length>=3).length>=2 && !/^(er|el|ene)\b/i.test(name);
  }
  function coverage(rows=[],expectedRows=5) {
    let known=0, assumed=0, collected=0;
    for(const row of rows)if(usefulRow(row)) {
      if(row.assumed || row.inferred)assumed++;else if(row.known)known++;else collected++;
    }
    const total=known+assumed+collected;
    return {known,assumed,collected,total,light:total===expectedRows && rows.length===expectedRows && !signIssues(rows).length?'green':total>0?'orange':'red'};
  }
  function textContrast(r,g,b) {
    // Boost saturated glyphs without amplifying the blue-grey panel background.
    const coloured=Math.max(g,b)>r*2;
    const light=coloured?Math.max(g,b)*2:.299*r+.587*g+.114*b;
    return 255-Math.max(0,Math.min(255,(light-35)*2.1));
  }
  function neutralTextContrast(r,g,b) {
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    return max-min<Math.max(25,max*.18)?255-Math.max(0,Math.min(255,(r-35)*2.1)):255;
  }
  function parseText(text, names, canonPerk, expectedRows = 5) {
    expectedRows=Number.isInteger(Number(expectedRows)) && Number(expectedRows)>=1 && Number(expectedRows)<=6?Number(expectedRows):5;
    const catalogue = new Map(names.map(name => [normalized(name), name]));
    const rows = [], warnings = [];
    for (const raw of String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
      if (/^artifact benefits[:\s]*$/i.test(raw)) continue;
      let match = /^(.+?)\s*([+-]\s*\d+(?:\s*[.,]\s*\d+)?)\s*%\s*$/.exec(raw);
      // Background texture often becomes tiny words after a complete percentage.
      // Accept only bounded noise after a known name; retain the original evidence.
      const noisy = !match && /^(.+?)\s*([+-]\s*\d+(?:\s*[.,]\s*\d+)?)\s*%\s+((?:[a-z]{1,2}|[»©|])(?:\s+(?:[a-z]{1,2}|[»©|])){0,2})\s*$/i.exec(raw);
      const trailingNoise=!!noisy && catalogue.has(normalized(canonPerk(noisy[1].trim())));
      if(trailingNoise)match=noisy;
      // Name extraction is independent of percentage validation. A bad sign
      // must not turn a known perk into a new catalogue label.
      const tail=/^(.*?)\s*[+«»–—-]?\s*\d+(?:\s*[.,]\s*\d+)?\s*%/.exec(raw);
      const damagedTail=/^(.*?)\s+[+«»–—=\-]\s*[^%]*%/.exec(raw);
      const label = match ? match[1].trim() : (tail?tail[1]:damagedTail?damagedTail[1]:raw.replace(/\s+[+-].*$/, "")).trim();
      const exact = catalogue.get(normalized(canonPerk(label))) || catalogue.get(normalized(label));
      const percentage=parsePercentage(match?match[2]+'%':'');
      const value=percentage.value;
      const matched=exact?{name:exact,confidence:1,automatic:true,method:'exact'}:matchName(label,names,value);
      const canonical = matched?.name;
      if(!canonical && !raw.includes('%'))continue;
      const outOfRange=percentage.outOfRange;
      rows.push({raw, rawName:label, name: canonical || label, value, known: !!canonical, assumed:!!canonical && !matched.automatic, nameCorrected:!!canonical && !exact, nameMatch:matched, hasPercent:raw.includes('%'),...(percentage.corrected?{percentageCorrected:true,rawPercentage:match[2]+'%'}:{}),...(outOfRange?{outOfRange:true}:{}),...(trailingNoise?{trailingNoise:true}:{})});
      if(outOfRange)warnings.push('Percentage outside -40% to +40%: '+raw+'. Retry or correct this row.');
      if(trailingNoise)warnings.push('Ignored background text after the percentage for '+canonical+'. Verify this row.');
      if(canonical && !matched.automatic)warnings.push('Assumed OCR spelling: '+label+' → '+canonical+'. Verify this row.');
      if (!canonical) warnings.push("Unknown or ambiguous perk: " + label);
      if (!match || !Number.isFinite(value)) warnings.push("Unreadable signed percentage: " + raw);
    }
    warnings.push(...signIssues(rows));
    if (rows.length !== expectedRows) warnings.push("Expected " + expectedRows + " visible rows; read " + rows.length + ". Check the complete panel.");
    return {rows, warnings, valid: !warnings.length};
  }
  function positionRows(parsed,lines,height,expectedRows=5) {
    if(!parsed.rows.length || parsed.rows.length>expectedRows)return parsed;
    const rows=Array.from({length:expectedRows},()=>({raw:'',name:'',value:null,known:false,hasPercent:false}));
    const occupied=new Set();
    for(const row of parsed.rows) {
      const matches=lines.filter(line=>String(line.text || '').trim()===row.raw && line.bbox)
        .map(line=>({line,index:Math.floor((line.bbox.y0+line.bbox.y1)/2/height*expectedRows)}))
        .filter(item=>item.index>=0 && item.index<expectedRows && !occupied.has(item.index)).sort((a,b)=>a.index-b.index);
      if(!matches.length)return parsed;
      const {index,line}=matches[0];occupied.add(index);rows[index]={...row,confidence:line.confidence};
    }
    return {...parsed,rows};
  }
  function parseFieldRow(nameText,percentageText,names,canonPerk) {
    // Names may include the adjacent percentage in an intentionally wide box.
    // Read the value solely from its own crop and retain both original texts.
    const label=String(nameText || '').trim().replace(/\s*[+\-\u2212]\s*\d+(?:\s*[.,]\s*\d+)?\s*%.*$/,'').trim();
    const percentage=String(percentageText || '').trim();
    const amount=parsePercentage(percentage),value=amount.value;
    const exact=names.find(name=>normalized(name)===normalized(canonPerk(label)) || normalized(name)===normalized(label));
    const matched=exact?{name:exact,confidence:1,automatic:true,method:'exact'}:matchName(label,names,value);
    const name=matched?.name;
    const row={raw:label+' '+percentage,rawName:String(nameText || ''),rawPercentage:percentage,name:name || label,value,known:!!name,assumed:!!name && !matched.automatic,nameCorrected:!!name && !exact,nameMatch:matched,hasPercent:percentage.includes('%'),...(amount.corrected?{percentageCorrected:true}:{}),...(amount.outOfRange?{outOfRange:true}:{})};
    const warnings=[];
    if(!name)warnings.push('Unknown or ambiguous perk: '+label);
    else if(!matched.automatic)warnings.push('Assumed OCR spelling: '+label+' → '+name+'. Verify this row.');
    if(value===null)warnings.push('Unreadable signed percentage: '+percentage);
    warnings.push(...signIssues([row]));
    // Overlapping crops provide an independent contradiction check.
    const adjacent=/([+-]\s*\d+(?:\s*[.,]\s*\d+)?)\s*%\s*$/.exec(String(nameText || ''));
    if(adjacent && value!==null && parsePercentage(adjacent[1]+'%').value!==value){row.conflict=true;warnings.push('Name and percentage crops disagree. Verify this row.');}
    return {row,warnings,valid:!warnings.length};
  }
  function classifyBrightness(strengths) {
    const unknown={count:null,states:Array(5).fill(null)};
    if(strengths.length!==5 || strengths.some(value=>!Number.isFinite(value)))return unknown;
    let count=1;
    for(let i=2;i<=3;i++)if(strengths[i-1]-strengths[i]>strengths[count-1]-strengths[count])count=i;
    const bright=Math.min(...strengths.slice(0,count)), dim=Math.max(...strengths.slice(count));
    if(bright-dim<12 || bright<dim*1.15)return unknown;
    return {count,states:strengths.map((_,i)=>i<count)};
  }
  function classifyStars(fills) {
    const unknown={count:null,states:Array(5).fill(null),method:'stars'};
    if(fills.length!==5 || fills.some(fill=>!Number.isFinite(fill) || (fill>.1 && fill<.3)))return unknown;
    const states=fills.map(fill=>fill>=.3),count=states.filter(Boolean).length;
    return count>=1 && count<=3 && states.every((state,index)=>state===(index<count))?{count,states,method:'stars'}:unknown;
  }
  function rowColours(pixels,width,height) {
    const radius=Math.max(2,Math.round(height/5*.08));
    const at=(x,y)=>(Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x)))*4;
    const light=p=>Math.max(pixels[p],pixels[p+1],pixels[p+2]);
    return Array.from({length:5},(_,row)=>{
      const counts={neutral:0,green:0,blue:0};
      for(let y=Math.ceil((row+.15)*height/5);y<Math.floor((row+.85)*height/5);y++)for(let x=0;x<width*.8;x++) {
        const p=(y*width+x)*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
        const neighbours=[at(x-radius,y),at(x+radius,y),at(x,y-radius),at(x,y+radius)].sort((a,b)=>light(a)-light(b));
        if(max<=(light(neighbours[1])+light(neighbours[2]))/2+12)continue;
        const background=channel=>(pixels[neighbours[1]+channel]+pixels[neighbours[2]+channel])/2;
        // Blue War-map texture has saturated edges too. A glyph must add
        // chroma relative to its neighbours, rather than merely be blue.
        const addedChroma=Math.max(g-background(1),b-background(2))-(r-background(0));
        if(Math.max(g,b)>r*1.8 && Math.max(g,b)>25 && addedChroma>20)counts[b>=g*.85?'blue':'green']++;
        else if(max-min<Math.max(25,max*.18) && max>55)counts.neutral++;
      }
      const coloured=counts.green>counts.blue?'green':'blue',other=coloured==='green'?'blue':'green';
      return counts[coloured]>30 && counts[coloured]>counts[other]*2.5 && counts[coloured]>counts.neutral*1.25?coloured:
        counts.neutral>40 && counts.neutral>Math.max(counts.green,counts.blue)*1.25?'neutral':null;
    });
  }
  function inferColourValues(parsed,colours,hall='main') {
    if(parsed.rows.length!==5)return parsed;
    const bases=window.DNArtifactStatContext?.tierBases({hall,crafting:true}) || (hall==='war'?[1,3,6]:[1,6,11]);
    const amounts={neutral:bases[0],green:bases[1],blue:bases[2]};
    const warnings=[...parsed.warnings];
    const rows=parsed.rows.map((row,index)=>{
      const amount=amounts[colours[index]],sign=row.known && !row.assumed && !row.conflict && !row.tierConflict?expectedSign(row.name):null;
      if(!amount || sign===null)return {...row,colour:colours[index]};
      if(Number.isFinite(row.value)) {
        if(Math.abs(row.value)!==amount)warnings.push('Colour and OCR disagree on row '+(index+1)+'. Check the artifact type and original percentage.');
        return {...row,colour:colours[index]};
      }
      warnings.push('Row '+(index+1)+': percentage inferred from '+colours[index]+' text and the known perk sign. Verify it.');
      return {...row,colour:colours[index],value:sign*amount,hasPercent:true,inferred:true};
    });
    return {...parsed,rows,warnings,valid:parsed.valid && warnings.length===0};
  }
  function readStars(source,layout) {
    if(layout==='text')return classifyStars([]);
    const canvas=document.createElement('canvas');
    canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),fills=[];
    for(let row=0;row<5;row++) {
      let yellow=0,total=0;
      const center=.275+.657*(row+.5)/5;
      for(let y=Math.floor((center-.018)*canvas.height);y<Math.ceil((center+.018)*canvas.height);y++)
        for(let x=Math.floor(.062*canvas.width);x<Math.ceil(.084*canvas.width);x++) {
          const i=(y*canvas.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
          if(r>160 && g>100 && b<g*.8)yellow++;
          total++;
        }
      fills.push(total?yellow/total:0);
    }
    canvas.width=canvas.height=0;
    return {...classifyStars(fills),fills};
  }
  function reconcileReads(first, retry,expectedRows=5) {
    if(!retry.valid && retry.rows.length<first.rows.length && retry.rows.every((row,i)=>
      !row.conflict && row.name===first.rows[i].name && (row.value===null || row.value===first.rows[i].value)))return first;
    if(first.rows.length && first.rows.length!==retry.rows.length) {
      // A complete independent row pass may recover omitted dim text, provided
      // the initial rows occur in order and contain no contradictory evidence.
      let cursor=0;
      const compatible=first.rows.length<retry.rows.length && first.rows.every(row=>{
        const qualifier=name=>normalized(name).match(/^(enemy|invading)\b/)?.[1] || '';
        for(;cursor<retry.rows.length;cursor++) {
          const next=retry.rows[cursor];
          if((row.known?row.name===next.name:qualifier(row.name)===qualifier(next.name)) && (row.value===null || row.value===next.value)){cursor++;return true;}
        }
        return false;
      });
      if(!compatible)return {...retry,rows:retry.rows.map(row=>({...row,conflict:true})),valid:false,warnings:[...retry.warnings,'OCR reads disagree about the visible row count. Verify the full panel.']};
    }
    if(first.rows.length===retry.rows.length) {
      const conflicting=first.rows.map((row,index)=>{
        const next=retry.rows[index];
        const qualifier=name=>normalized(name).match(/^(enemy|invading)\b/)?.[1] || '';
        return row.conflict || next.conflict || (row.known && next.known && row.name!==next.name) ||
          (row.known && Number.isFinite(row.value) && Number.isFinite(next.value) && row.value!==next.value) ||
          (Number.isFinite(row.value) && Number.isFinite(next.value) && Math.sign(row.value)!==Math.sign(next.value)) ||
          (!!row.name && !!next.name && qualifier(row.name)!==qualifier(next.name));
      });
      if(conflicting.some(Boolean))return {...retry,rows:retry.rows.map((row,index)=>conflicting[index]?{...row,conflict:true}:row),valid:false,warnings:[...retry.warnings,'OCR reads disagree about perk names or values. Verify the conflicting rows.']};
    }
    if(!retry.valid && (coverage(retry.rows,expectedRows).total<coverage(first.rows,expectedRows).total || (coverage(retry.rows,expectedRows).total===coverage(first.rows,expectedRows).total && first.rows.length===expectedRows)))return first;
    return retry;
  }
  function combineReads(first,retry,expectedRows=5) {
    if(!first || first.rows.length!==expectedRows || retry.rows.length!==expectedRows)return first?reconcileReads(first,retry,expectedRows):retry;
    if(retry.valid)return reconcileReads(first,retry,expectedRows);
    const quality=row=>usefulRow(row)?row.known?row.assumed || row.inferred?3:4:2:row.known?1:0;
    const qualifier=row=>normalized(row.name).match(/^(enemy|invading)\b/)?.[1] || '';
    let conflicts=false,changed=false;
    const rows=first.rows.map((row,index)=>{
      const next=retry.rows[index],a=qualifier(row),b=qualifier(next);
      const conflict=row.conflict || next.conflict || !!row.name && !!next.name && (
        row.known && next.known && row.name!==next.name ||
        Number.isFinite(row.value) && Number.isFinite(next.value) && row.value!==next.value ||
        a!==b && (row.known && next.known || a && b));
      if(conflict){
        conflicts=true;
        const amount=(retry.hall==='war'?{neutral:1,green:3,blue:6}:{neutral:1,green:6,blue:11})[next.colour];
        // Fresh signed OCR can improve the display, but numeric disagreement
        // remains explicit and can never confirm a rating.
        const improved=row.known && next.known && row.name===next.name && !next.inferred && amount && Math.abs(next.value)===amount && Math.abs(row.value)!==amount && usefulRow(next);
        return {...(improved?next:row),conflict:true};
      }
      if(quality(next)>quality(row)){changed=true;return next;}
      return row;
    });
    if(!changed && !conflicts)return first;
    return {...retry,rows,valid:false,warnings:[...new Set([...first.warnings,...retry.warnings]),conflicts?'OCR reads disagree about perk names or values. Verify the conflicting rows.':'Combined the clearest compatible rows from separate reads. Verify these rows.']};
  }
  function retainCraftRead(first,retry,expectedRows=5,{sameEncounter=false}={}) {
    if(!first || !sameEncounter && (first.hall && retry.hall && first.hall!==retry.hall || first.artifact?.type && retry.artifact?.type && first.artifact.type!==retry.artifact.type))return retry;
    const usable=row=>row?.known && row.name && Number.isFinite(row.value) && row.hasPercent!==false && !row.conflict && !row.tierConflict && !row.outOfRange && !row.scoreExcluded && !row.estimated;
    // A suggested or disputed reading still supplies a display candidate. Its
    // uncertainty stays attached; weaker retries must not erase it or flicker
    // between names while the scorer waits for reliable evidence.
    const displayable=row=>row?.known && row.name && !row.scoreExcluded && !row.estimated;
    const knownName=row=>row?.known && !row.assumed;
    const exactName=row=>knownName(row) && (row.nameSource==='manual' || !row.nameMatch || row.nameMatch.method==='exact');
    const strength=row=>[
      row.conflict || row.tierConflict || row.outOfRange?0:1,
      row.valueSource==='manual' || row.tierSource==='manual'?3:row.assumed?0:row.inferred || Number.isFinite(row.confidence) && row.confidence<80?1:2,
      Number.isFinite(row.value) && row.hasPercent!==false?1:0,
      Number.isFinite(row.confidence)?row.confidence:0,
      row.nameMatch?.confidence || 0
    ];
    const stronger=(next,prior)=>{const a=strength(next),b=strength(prior),index=a.findIndex((value,i)=>value!==b[i]);return index>=0 && a[index]>b[index];};
    let retained=false;
    const rows=Array.from({length:expectedRows},(_,index)=>{
      const prior=first.rows[index],next=retry.rows[index];
      if(!displayable(prior))return next || prior || {name:'',value:null,known:false,hasPercent:false};
      // Identity is independent of numeric/conflict confidence. A clear known
      // name must never become a suggested fuzzy match or raw OCR gibberish.
      if(knownName(prior) && !exactName(next)){retained=true;return prior;}
      const lostPercentage=Number.isFinite(prior.value) && prior.hasPercent!==false && (!Number.isFinite(next?.value) || next?.hasPercent===false);
      const manualName=prior.nameSource==='manual';
      if(displayable(next) && !lostPercentage && (!manualName || next.name===prior.name) && (!usable(prior) || usable(next)) && stronger(next,prior))return manualName?{...next,nameSource:'manual'}:next;
      if(!usable(next) || next.name!==prior.name || next.value!==prior.value)retained=true;
      return prior;
    });
    // Stars and metadata are independent fields. An uncertain retry must not
    // discard their identified evidence while retaining the stat text.
    const states=rows.map((row,index)=>{
      const prior=first.unlocked?.states?.[index] ?? first.rows[index]?.unlocked;
      const next=retry.unlocked?.states?.[index] ?? retry.rows[index]?.unlocked;
      const state=typeof next==='boolean'?next:prior;
      if(typeof state==='boolean')rows[index]={...row,unlocked:state,
        unlockedSource:typeof next==='boolean'?retry.rows[index]?.unlockedSource:first.rows[index]?.unlockedSource};
      return state;
    });
    const identifiedHall=read=>['hall-colour','crafting-label','percentage-tier','manual'].includes(read.hallSource);
    const hallRead=identifiedHall(first) && !identifiedHall(retry)?first:retry;
    const artifact=retry.artifact?.type && !retry.metadataConflict?retry.artifact:first.artifact || retry.artifact;
    const unlocked={...retry.unlocked,states,count:states.every(state=>typeof state==='boolean')?states.filter(Boolean).length:null};
    return {...retry,artifact,metadataConflict:artifact===first.artifact?first.metadataConflict:retry.metadataConflict,
      hall:hallRead.hall || first.hall,hallSource:hallRead.hallSource,unlocked,rows,
      valid:(!!first.valid || !!retry.valid && !retained) && rows.every(row=>usable(row) && !row.assumed && !row.inferred),
      warnings:[...new Set([...(retry.warnings || []),...(retained?['Retained the stronger previous row readings.']:[])])]};
  }
  function detectPanel(source,{storage=false}={}) {
    // Gold horizontal borders produce candidates only, not artifact confirmation.
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / source.width);
    canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext("2d", {willReadFrequently:true});
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
    const gold = index => { const r=data[index], g=data[index+1], b=data[index+2]; return storage?
      r>125 && g>90 && r>g*1.02 && r<g*1.9 && g>b*1.12:
      r>100 && g>65 && r>g*1.12 && r<g*2.1 && g>b*1.22; };
    const spans=[];
    for(let y=0;y<canvas.height;y++) {
      let start=-1, gap=0;
      for(let x=0;x<=canvas.width;x++) {
        if(x<canvas.width && gold((y*canvas.width+x)*4)) { if(start<0)start=x; gap=0; }
        else if(start>=0 && (++gap>3 || x===canvas.width)) {
          const end=x-gap+1;
          if(end-start>canvas.width*(storage?.45:.25)) spans.push({x:start,y,width:end-start});
          start=-1; gap=0;
        }
      }
    }
    let best=null, bestScore=0;
    for(const top of spans) for(const bottom of spans) {
      const height=bottom.y-top.y;
      if(height<top.width*(storage?.6:.3) || height>top.width*(storage?1.05:.8) || Math.abs(top.x-bottom.x)>12 || Math.abs(top.width-bottom.width)>24) continue;
      const score=Math.min(top.width,bottom.width)+height;
      if(score>bestScore) { bestScore=score; best={x:Math.min(top.x,bottom.x)/canvas.width,y:top.y/canvas.height,width:Math.max(top.width,bottom.width)/canvas.width,height:height/canvas.height}; }
    }
    canvas.width=canvas.height=0;
    return best && window.DNScannerCore.validRegion(best) ? best : null;
  }
  function parseCraftCategory(text,confidence=100) {
    const exact=/^\s*(?:war\s+)?(?:weapon|armor|armour|jewelry|jewellery|pottery|equipment)\s*$/i.test(String(text || ''));
    // Ornate category fonts can score poorly even with an exact label. Accept
    // only a complete whitelist label at moderate confidence; never fuzzy names.
    if(confidence<40 || confidence<70 && !exact)return null;
    const labels=new Map([['weapon','Weapon'],['armor','Armor'],['armour','Armor'],['jewelry','Jewelry'],['jewellery','Jewelry'],['pottery','Pottery'],['equipment','Equipment']]);
    const matches=[...String(text || '').toLowerCase().matchAll(/\b(weapon|armor|armour|jewelry|jewellery|pottery|equipment)\b/g)].map(match=>labels.get(match[1]));
    const types=[...new Set(matches)];return types.length===1?types[0]:null;
  }
  function craftCategoryEvidence({text='',confidence=0,words=[]}={}) {
    const types=new Set([parseCraftCategory(text,confidence),...words.map(word=>parseCraftCategory(word.text,Number.isFinite(word.confidence)?word.confidence:0))].filter(Boolean));
    return types.size===1?[...types][0]:null;
  }
  function categoryLine(data,width,height) {
    // The category is the lowest green text line above the benefits panel.
    // Titles can wrap or use the same green, so find the line before OCR rather
    // than interpreting a category word in the artifact's title as metadata.
    const bands=[];let band=null,gap=0;
    for(let y=0;y<height;y++) {
      let count=0,left=width,right=0;
      for(let x=0;x<width;x++) {
        const p=(y*width+x)*4,r=data[p],g=data[p+1],b=data[p+2];
        if(data[p+3]>=128 && g>60 && g>r*1.25 && g>b*1.05){count++;left=Math.min(left,x);right=x+1;}
      }
      if(count>=Math.max(3,width*.005)) {
        if(!band){band={x:left,y,right,bottom:y+1,ink:0};bands.push(band);}
        band.x=Math.min(band.x,left);band.right=Math.max(band.right,right);band.bottom=y+1;band.ink+=count;gap=0;
      }else if(++gap>2)band=null;
    }
    const line=bands.findLast(band=>band.bottom-band.y>=4 && band.right-band.x>=(band.bottom-band.y)*1.5 && band.ink>=30);
    if(!line)return null;
    // A category icon is taller and narrower than a word. Separate horizontal
    // ink groups so the helmet/jewel/blades do not become low-confidence OCR
    // letters. Keep multiple word-shaped groups, including a visible "War".
    const groups=[];let group=null,blank=0;
    const wordGap=Math.max(3,Math.round((line.bottom-line.y)*.3));
    for(let x=line.x;x<line.right;x++) {
      let count=0,top=height,bottom=0;
      for(let y=line.y;y<line.bottom;y++) {
        const p=(y*width+x)*4,r=data[p],g=data[p+1],b=data[p+2];
        if(data[p+3]>=128 && g>60 && g>r*1.25 && g>b*1.05){count++;top=Math.min(top,y);bottom=y+1;}
      }
      if(count){if(!group){group={x,right:x+1,y:top,bottom};groups.push(group);}group.right=x+1;group.y=Math.min(group.y,top);group.bottom=Math.max(group.bottom,bottom);blank=0;}
      else if(++blank>wordGap)group=null;
    }
    const words=groups.filter(group=>group.bottom-group.y>=4 && group.right-group.x>=(group.bottom-group.y)*1.5);
    if(!words.length)return null;
    const text={x:words[0].x,right:words.at(-1).right,y:Math.min(...words.map(word=>word.y)),bottom:Math.max(...words.map(word=>word.bottom))};
    const padding=Math.max(3,Math.round((text.bottom-text.y)*.25)),x=Math.max(0,text.x-padding),y=Math.max(0,text.y-padding);
    return {x,y,width:Math.min(width,text.right+padding)-x,height:Math.min(height,text.bottom+padding)-y};
  }
  function categoryRect(source,region) {
    if(!source?.width || !source?.height || !region)return null;
    const x=Math.max(0,(region.x-region.width*.3)*source.width),y=Math.max(0,(region.y-region.height*.34)*source.height);
    const right=Math.min(source.width,(region.x+region.width)*source.width),bottom=Math.min(source.height,(region.y-region.height*.1)*source.height);
    const fallback=bottom>y && right>x?{x:Math.floor(x),y:Math.floor(y),width:Math.ceil(right-x),height:Math.ceil(bottom-y)}:null;
    if(!fallback || typeof source.getContext!=='function')return fallback;
    // Include the full category even below a two-line title, stopping before
    // the gold border. Search farther left to follow centred short/long titles.
    const left=Math.max(0,Math.floor((region.x-region.width*.65)*source.width)),top=Math.max(0,Math.floor((region.y-region.height*.65)*source.height));
    const end=Math.min(source.height,Math.floor((region.y-region.height*.015)*source.height));
    if(end<=top || right<=left)return fallback;
    const context=source.getContext('2d',{willReadFrequently:true}),width=Math.floor(right)-left,height=end-top;
    const line=categoryLine(context.getImageData(left,top,width,height).data,width,height);
    if(!line)return fallback;
    // A large title higher in the header is not a category when the actual
    // category is absent or clipped. Leave metadata unknown in that case.
    if(line.y+top+line.height<(region.y-region.height*.2)*source.height || line.height>region.height*source.height*.23)return null;
    return {...line,x:line.x+left,y:line.y+top};
  }
  function classifyHallColour(data) {
    let red=0,blue=0,total=0;
    for(let i=0;i<data.length;i+=4) {
      if(data[i+3]<128)continue;
      total++;
      const r=data[i],g=data[i+1],b=data[i+2];
      // Exclude gold trim, green category text and the grey-blue panel backing.
      if(r>35 && r>g*1.4 && r>b*1.35)red++;
      if(b>35 && b>r*1.4 && b>g*1.12)blue++;
    }
    const minimum=Math.max(12,total*.015);
    return red>=minimum && red>blue*2.5?'main':blue>=minimum && blue>red*2.5?'war':null;
  }
  function hallColour(source,{banner=false}={}) {
    if(!source?.width || !source?.height)return null;
    // The benefits ribbon sits above the stat rows in the anchored gold panel.
    const x=banner?Math.floor(source.width*.03):0,y=banner?Math.floor(source.height*.04):0;
    const width=banner?Math.max(1,Math.floor(source.width*.55)):source.width;
    const height=banner?Math.max(1,Math.floor(source.height*.20)):source.height;
    return classifyHallColour(source.getContext('2d',{willReadFrequently:true}).getImageData(x,y,width,height).data);
  }
  function craftHall({type,rawType='',confidence=100,rows=[],selected='main',colourHall=null,colourOnly=false}={}) {
    if(colourHall==='main' || colourHall==='war')return {hall:colourHall,source:'hall-colour'};
    if(colourOnly)return {hall:selected==='war'?'war':'main',source:'selected-hall'};
    if(type==='Pottery' || type==='Jewelry')return {hall:'main',source:'crafting-label'};
    if(type==='Equipment' || confidence>=40 && /^\s*war\s+(weapon|armor|armour)\s*$/i.test(rawType))return {hall:'war',source:'crafting-label'};
    // Only original percentages can identify a tier; colour-inferred values
    // already depend on the hall and must never be used to detect it.
    const tiers=new Set(rows.filter(row=>!row.inferred && !row.estimated && !row.conflict && Number.isFinite(row.value))
      .map(row=>[3].includes(Math.abs(row.value))?'war':[11].includes(Math.abs(row.value))?'main':null).filter(Boolean));
    if(tiers.size===1)return {hall:[...tiers][0],source:'percentage-tier'};
    return {hall:selected==='war'?'war':'main',source:'selected-hall'};
  }
  // One frozen read owns the budget and worker. Geometry proposals never save
  // calibration or establish evidence for a different encounter/crop.
  async function autoFitField({box,bounds={x:0,y:0,width:1,height:1},read,accept,isClosed=()=>false,budget,dimensions=null}) {
    let previous=null,lastRect=box,lastPixels=null;
    for(let step=1;step<=8 && budget.remaining>0;step++) {
      if(isClosed())throw new Error('Recognition stopped');
      const factor=1.1**step,cx=box.x+box.width/2,cy=box.y+box.height/2;
      const x=Math.max(bounds.x,cx-box.width*factor/2),y=Math.max(bounds.y,cy-box.height*factor/2);
      const rect={x,y,width:Math.min(bounds.x+bounds.width,cx+box.width*factor/2)-x,height:Math.min(bounds.y+bounds.height,cy+box.height*factor/2)-y};
      if(rect.width<=0 || rect.height<=0 || lastRect && ['x','y','width','height'].every(key=>Math.abs(rect[key]-lastRect[key])<1e-9))break;
      lastRect=rect;
      if(dimensions) {
        const pixels=window.DNScannerCore.cropPixels(rect,dimensions.width,dimensions.height);
        if(!pixels || pixels.width*pixels.height>4000000)break;
        const key=JSON.stringify(pixels);if(key===lastPixels)continue;lastPixels=key;
      }
      budget.remaining--;
      const evidence=await read(rect);
      if(isClosed())throw new Error('Recognition stopped');
      const key=evidence?.confidence>=80?accept(evidence):null;
      if(key===false)return null;
      if(key!==null && key!==undefined && previous && previous.key!==key)return null;
      if(key!==null && key!==undefined && previous?.key===key)return {...evidence,autoFit:{box:rect,steps:step},evidenceSource:'expanded-field'};
      if(key!==null && key!==undefined)previous={key};
    }
    return null;
  }
  function autoFitBounds(box,index,boxes) {
    const center=item=>item.y+item.height/2,cy=center(box);
    const top=index?Math.max(0,Math.min(box.y,(center(boxes[index-1])+cy)/2)):0;
    const bottom=index<boxes.length-1?Math.min(1,Math.max(box.y+box.height,(center(boxes[index+1])+cy)/2)):1;
    return {x:0,y:top,width:1,height:bottom-top};
  }
  function create({names, canonPerk}) {
    const workers=new Map(),initializing=new Map(),warmed=new Set();let closed=false,fieldEvidence=null;
    async function getWorker(kind='standard') {
      if(closed) throw new Error("Recognition stopped");
      if(!initializing.has(kind)) initializing.set(kind,(async () => {
        const base = new URL("./vendor/tesseract/", document.baseURI).href;
        const created = await window.Tesseract.createWorker("eng", 1, {
          workerPath:base+"worker.min.js", corePath:base+"core/", langPath:base+(kind==='fast'?'lang-fast/':'lang/'),
          workerBlobURL:false, cachePath:kind==='fast'?'dn-eng-fast-7d4322bd':'dn-eng-standard-ed350f37',logger:() => {},
        });
        if(closed) { await created.terminate(); throw new Error("Recognition stopped"); }
        workers.set(kind,created);
        await created.setParameters({tessedit_pageseg_mode:"6", preserve_interword_spaces:"1"});
        warmed.add(kind);
        return created;
      })());
      return initializing.get(kind);
    }
    async function recognize(source, {expectedRows=5, layout="panel",hall='main',manualType=null,inferColours=false,categorySource=null,titleSource=null,fields=null,colourHall=null,knownTiers=[],isCurrent=()=>true,fieldReuse=null,autoFit=true,fitBudget={remaining:24}}={},fallbackEncounter=null) {
      const stopped=()=>closed || !isCurrent();
      const check=()=>{if(stopped())throw new Error('Recognition superseded or stopped');};
      if(stopped())fieldEvidence=null;
      check();
      expectedRows=Number(expectedRows)===6?6:5;
      // Freeze small field crops synchronously, before worker initialization yields.
      let fieldViews;
      try{fieldViews=layout==='panel' && fields?window.DNScannerFieldRecognition?.snapshot(fields,{autoFit}):null;}
      catch(error){fieldEvidence=null;throw error;}
      const scoped=value=>typeof value==='string' || typeof value==='number' && Number.isFinite(value);
      const reuseKey=fieldViews?.valid && fieldViews.reuseGeometry && scoped(fieldReuse?.epoch) && scoped(fieldReuse?.profile)?
        JSON.stringify([fieldReuse.epoch,fieldReuse.profile,fieldViews.reuseGeometry]):null;
      // No context means an isolated read. Keep just one bounded encounter,
      // including the complete crop geometry and OCR profile in its identity.
      if(!fallbackEncounter && (!reuseKey || fieldEvidence?.key!==reuseKey))fieldEvidence=reuseKey?{key:reuseKey,entries:new Map()}:null;
      const encounter=reuseKey?fieldEvidence:null;
      const reuse=encounter?{entries:encounter.entries,byteLimit:8*1024*1024}:null;
      let completedEvidenceResult=null;
      const commitEvidence=result=>{
        check();
        completedEvidenceResult=result;
        return result;
      };
      let activeWorker;
      try {activeWorker=await getWorker(fieldViews?.valid?'fast':'standard');check();}catch(error){if(fieldEvidence===encounter)fieldEvidence=null;fieldViews?.release?.();throw error;}
      let ocrCalls=0;
      const readView=async(...args)=>{check();ocrCalls++;const output=await activeWorker.recognize(...args);check();return output;};
      if(layout==='storage' || layout==='storage-rows' || layout==='storage-rows-dice')return window.DNStorageRecognition.recognize(source,{worker:activeWorker,names,canonPerk,expectedRows,layout,hall,manualType,knownTiers,fields,isClosed:stopped,autoFit,fitBudget});
      let artifactName=null,nameEvidence=null;
      if(titleSource?.width && titleSource?.height) {
        try {
          await activeWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
          const read=await readView(titleSource,{}, {text:true,blocks:true});
          const rawName=String(read.data.text || '').replace(/\s+/g,' ').trim(),name=cleanArtifactName(rawName);
          if(read.data.confidence>=60 && /[a-z]{3}/i.test(name) && name.length<=160)artifactName=name;
          nameEvidence={text:rawName.slice(0,500),confidence:Number.isFinite(read.data.confidence)?read.data.confidence:null,accepted:!!artifactName};
        } finally {if(!closed)await activeWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});}
      }
      if(fieldViews?.valid) {
        try {
          let calibrated=await window.DNScannerFieldRecognition.recognize(fieldViews,{worker:activeWorker,readView,names,canonPerk,hall,inferColours,categorySource,isClosed:stopped,ocrCalls:()=>ocrCalls,reuse,autoFit,fitBudget});
          if(artifactName || nameEvidence)calibrated={...calibrated,artifact:{...calibrated.artifact,...(artifactName?{name:artifactName}:{}),...(nameEvidence?{nameEvidence}:{})}};
          // Metadata uses its own pixels. Repeating every text row cannot repair
          // an unread category or star, and used to multiply complete read time.
          if(calibrated.valid) {
            if(calibrated.unlocked.count===null) {
              const stars=readStars(source,layout);
              if(stars.count!==null)calibrated={...calibrated,unlocked:stars,rows:calibrated.rows.map((row,i)=>({...row,unlocked:stars.states[i]}))};
            }
            return commitEvidence(calibrated);
          }
          // A bounded standard pass protects established successful reads.
          // Contradictory field evidence still goes through the conflict rules.
          await activeWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
          const fallback=await recognize(source,{expectedRows,layout,hall:calibrated.hall || hall,inferColours,categorySource,
            colourHall:calibrated.hallSource==='hall-colour'?calibrated.hall:null,isCurrent,autoFit,fitBudget},encounter);
          let selected=combineReads(calibrated,fallback,expectedRows);
          // Standard crafting supplies the fresh-craft rule, not independent
          // dice pixels. Explicit calibrated controls, including unreadable ones,
          // must survive whichever text rows the fallback selected.
          selected={...selected,rows:selected.rows.map((row,index)=>{
            const observed=calibrated.rows[index];
            return observed?.rerollSource==='dice-background'?{...row,
              rerollEligible:observed.rerollEligible,rerollSource:observed.rerollSource,
              rerollConfidence:observed.rerollConfidence,rerollEvidence:observed.rerollEvidence,
              rerollConflict:observed.rerollConflict}:row;
          })};
          const fieldConflict=calibrated.rows.some(row=>row.conflict || row.tierConflict);
          const categoryConflict=calibrated.artifact?.type && fallback.artifact?.type && calibrated.artifact.type!==fallback.artifact.type;
          const starConflict=calibrated.unlocked.count!==null && fallback.unlocked.count!==null && calibrated.unlocked.count!==fallback.unlocked.count;
          const artifact=calibrated.artifact?.type?calibrated.artifact:selected.artifact || fallback.artifact;
          return commitEvidence({...selected,hall:fallback.hall,hallSource:fallback.hallSource,...(artifact?{artifact:{...artifact,hall:fallback.hall,...(categoryConflict?{type:''}:{})}}:{}),
            valid:selected.valid && !fieldConflict && !calibrated.metadataConflict && !categoryConflict && !starConflict,
            warnings:[...selected.warnings,...(fieldConflict?['Calibrated field evidence conflicts. Verify the conflicting rows.']:[]),...(calibrated.metadataConflict || categoryConflict?['Calibrated hall or category evidence conflicts. Verify the labels.']:[]),...(starConflict?['Calibrated stars and standard read disagree. Check the star boxes.']:[])],
            ...(starConflict?{unlocked:{count:null,states:Array(5).fill(null),method:'conflict'},rows:selected.rows.map(row=>({...row,unlocked:null}))}:{}),
            recognitionPath:'calibrated-fields+standard-fallback',ocrCalls:ocrCalls+fallback.ocrCalls,...(reuse?{reusedFields:calibrated.reusedFields}:{}),
            observations:[...calibrated.observations,...fallback.observations],calibrationWarnings:calibrated.warnings});
        }
        catch(error){if(fieldEvidence===encounter)fieldEvidence=null;throw error;}
        finally {
          fieldViews.release();
          try {
            if(!closed)await activeWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
            check();
            if(completedEvidenceResult && reuse && fieldEvidence===encounter) {
              encounter.entries=new Map([...(reuse.verified || [])].filter(([,entry])=>{
                const row=completedEvidenceResult.rows[entry.index];
                return row?.known && !row.assumed && !row.inferred && !row.conflict && !row.tierConflict &&
                  row.confidence>=80 && row.name===entry.name && row.value===entry.value;
              }));
            }
          }catch(error){if(fieldEvidence===encounter)fieldEvidence=null;throw error;}
        }
      }
      let artifact=null;
      const selectedHall=hall;
      if(categorySource?.width && categorySource?.height) {
        try {
          await activeWorker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '});
          const read=await readView(categorySource,{}, {text:true,blocks:true});
          if(closed)throw new Error('Recognition stopped');
          const lines=(read.data.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(paragraph=>paragraph.lines || []));
          const detected=[...new Set(lines.flatMap(line=>[parseCraftCategory(line.text,line.confidence),...(line.words || []).map(word=>parseCraftCategory(word.text,word.confidence))]).filter(Boolean))];
          const type=detected.length===1?detected[0]:detected.length?null:parseCraftCategory(read.data.text,read.data.confidence);
          artifact={type:type || '',hall,source:'crafting-label',rawType:read.data.text,categoryConfidence:read.data.confidence};
        } catch(error) {if(closed)throw error;}
        finally {if(!closed)await activeWorker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});}
      }
      if(artifactName || nameEvidence)artifact={...artifact,...(artifactName?{name:artifactName}:{}),...(nameEvidence?{nameEvidence}:{})};
      let calibrated=null;
      if(layout==='panel') {
        const candidate=detectPanel(source);
        if(candidate) {
          const rect=window.DNScannerCore.cropPixels(candidate,source.width,source.height);
          calibrated=document.createElement('canvas');calibrated.width=rect.width;calibrated.height=rect.height;
          calibrated.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
          source=calibrated;
        }
      }
      colourHall=colourHall || (layout==='panel'?hallColour(source,{banner:true}):null);
      hall=craftHall({colourHall,colourOnly:true,selected:selectedHall}).hall;
      const canvas=document.createElement("canvas");
      // Relative inner text region is verified only for the supplied gold-frame
      // crafted-artifact layout. Text-only calibration bypasses this layout crop.
      const roi=layout==="text" ? {x:0,y:0,width:source.width,height:source.height} :
        {x:source.width*.115,y:source.height*.275,width:source.width*.84,height:source.height*.657};
      const scale=Math.max(1, Math.min(2, 1200/roi.width));
      canvas.width=Math.round(roi.width*scale); canvas.height=Math.round(roi.height*scale);
      const context=canvas.getContext("2d", {willReadFrequently:true});
      context.drawImage(source,roi.x,roi.y,roi.width,roi.height,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const originalPixels=new Uint8ClampedArray(pixels.data);
      const unlocked=readStars(source,layout);
      const colours=rowColours(originalPixels,canvas.width,canvas.height);
      const annotate=parsed=>{
        const classification=craftHall({colourHall,colourOnly:true,selected:selectedHall});
        hall=classification.hall;
        if(artifact)artifact={...artifact,hall};
        const annotated=inferColours?inferColourValues(parsed,colours,hall):parsed;
        const rows=annotated.rows.map((row,index)=>{
          const next={...row,colour:annotated.rows.length===5?colours[index]:null,unlocked:annotated.rows.length===5?unlocked.states[index]:null,level:1,levelSource:'crafting',rerollEligible:true,rerollSource:'fresh-craft',rerollConfidence:'high'};
          return window.DNStoredArtifacts?.craftingTier(next,{hall,type:artifact?.type}) || next;
        });
        const conflicts=rows.flatMap((row,index)=>row.tierConflict?['Row '+(index+1)+': colour and starting percentage conflict. Verify the tier.']:[]);
        return {...annotated,valid:annotated.valid && !conflicts.length,warnings:[...new Set([...annotated.warnings,...conflicts])],...(artifact?{artifact}:{}),hall,hallSource:classification.source,inferColours,colours,unlocked,ocrCalls,recognitionPath:'standard',...(fieldViews?.reason?{calibrationReason:fieldViews.reason}:{}),rows};
      };
      const rowBytes=pixels.data.length/5;
      for(let i=0;i<pixels.data.length;i+=4) {
        const neutral=hall==='war' && colours[Math.min(4,Math.floor(i/rowBytes))]==='neutral';
        const value=(neutral?neutralTextContrast:textContrast)(pixels.data[i],pixels.data[i+1],pixels.data[i+2]);
        pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
      }
      context.putImageData(pixels,0,0);
      try {
        const result=await readView(canvas, {}, {text:true,blocks:true});
        if(closed) throw new Error("Recognition stopped");
        let parsed=parseText(result.data.text,names,canonPerk,expectedRows);
        const lines=(result.data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []));
        parsed=positionRows(parsed,lines,canvas.height,expectedRows);
        if(!lines.length) { parsed.warnings.push("Missing OCR line evidence. Verify the recognised rows."); parsed.valid=false; }
        const low=lines.filter(line => !/^artifact benefits/i.test(line.text.trim()) && line.confidence<80);
        if(low.length) { parsed.warnings.push("OCR evidence is weak on " + low.length + " line(s). Verify the names and percentages."); parsed.valid=false; }
        const firstObservation={pass:'block',rows:parsed.rows,warnings:[...parsed.warnings]};
        if(annotate(parsed).valid)return annotate({...parsed,observations:[firstObservation]});
        // Difficult dimmed rows get a bounded, independent single-line pass.
        // Close spelling suggestions remain assumptions requiring review.
        const rowCanvas=document.createElement('canvas');
        const rowContext=rowCanvas.getContext('2d',{willReadFrequently:true});
        const rowHeight=canvas.height/expectedRows;
        const rowTexts=[], confidences=[], colourReads=[], percentageReads=[],autoFitReads=[],autoFitAttempts=[];
        await activeWorker.setParameters({tessedit_pageseg_mode:'7'});
        try {
          for(let index=0;index<expectedRows;index++) {
            if(closed)throw new Error('Recognition stopped');
            const block=parsed.rows.length===expectedRows?parsed.rows[index]:null;
            const amount=expectedRows===5?(hall==='war'?{neutral:1,green:3,blue:6}:{neutral:1,green:6,blue:11})[colours[index]]:null;
            if(block?.known && !block.assumed && usefulRow(block) && block.confidence>=80 && (!amount || Math.abs(block.value)===amount)) {
              rowTexts.push(block.raw);confidences.push(block.confidence);continue;
            }
            rowCanvas.width=canvas.width+32;rowCanvas.height=Math.ceil(rowHeight)+24;
            rowContext.fillStyle='#fff';rowContext.fillRect(0,0,rowCanvas.width,rowCanvas.height);
            rowContext.drawImage(canvas,0,index*rowHeight,canvas.width,rowHeight,16,12,canvas.width,rowHeight);
            const normalRow=rowContext.getImageData(0,0,rowCanvas.width,rowCanvas.height);
            const single=await readView(rowCanvas,{}, {text:true,blocks:true});
            const evidence=(single.data.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(paragraph=>paragraph.lines || []));
            let text=single.data.text.trim(), confidence=evidence.length?Math.min(...evidence.map(line=>line.confidence)):0;
            const initial=parseText(text,names,canonPerk).rows[0];let colourMask=null;
            if(!initial?.known || !usefulRow(initial) || confidence<80 || amount && Math.abs(initial.value)!==amount) {
              // A second, bounded row view isolates coloured ink from the panel.
              // This reads the original glyphs; no percentage substitution.
              const start=Math.floor((index+.12)*rowHeight), end=Math.ceil((index+.88)*rowHeight);
              rowCanvas.width=canvas.width+32;rowCanvas.height=end-start+24;
              rowContext.fillStyle='#fff';rowContext.fillRect(0,0,rowCanvas.width,rowCanvas.height);
              const mask=rowContext.getImageData(0,0,rowCanvas.width,rowCanvas.height);let ink=0;
              for(let y=start;y<end;y++)for(let x=0;x<canvas.width;x++) {
                const p=(y*canvas.width+x)*4, r=originalPixels[p],g=originalPixels[p+1],b=originalPixels[p+2];
                const colour=colours[index];
                const saturated=Math.max(g,b)>r*1.8 && Math.max(g,b)>25;
                if(colour!=='neutral' && saturated && (colour==='green'?g>b*1.2:colour==='blue'?b>=g*.85:true)) {
                  const target=((y-start+12)*rowCanvas.width+x+16)*4;
                  mask.data[target]=mask.data[target+1]=mask.data[target+2]=0;ink++;
                }
              }
              if(ink>30) {
                colourMask=mask;
                rowContext.putImageData(mask,0,0);
                const alternative=await readView(rowCanvas,{}, {text:true,blocks:true});
                const candidate=parseText(alternative.data.text,names,canonPerk).rows[0];
                const lines=(alternative.data.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(paragraph=>paragraph.lines || []));
                const quality=lines.length?Math.min(...lines.map(line=>line.confidence)):0;
                colourReads.push({index,text:alternative.data.text.trim(),quality});
                const recoverable=usefulRow(candidate) || (candidate?.known && colours[index] && candidate.value===null && inferColours);
                const improvedValue=quality>=80 && initial?.known && candidate?.known && initial.name===candidate.name && amount && Math.abs(initial.value)!==amount && Math.abs(candidate.value)===amount;
                if(recoverable && quality>=60 && (!initial || initial.value===null || initial.value===candidate.value || improvedValue) && (!initial?.known || initial.name===candidate.name)) {
                  text=alternative.data.text.trim();confidence=quality;
                }
              }
            }
            if(initial?.known && !initial.assumed && !usefulRow(parseText(text,names,canonPerk).rows[0])) {
              const words=evidence.flatMap(line=>line.words || []);
              const tail=words.filter(word=>/[\d%«»]/.test(word.text || '') && word.bbox);
              if(tail.length) {
                const left=Math.max(0,Math.floor(Math.min(...tail.map(word=>word.bbox.x0))-rowHeight*.45));
                const right=Math.min(normalRow.width,Math.ceil(Math.max(...tail.map(word=>word.bbox.x1))+rowHeight*.25));
                const focused=[];
                await activeWorker.setParameters({tessedit_char_whitelist:'+-0123456789.,%'});
                try {
                  for(const view of [normalRow,colourMask || normalRow]) {
                    rowCanvas.width=view.width;rowCanvas.height=view.height;rowContext.putImageData(view,0,0);
                    if(view===normalRow && focused.length) {
                      const binary=rowContext.getImageData(0,0,rowCanvas.width,rowCanvas.height);
                      for(let p=0;p<binary.data.length;p+=4)binary.data[p]=binary.data[p+1]=binary.data[p+2]=binary.data[p]<180?0:255;
                      rowContext.putImageData(binary,0,0);
                    }
                    const output=await readView(rowCanvas,{rectangle:{left,top:0,width:right-left,height:view.height}},{text:true,blocks:true});
                    const lines=(output.data.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(paragraph=>paragraph.lines || []));
                    focused.push({text:output.data.text.trim(),confidence:lines.length?Math.min(...lines.map(line=>line.confidence)):0});
                  }
                } finally {if(!closed)await activeWorker.setParameters({tessedit_char_whitelist:''});}
                percentageReads.push({index,reads:focused});
                const focusedValues=focused.map(read=>parsePercentage(read.text).value);
                if(focused.length===2 && focused.every(read=>read.confidence>=80) && focusedValues.every(value=>value!==null && value===focusedValues[0])) {
                  const candidate=parseText(initial.name+' '+focused[0].text,names,canonPerk).rows[0];
                  if(usefulRow(candidate) && (initial.value===null || initial.value===candidate.value)) {
                    text=initial.name+' '+focused[0].text;confidence=Math.min(...focused.map(read=>read.confidence));
                  }
                }
              }
            }
            const current=parseText(text,names,canonPerk,1).rows[0];
            if(autoFit && (!current?.known || current.assumed || !usefulRow(current) || confidence<80) && !current?.conflict) {
              const boxes=Array.from({length:expectedRows},(_,i)=>({x:roi.x/source.width,y:(roi.y+i*roi.height/expectedRows)/source.height,width:roi.width/source.width,height:roi.height/expectedRows/source.height}));
              const bounds=autoFitBounds(boxes[index],index,boxes);
              if(layout==='panel'){bounds.x=.084;bounds.width=.975-bounds.x;}
              const fitted=await autoFitField({box:boxes[index],bounds,budget:fitBudget,isClosed:stopped,dimensions:source,
                read:async region=>{
                  check();const rect=window.DNScannerCore.cropPixels(region,source.width,source.height);
                  rowCanvas.width=rect.width*2+32;rowCanvas.height=rect.height*2+24;
                  rowContext.fillStyle='#fff';rowContext.fillRect(0,0,rowCanvas.width,rowCanvas.height);
                  rowContext.drawImage(source,rect.x,rect.y,rect.width,rect.height,16,12,rect.width*2,rect.height*2);
                  const pixels=rowContext.getImageData(0,0,rowCanvas.width,rowCanvas.height);
                  const contrast=hall==='war' && colours[index]==='neutral'?neutralTextContrast:textContrast;
                  for(let p=0;p<pixels.data.length;p+=4){const value=contrast(pixels.data[p],pixels.data[p+1],pixels.data[p+2]);pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=value;}
                  rowContext.putImageData(pixels,0,0);
                  await activeWorker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
                  const output=await readView(rowCanvas,{}, {text:true,blocks:true});
                  const lines=(output.data.blocks || []).flatMap(b=>(b.paragraphs || []).flatMap(p=>p.lines || []));
                  const evidence={text:output.data.text.trim(),confidence:lines.length===1?lines[0].confidence:0};
                  autoFitAttempts.push({index,box:region,...evidence});return evidence;
                },accept:evidence=>{
                  const candidate=parseText(evidence.text,names,canonPerk,1);
                  const row=candidate.rows[0];
                  if(!candidate.valid || row?.nameMatch?.method!=='exact')return null;
                  if(current?.known && current.name!==row.name || current?.value!=null && current.value!==row.value)return false;
                  return JSON.stringify([row.name,row.value]);
                }});
              if(fitted){text=fitted.text;confidence=fitted.confidence;autoFitReads.push({index,...fitted});}
            }
            rowTexts.push(text);confidences.push(confidence);
          }
          const retry=parseText(rowTexts.join('\n'),names,canonPerk,expectedRows);
          retry.rows=rowTexts.map(text=>parseText(text,names,canonPerk).rows[0] || {raw:text,name:'',value:null,known:false,hasPercent:false});
          if(confidences.some(value=>value<80)){retry.valid=false;retry.warnings.push('Some individual rows are still unclear. Verify their names and percentages.');}
          const selected=combineReads(annotate(parsed),annotate(retry),expectedRows);
          return annotate({...selected,colourReads,percentageReads,autoFitReads,observations:[firstObservation,{pass:'individual-rows',rows:retry.rows,warnings:[...retry.warnings],autoFitReads,autoFitAttempts}]});
        } finally {
          rowCanvas.width=rowCanvas.height=0;
          if(!closed)await activeWorker.setParameters({tessedit_pageseg_mode:'6'});
        }
      } finally { canvas.width=canvas.height=0;if(calibrated)calibrated.width=calibrated.height=0; }
    }
    async function close() { closed=true;fieldEvidence=null;warmed.clear();const previous=[...workers.values()];workers.clear();await Promise.all(previous.map(worker=>worker.terminate())); }
    return {recognize,close,warm:({fast=false}={})=>getWorker(fast?'fast':'standard'),
      isWarm:({fast=false}={})=>!closed && warmed.has(fast?'fast':'standard')};
  }
  function cleanArtifactName(value) {return String(value || '').replace(/\s+/g,' ').trim().replace(/^[^\p{L}\p{N}]+/u,'');}
  window.DNScannerRecognition={autoFitField,autoFitBounds,cleanArtifactName,matchName,NAME_MATCH_THRESHOLD,parsePercentage,parseText,parseFieldRow,positionRows,signIssues,reconcileReads,combineReads,retainCraftRead,classifyBrightness,classifyStars,rowColours,inferColourValues,usefulRow,coverage,textContrast,neutralTextContrast,detectPanel,parseCraftCategory,craftCategoryEvidence,classifyHallColour,hallColour,craftHall,categoryRect,categoryLine,create};
})();
