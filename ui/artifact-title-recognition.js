/* Authority: reviewed fixture title labels and the explicit manual correction contract.
 * Ownership: title-only cleanup, conservative catalogue matching and OCR decisions.
 * Invariants: no stat/percentage changes; no base/named-variant expansion; preserve
 * raw evidence; Hall/category constraints never come from a title guess. */
(() => {
  'use strict';
  const key=text=>String(text || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const clean=text=>String(text || '').replace(/\s+/g,' ').trim().replace(/^[^\p{L}\p{N}]+/u,'').replace(/[^\p{L}\p{N})]+$/u,'').trim();
  const tokens=text=>clean(text).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’‘']/g,'').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  function plausible(text) {
    const name=clean(text),letters=(name.match(/\p{L}/gu)||[]).length;
    if(/\b(?:artifact benefits|sell artifact|upgrade artifact)\b/i.test(name))return false;
    if(name.length>160 || letters<4 || letters/name.length<.65 || /[%|=+<>_{}\\/@]/.test(name) || /\d[,.]\d/.test(name))return false;
    if(/(?:\p{L})\d|\d(?:\p{L})/u.test(name) && !/\b\d+(?:st|nd|rd|th)\b/i.test(name))return false;
    const words=tokens(name);
    if(!words.some(word=>word.length>=3 && /[aeiouy]/i.test(word)))return false;
    if(words.filter(word=>word.length<=2).length>Math.max(2,words.length/2))return false;
    if(words.some(word=>/^(.)\1{2,}$/.test(word)))return false;
    return !/^(?:war\s+)?(?:artifact|weapon|armor|armour|equipment|pottery|jewelry|legendary|mythical|sell|upgrade|benefits|museum|collect|craft)(?:\s+(?:artifact|benefits|\d+))*$/i.test(name);
  }
  function distance(a,b) {
    let prior=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));prior=next;}return prior[b.length];
  }
  const compatible=(row,{hall,type}={})=>(!hall || String(row.hall).toLowerCase()===String(hall).toLowerCase()) &&
    (!type || row.type===String(type).replace(/^War /,''));
  function match(text,{hall=null,type='',catalog=window.DNArtifactTitleCatalog || []}={}) {
    const name=clean(text),input=key(name),allExact=catalog.filter(row=>key(row.name)===input),eligible=catalog.filter(row=>compatible(row,{hall,type}));
    const exact=eligible.filter(row=>key(row.name)===input);
    if(exact.length===1)return {name:exact[0].name,id:exact[0].id,method:'exact',confidence:1,automatic:true,source:exact[0].source};
    if(allExact.length && !exact.length)return {name,method:'context-mismatch',automatic:false,confidence:0};
    if(!plausible(name))return null;
    const sourceWords=tokens(name);
    // Same complete token count prevents supplying a possessor or dropping a
    // readable qualifier. Digits must agree exactly (F-1 is not 1 Grenade).
    const candidates=eligible.filter(row=>tokens(row.name).length===sourceWords.length &&
      (name.match(/\d+/g)||[]).join('|')===(row.name.match(/\d+/g)||[]).join('|'))
      .map(row=>({row,cost:distance(input,key(row.name))})).sort((a,b)=>a.cost-b.cost);
    const best=candidates[0],margin=best?(candidates[1]?.cost??Infinity)-best.cost:0;
    if(!best)return null;
    const confidence=1-best.cost/Math.max(input.length,key(best.row.name).length);
    if(best.cost<=2 && confidence>=.94 && margin>=2)return {name:best.row.name,id:best.row.id,method:'catalogue',confidence,automatic:true,source:best.row.source};
    return null;
  }
  function classify(read,options={}) {
    const text=clean(read.text);
    let matched=match(text,options);
    if((options.hall || options.type) && !matched?.automatic) {
      const unconstrained=match(text,{catalog:options.catalog || window.DNArtifactTitleCatalog || []});
      if(unconstrained?.automatic)matched={...unconstrained,method:'context-mismatch',automatic:false,confidence:0};
    }
    const valid=matched?.method!=='context-mismatch' && (matched?.automatic || plausible(text));
    return {...read,rawText:read.rawText??read.text,text:matched?.automatic?matched.name:text,plausible:!!valid,match:matched,
      confidence:Number.isFinite(read.confidence)?read.confidence:0};
  }
  function fromOCR(data,{view='original',complete=true,pixelKey=null}={}) {
    const rawText=String(data?.text || ''),lines=(data?.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(paragraph=>paragraph.lines || []));
    const useful=lines.filter(line=>/[\p{L}\p{N}]/u.test(String(line.text || '')));
    // Exclude standalone icon/punctuation lines only. Preserve every readable
    // fragment, including a wrapped possessor, even if it is not a title by
    // itself. Extra numeric/noisy lines must fail quality, never disappear.
    const text=useful.length?useful.map(line=>line.text).join(' '):rawText;
    const evidence=lines.map(line=>{
      const words=(line.words || []).filter(word=>/[\p{L}\p{N}]/u.test(String(word.text || '')));
      // Word confidence can exclude punctuation-only icons, but every readable
      // glyph must remain represented. Partial/missing word evidence falls back
      // to the original line confidence rather than hiding an uncertain word.
      const completeWords=words.length && words.every(word=>Number.isFinite(word.confidence)) &&
        key(words.map(word=>word.text).join(' '))===key(line.text);
      const textConfidence=completeWords?Math.min(...words.map(word=>word.confidence)):
        Number.isFinite(line.confidence)?line.confidence:0;
      return {text:line.text,confidence:line.confidence,textConfidence,confidenceSource:completeWords?'words':'line',bbox:line.bbox,
        words:(line.words || []).map(word=>({text:word.text,confidence:word.confidence,bbox:word.bbox}))};
    });
    const confidence=useful.length?Math.min(...evidence.filter(line=>/[\p{L}\p{N}]/u.test(String(line.text || ''))).map(line=>line.textConfidence)):data?.confidence;
    return {text,rawText,confidence:Number.isFinite(confidence)?confidence:0,blockConfidence:data?.confidence??null,
      lines:evidence,view,complete,pixelKey};
  }
  function decide(reads,{threshold=60,recovering=false,requireAgreement=false,...options}={}) {
    const evidence=reads.map(read=>classify(read,options)),valid=evidence.filter(read=>read.complete!==false && read.plausible),strong=valid.filter(read=>read.confidence>=threshold),groups=new Map();
    for(const read of strong){const identity=key(read.text),group=groups.get(identity)||[];group.push(read);groups.set(identity,group);}
    const geometry=read=>read.pixelKey || JSON.stringify(read.box || read.view || 'original');
    const agreed=[...groups.values()].filter(group=>new Set(group.map(geometry)).size>=2),conflict=groups.size>1;
    const rank=(a,b)=>Number(!!b.match?.automatic)-Number(!!a.match?.automatic) || b.confidence-a.confidence;
    const title=(agreed.length===1?agreed[0].slice().sort(rank)[0]:strong.slice().sort(rank)[0]) || valid.slice().sort(rank)[0] || evidence[0] || {text:'',confidence:0};
    const verified=!!title.plausible && title.confidence>=threshold && !conflict && (!(recovering && requireAgreement) || agreed.length===1);
    return {title,verified,conflict,evidence,name:verified?title.text:null};
  }
  window.DNArtifactTitleRecognition={key,clean,plausible,match,classify,fromOCR,decide};
})();
