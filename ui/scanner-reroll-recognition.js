/* Authority: User-requested blue/grey dice reroll eligibility, October 2026.
 * Ownership: Local pixel evidence only; stars, tiers and text never supply eligibility.
 * Invariants: Missing, clipped, dim or conflicting buttons remain unknown. No pixels persist.
 * Constraints: English stored-item dialog geometry; calibration supplies whole button boxes. */
(() => {
  'use strict';
  const round=n=>Math.round(n*1000)/1000;
  const unknown=(reason='missing')=>({rerollEligible:null,rerollSource:'dice-background',rerollConfidence:'unknown',rerollEvidence:{reason}});
  function classify(pixels,width,height,box={x:0,y:0,width,height}) {
    if(!pixels || pixels.length!==width*height*4 || !box || !['x','y','width','height'].every(k=>Number.isFinite(box[k])))return unknown('invalid');
    const left=Math.ceil(box.x),top=Math.ceil(box.y),right=Math.floor(box.x+box.width),bottom=Math.floor(box.y+box.height);
    if(left<0 || top<0 || right>width || bottom>height)return unknown('clipped');
    const w=right-left,h=bottom-top;
    if(w<18 || h<22)return unknown('too-small');
    const rgb=(x,y)=>{const p=((top+y)*width+left+x)*4;return pixels[p+3]<200?[0,0,0]:[pixels[p],pixels[p+1],pixels[p+2]];};
    const luma=([r,g,b])=>.299*r+.587*g+.114*b;
    // Find a horizontal background slab below the die. The faces themselves can
    // remain blue on disabled controls, so upper pixels never vote for eligibility.
    const slabs=[];
    for(let y=Math.floor(h*.45);y<Math.floor(h*.90);y++) {
      let blue=0,grey=0,total=0,sum=0;const light=[];
      for(let x=Math.ceil(w*.30);x<Math.floor(w*.70);x++) {
        const [r,g,b]=rgb(x,y),v=luma([r,g,b]);total++;sum+=v;light.push(v);
        if(b-Math.max(r,g)>=22 && b>=r*1.32 && b>=g*1.25 && b>55)blue++;
        if(Math.max(r,g,b)-Math.min(r,g,b)<=10 && v>=32 && v<=120)grey++;
      }
      light.sort((a,b)=>a-b);
      if(total && light[Math.floor(total*.9)]-light[Math.floor(total*.1)]<30)slabs.push({y,blue:blue/total,grey:grey/total,luma:sum/total});
    }
    let selected=null;const candidates=[];
    function visible(candidate) {
      let bright=0,dark=0,face=0,lowerBorder=0,borderCount=0;
      for(let y=Math.floor(h*.08);y<candidate.y;y++)for(let x=Math.ceil(w*.30);x<Math.floor(w*.70);x++) {
        const v=luma(rgb(x,y));face++;if(v>candidate.luma+16)bright++;if(v<candidate.luma-18)dark++;
      }
      for(let y=candidate.end+1;y<Math.min(h,candidate.end+Math.ceil(w*.22));y++)for(let x=Math.ceil(w*.30);x<Math.floor(w*.70);x++) {
        borderCount++;if(luma(rgb(x,y))>candidate.luma+15)lowerBorder++;
      }
      return face && bright/face>=.025 && dark/face>=.025 && borderCount && lowerBorder/borderCount>=.02;
    }
    for(let i=0;i<slabs.length;i++) {
      const first=slabs[i],group=[first];
      for(let j=i+1;j<slabs.length && slabs[j].y===group[group.length-1].y+1;j++) {
        if(Math.abs(slabs[j].luma-first.luma)>12)break;
        group.push(slabs[j]);
      }
      const blue=group.reduce((s,r)=>s+r.blue,0)/group.length,grey=group.reduce((s,r)=>s+r.grey,0)/group.length;
      if(group.length<Math.max(2,Math.floor(w*.025)) || Math.max(blue,grey)<.85)continue;
      // Prefer the largest supported slab. A thin grey metal edge below an
      // enabled blue background must not turn that button into an ineligible one.
      const candidate={y:first.y,end:group[group.length-1].y,blue,grey,luma:group.reduce((s,r)=>s+r.luma,0)/group.length};
      if(visible(candidate)) {
        candidates.push(candidate);
        if(!selected || candidate.end-candidate.y>selected.end-selected.y ||
          candidate.end-candidate.y===selected.end-selected.y && candidate.end>selected.end)selected=candidate;
      }
    }
    // Positive evidence that this is a raised control with a contrasting die,
    // rather than an empty grey rectangle or unrelated blue panel background.
    if(!selected)return unknown('button-not-visible');
    if(candidates.some(candidate=>(candidate.blue>=.85)!==(selected.blue>=.85) &&
      candidate.end-candidate.y>=Math.max(3,(selected.end-selected.y)*.5)))return unknown('mixed-colour');
    const eligible=selected.blue>=.85 && selected.grey<.1?true:selected.grey>=.85 && selected.blue<.1?false:null;
    return {rerollEligible:eligible,rerollSource:'dice-background',rerollConfidence:eligible===null?'unknown':'high',
      rerollEvidence:{reason:eligible===true?'blue-background':eligible===false?'grey-background':'mixed-colour',blueFraction:round(selected.blue),greyFraction:round(selected.grey),backgroundLuma:round(selected.luma)}};
  }
  function classifyCanvas(source) {
    if(!source?.width || !source?.height)return unknown();
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    try {const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);return classify(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);}
    finally {canvas.width=canvas.height=0;}
  }
  function detectStorage(pixels,width,height,{expectedRows=5,layout='storage'}={}) {
    const count=Number(expectedRows)===6?6:5;
    if(!['storage','storage-rows-dice'].includes(layout))return Array.from({length:count},()=>unknown('dice-excluded'));
    const full=layout==='storage',area=full?{x:.303,y:.151,width:.66,height:count===6?.785:.659}:{x:0,y:0,width:1,height:1};
    const rowHeight=area.height/count;
    return Array.from({length:count},(_,i)=>classify(pixels,width,height,{
      x:(area.x+area.width*.868)*width,y:(area.y+i*rowHeight)*height,
      width:area.width*.116*width,height:rowHeight*height
    }));
  }
  function summarize(rows) {
    const states=rows.map(row=>row.rerollEligible===true?true:row.rerollEligible===false?false:null);
    const count=states.every(s=>s!==null)?states.filter(Boolean).length:null;
    return {states,count,pattern:count===null?'unknown':count===0?'none':count===states.length?'all':count===1?'one':'mixed'};
  }
  window.DNScannerRerollRecognition={classify,classifyCanvas,detectStorage,unknown,summarize};
})();
