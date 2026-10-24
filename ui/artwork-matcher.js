/* Pure visual descriptors. Pixels and query descriptors never leave the browser.
 * Artwork IDs describe approved pictures, never physical copies or ownership. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DNArtworkMatcher=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const SIZE=24,VERSION=1;
 function describe(rgba,width,height){
  if(!rgba||width<1||height<1||rgba.length!==width*height*4)throw Error('Invalid artwork pixels.');
  const values=[];
  // Exclude card corners, badges and title/footer areas. Spatial colour retains
  // distinctions between similar silhouettes with different game variants.
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
   const left=Math.floor((.12+x*.76/SIZE)*width),right=Math.max(left+1,Math.floor((.12+(x+1)*.76/SIZE)*width));
   const top=Math.floor((.16+y*.70/SIZE)*height),bottom=Math.max(top+1,Math.floor((.16+(y+1)*.70/SIZE)*height));
   const sum=[0,0,0];let count=0;
   for(let py=top;py<Math.min(height,bottom);py++)for(let px=left;px<Math.min(width,right);px++){const i=(py*width+px)*4;for(let c=0;c<3;c++)sum[c]+=rgba[i+c];count++;}
   values.push(...sum.map(v=>Math.round(v/Math.max(1,count))));
  }
  return values;
 }
 function distance(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==SIZE*SIZE*3||b.length!==a.length)return Infinity;
  let colour=0,structure=0,meanA=0,meanB=0;
  for(let i=0;i<a.length;i+=3){meanA+=(a[i]+a[i+1]+a[i+2])/3;meanB+=(b[i]+b[i+1]+b[i+2])/3;}
  meanA/=SIZE*SIZE;meanB/=SIZE*SIZE;
  for(let i=0;i<a.length;i+=3){const ga=(a[i]+a[i+1]+a[i+2])/3,gb=(b[i]+b[i+1]+b[i+2])/3;structure+=Math.abs((ga-meanA)-(gb-meanB));for(let c=0;c<3;c++)colour+=Math.abs(a[i+c]-b[i+c]);}
  return (.65*colour/a.length+.35*structure/(SIZE*SIZE))/255;
 }
 function match(query,catalog,{excludeId}={}){
  if(catalog?.descriptorVersion!==VERSION||!Array.isArray(catalog.entries))return {status:'unavailable',artworkId:null};
  const ranked=catalog.entries.filter(e=>e.id!==excludeId).map(e=>{
   const examples=e.examples.map((d,i)=>({distance:distance(query,d),limit:Math.min(catalog.maxDistance,e.radii?.[i]??catalog.maxDistance)})).sort((a,b)=>a.distance-b.distance);
   return {id:e.id,...examples[0]};
  }).sort((a,b)=>a.distance-b.distance);
  const first=ranked[0],second=ranked[1],gap=second?second.distance-first.distance:Infinity;
  const accepted=first&&first.distance<=first.limit&&gap>=catalog.minMargin;
  return {status:accepted?'matched':first&&first.distance<=catalog.maxDistance?'ambiguous':'unmatched',artworkId:accepted?first.id:null,distance:first?.distance??null,margin:Number.isFinite(gap)?gap:null,candidateId:first?.id??null};
 }
 return {VERSION,SIZE,describe,distance,match};
});
