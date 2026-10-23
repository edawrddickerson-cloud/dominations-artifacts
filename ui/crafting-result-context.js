/* Independent evidence of a crafting-result popup. Crafting mode's default
 * level=1 is not evidence. This optional worker never owns the scanner worker. */
(() => {
  'use strict';
  function classify(data) {
    const text=String(data?.text || '').replace(/\s+/g,' ').trim();
    const words=(data?.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(p=>(p.lines || []).flatMap(line=>line.words || [])));
    const labels=['sell','for','continue'].every(label=>words.some(word=>String(word.text).replace(/[^a-z]/gi,'').toLowerCase()===label && word.confidence>=80));
    return (labels || Number(data?.confidence)>=80) && /\bsell\s*for\b/i.test(text) && /\bcontinue\b/i.test(text);
  }
  function capture(source,panel) {
    if(!source?.width || !panel)return null;
    const box={x:(panel.x-panel.width*.25)*source.width,y:(panel.y+panel.height*1.32)*source.height,width:panel.width*.97*source.width,height:panel.height*.30*source.height};
    if(box.x<0 || box.y<0 || box.x+box.width>source.width || box.y+box.height>source.height || box.width<50 || box.height<10)return null;
    const canvas=document.createElement('canvas'),scale=Math.min(2,1000/box.width);canvas.width=Math.round(box.width*scale);canvas.height=Math.round(box.height*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,box.x,box.y,box.width,box.height,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){const value=Math.min(pixels.data[i],pixels.data[i+1],pixels.data[i+2])>145?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
    ctx.putImageData(pixels,0,0);return canvas;
  }
  function create({enabled,owner,read,update}) {
    let busy=false,pending=null,generation=0;
    async function run(job) {
      busy=true;const current=generation;
      try {
        if(!enabled() || owner()!==job.owner)return;
        const data=await read(job.canvas);
        if(current===generation && enabled() && owner()===job.owner && classify(data))await update(job.id,{startingContextSource:'craft-result-controls-v1'},job.revision);
      }catch{}finally{job.canvas.width=job.canvas.height=0;busy=false;const next=pending;pending=null;if(next)run(next);}
    }
    return {observe(canvas,id,revision){
      if(!canvas || !id || !enabled())return;
      const frozen=document.createElement('canvas');frozen.width=canvas.width;frozen.height=canvas.height;frozen.getContext('2d').drawImage(canvas,0,0);
      const job={canvas:frozen,id,revision,owner:owner()};
      if(busy){if(pending)pending.canvas.width=pending.canvas.height=0;pending=job;}else run(job);
    },close(){generation++;if(pending)pending.canvas.width=pending.canvas.height=0;pending=null;}};
  }
  let worker=null,starting=null;
  const enabled=()=>window.DNIntegrationCore?.researchReady(window.DNServiceConfig) && window.DNConsent?.get().research && !!window.DNCloud?.user();
  async function read(canvas) {
    if(!window.Tesseract)throw Error('OCR unavailable');
    if(!starting){const base=new URL('vendor/tesseract/',document.baseURI).href;starting=window.Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+'lang-fast/',workerBlobURL:false,cachePath:'dn-crafting-context-v1',logger:()=>{}}).then(async value=>{worker=value;await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz +0123456789'});return value;}).catch(error=>{worker?.terminate();worker=null;starting=null;throw error;});}
    const active=await starting;return (await active.recognize(canvas,{}, {text:true,blocks:true})).data;
  }
  const verifier=create({enabled,owner:()=>window.DNCloud?.user()?.id,read,update:async(id,metadata,revision)=>window.DNScannerCollection?.setStartingContext(id,metadata,revision)});
  window.DNCraftingResultContext={classify,capture,create,enabled,observe:verifier.observe};
  window.addEventListener?.('dn-account-changed',()=>verifier.close());
  window.addEventListener?.('pagehide',()=>{verifier.close();worker?.terminate();worker=null;starting=null;});
})();
