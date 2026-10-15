/* Authority: User-requested review of moving stars and live OCR consistency.
 * Ownership: Short browser-local frame window for the scanner only.
 * Invariants: Never save/upload pixels; clear on artifact/session/geometry changes;
 * three matching-size frames only; memory bounded to three 4MP crops.
 * Constraints: A stationary overlay or motion in two frames can survive the median.
 * History: Added after frozen screenshot reads outperformed reported live reads. */
(() => {
  'use strict';
  function median(samples) {
    if(samples.length!==3 || samples.some(sample=>sample.length!==samples[0].length))throw new Error('Three equal-sized samples required');
    const output=new Uint8ClampedArray(samples[0].length),[a,b,c]=samples;
    for(let i=0;i<output.length;i++)output[i]=a[i]+b[i]+c[i]-Math.min(a[i],b[i],c[i])-Math.max(a[i],b[i],c[i]);
    return output;
  }
  function create() {
    const frames=[];
    function clear(){for(const canvas of frames)canvas.width=canvas.height=0;frames.length=0;}
    function push(source) {
      if(!source.width || !source.height || source.width*source.height>4000000){clear();return;}
      if(frames[0] && (frames[0].width!==source.width || frames[0].height!==source.height))clear();
      const canvas=frames.length===3?frames.shift():document.createElement('canvas');
      canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);frames.push(canvas);
    }
    function snapshot(target,source) {
      target.width=source.width;target.height=source.height;
      const context=target.getContext('2d',{willReadFrequently:true});
      if(frames.length!==3 || frames.some(frame=>frame.width!==source.width || frame.height!==source.height)) {
        context.drawImage(source,0,0);return {frames:1,method:'single'};
      }
      const images=frames.map(frame=>frame.getContext('2d',{willReadFrequently:true}).getImageData(0,0,frame.width,frame.height));
      images[0].data.set(median(images.map(image=>image.data)));context.putImageData(images[0],0,0);
      return {frames:3,method:'median'};
    }
    return {push,snapshot,clear};
  }
  window.DNScannerFrames={median,create};
})();
