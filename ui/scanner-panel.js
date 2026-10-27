/* Crafting capture geometry only. Gold detection remains owned by recognition;
 * silver War frames require paired edges, vertical sides and a blue ribbon.
 * A panel candidate never confirms a name, stat, category or hall. */
(() => {
  'use strict';
  let silverFrame=null;
  function detect(source,{anchor=null}={}) {
    if(!source?.width || !source?.height)return null;
    const anchorKey=window.DNScannerCore.validRegion(anchor)?JSON.stringify([source.width,source.height,anchor.x,anchor.y,anchor.width,anchor.height]):null;
    const trackedSilver=anchorKey!==null && anchorKey===silverFrame;
    if(!trackedSilver){const gold=window.DNScannerRecognition?.detectPanel(source);if(gold){silverFrame=null;return gold;}}
    const canvas=document.createElement('canvas'),scale=Math.min(1,960/source.width);
    canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
    try {
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(source,0,0,canvas.width,canvas.height);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height;
      const silver=(x,y,exposure=.65)=>{
        if(x<0 || x>=w || y<0 || y>=h)return false;
        const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],low=Math.min(r,g,b),high=Math.max(r,g,b);
        return low>=45*exposure && high>=60*exposure && high-low<=Math.max(30*exposure,high*.45);
      };
      const ribbon=(x,y,width,height)=>{
        let blue=0;
        for(let row=0;row<8;row++)for(let column=0;column<32;column++) {
          const px=Math.floor(x+width*(.035+.435*(column+.5)/32));
          const py=Math.floor(y+height*(.075+.155*(row+.5)/8));
          const i=(py*w+px)*4,r=data[i],g=data[i+1],b=data[i+2];
          if(g>r*1.15 && b>g*1.1 && b>35)blue++;
        }
        return blue>=32*8*.35;
      };
      const side=(x,y,height,inset)=>{
        let supported=0;
        for(let row=0;row<32;row++) {
          const py=Math.round(y+height*(.27+.66*(row+.5)/32));
          for(let dx=-inset;dx<=inset;dx++)if(silver(x+dx,py)){supported++;break;}
        }
        return supported>=24;
      };
      const edge=(x,y,width,inset)=>{
        let supported=0;
        for(let column=0;column<64;column++) {
          const px=Math.round(x+width*(column+.5)/64);
          for(let dy=-inset;dy<=inset;dy++)if(silver(px,y+dy)){supported++;break;}
        }
        return supported>=48;
      };
      // Keep a found frame steady while its bevel or particles animate, but
      // require all four edges and the War ribbon in the current pixels.
      if(window.DNScannerCore.validRegion(anchor)) {
        const x=Math.round(anchor.x*w),y=Math.round(anchor.y*h),width=Math.round(anchor.width*w),height=Math.round(anchor.height*h);
        const inset=Math.max(2,Math.round(width*.015));
        if(x+width<=w && y+height<=h && height>=width*.3 && height<=width*.8 && ribbon(x,y,width,height) &&
          edge(x,y,width,inset) && edge(x,y+height-1,width,inset) && side(x,y,height,inset) && side(x+width-1,y,height,inset)){
          silverFrame=anchorKey;return {...anchor};
        }
      }
      if(trackedSilver){const gold=window.DNScannerRecognition?.detectPanel(source);if(gold){silverFrame=null;return gold;}}
      const spans=[];
      const maxGap=Math.max(3,Math.round(w*.03));
      // Separate exposure bands retain thin bevels without merging a dim edge
      // into the neighbouring map artwork at every brightness.
      for(const exposure of [1,.9,.75])for(let y=0;y<h;y++) {
        let start=-1,gap=0;
        for(let x=0;x<=w;x++) {
          if(silver(x,y,exposure)){if(start<0)start=x;gap=0;}
          else if(start>=0 && (++gap>maxGap || x===w)) {
            const width=x-gap+1-start;
            if(width>w*.25)spans.push({x:start,y,width});
            start=-1;gap=0;
          }
        }
      }
      let best=null,bestScore=0;
      for(const top of spans)for(const bottom of spans) {
        const height=bottom.y-top.y,tolerance=Math.max(6,top.width*.025);
        if(height<top.width*.3 || height>top.width*.8 || Math.abs(top.x-bottom.x)>tolerance || Math.abs(top.width-bottom.width)>tolerance*2)continue;
        const x=Math.min(top.x,bottom.x),width=Math.max(top.width,bottom.width),score=width+height;
        if(score<=bestScore || x+width>w || !ribbon(x,top.y,width,height))continue;
        const inset=Math.max(2,Math.round(width*.02));
        if(!edge(x,top.y,width,inset) || !edge(x,bottom.y,width,inset) || !side(x,top.y,height,inset) || !side(x+width-1,top.y,height,inset))continue;
        const region={x:x/w,y:top.y/h,width:width/w,height:height/h};
        if(window.DNScannerCore.validRegion(region)){best=region;bestScore=score;}
      }
      silverFrame=best?JSON.stringify([source.width,source.height,best.x,best.y,best.width,best.height]):null;
      return best;
    } finally {canvas.width=canvas.height=0;}
  }
  function automaticFields(source,panel) {
    const G=window.DNScannerRegions;
    if(!G || !source || !window.DNScannerCore.validRegion(panel) || silverFrame!==JSON.stringify([source.width,source.height,panel.x,panel.y,panel.width,panel.height]))return null;
    const template=G.defaults(panel.width*source.width/(panel.height*source.height));
    template.rows.forEach(row=>{row.name.y+=row.name.height*.20;row.name.height*=.60;row.name.width=.60;row.percentage={...row.name};});
    return G.resolve(template,panel,source).valid?{template,source,panel}:null;
  }
  window.DNScannerPanel={detect,automaticFields};
})();
