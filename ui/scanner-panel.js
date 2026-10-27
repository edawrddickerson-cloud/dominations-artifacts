/* Crafting capture geometry only. Gold detection remains owned by recognition;
 * silver War frames require paired edges, vertical sides and a blue ribbon.
 * A panel candidate never confirms a name, stat, category or hall. */
(() => {
  'use strict';
  function detect(source) {
    if(!source?.width || !source?.height)return null;
    const gold=window.DNScannerRecognition?.detectPanel(source);
    if(gold)return gold;
    const canvas=document.createElement('canvas'),scale=Math.min(1,960/source.width);
    canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
    try {
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(source,0,0,canvas.width,canvas.height);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height;
      const silver=(x,y)=>{
        if(x<0 || x>=w || y<0 || y>=h)return false;
        const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],low=Math.min(r,g,b),high=Math.max(r,g,b);
        return low>=45 && high>=60 && high-low<=Math.max(30,high*.45);
      };
      const spans=[];
      for(let y=0;y<h;y++) {
        let start=-1,gap=0;
        for(let x=0;x<=w;x++) {
          if(silver(x,y)){if(start<0)start=x;gap=0;}
          else if(start>=0 && (++gap>3 || x===w)) {
            const width=x-gap+1-start;
            if(width>w*.25)spans.push({x:start,y,width});
            start=-1;gap=0;
          }
        }
      }
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
      let best=null,bestScore=0;
      for(const top of spans)for(const bottom of spans) {
        const height=bottom.y-top.y,tolerance=Math.max(6,top.width*.025);
        if(height<top.width*.3 || height>top.width*.8 || Math.abs(top.x-bottom.x)>tolerance || Math.abs(top.width-bottom.width)>tolerance*2)continue;
        const x=Math.min(top.x,bottom.x),width=Math.max(top.width,bottom.width),score=width+height;
        if(score<=bestScore || x+width>w || !ribbon(x,top.y,width,height))continue;
        const inset=Math.max(2,Math.round(width*.02));
        if(!side(x,top.y,height,inset) || !side(x+width-1,top.y,height,inset))continue;
        const region={x:x/w,y:top.y/h,width:width/w,height:height/h};
        if(window.DNScannerCore.validRegion(region)){best=region;bestScore=score;}
      }
      return best;
    } finally {canvas.width=canvas.height=0;}
  }
  window.DNScannerPanel={detect};
})();
