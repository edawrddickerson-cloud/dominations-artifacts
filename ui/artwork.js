/* Approved shared artwork, local matching, and local-only image fallback.
 * No capture uploads, remote query fingerprints, or user-created asset URLs. */
(() => {
 'use strict';
 const base=new URL('.',document.currentScript.src),ids=new Set(window.DNArtworkIds||[]);
 const local=image=>typeof image==='string'&&image.length<1000000&&/^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(image)?image:'';
 const validId=id=>typeof id==='string'&&ids.has(id);
 const asset=id=>validId(id)?new URL('assets/artwork/'+id+'.jpg',base).href:'';
 const placeholder=new URL('assets/artwork/placeholder.svg',base).href;
 let loading,catalog;const results=new Map(),failed=new Set();
 const enabled=()=>window.DNServiceConfig?.artworkMatchingEnabled!==false;
 function load(){
  if(!loading)loading=fetch(new URL('data/artwork_catalog.json',base),{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Artwork catalog unavailable.');return r.json();}).then(data=>{
   if(data.version!==1||data.descriptorVersion!==window.DNArtworkMatcher.VERSION||data.entries.length!==ids.size||data.entries.some(e=>!validId(e.id)||e.file!==e.id+'.jpg'||!Array.isArray(e.examples)))throw Error('Invalid artwork catalog.');
   catalog=data;return data;
  }).catch(error=>{loading=null;throw error;});
  return loading;
 }
 function src(item,fallback=''){
  const approved=asset(item?.artworkId);
  return approved&&!failed.has(approved)?approved:fallback&&!failed.has(fallback)?fallback:local(item?.image);
 }
 function bind(node,item,fallback=''){
  if(!node)return;
  const image=src(item,fallback)||(item&&(item.type||item.id)?placeholder:'');
  node.dataset.localArtwork=local(item?.image);
  if(validId(item?.artworkId))node.dataset.artworkId=item.artworkId;else delete node.dataset.artworkId;
  node.hidden=!image;
  if(image){if(node.getAttribute('src')!==image)node.src=image;}else node.removeAttribute('src');
 }
 async function match(image){
  if(!enabled()||!local(image))return {status:'unavailable',artworkId:null};
  if(results.has(image))return results.get(image);
  const operation=(async()=>{
   const data=await load(),im=new Image();im.src=image;await im.decode();
   if(!im.naturalWidth||!im.naturalHeight||im.naturalWidth*im.naturalHeight>2000000)throw Error('Artwork dimensions exceeded.');
   const c=document.createElement('canvas');c.width=192;c.height=Math.max(1,Math.round(192*im.naturalHeight/im.naturalWidth));
   const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,c.width,c.height);
   const descriptor=window.DNArtworkMatcher.describe(x.getImageData(0,0,c.width,c.height).data,c.width,c.height);
   c.width=c.height=0;
   // Pure comparison is bounded by the reviewed reference set; yield before it
   // so rendering and OCR completion can publish without waiting for matching.
   await new Promise(resolve=>setTimeout(resolve,0));
   return window.DNArtworkMatcher.match(descriptor,data);
  })().catch(()=>{results.delete(image);return {status:'unavailable',artworkId:null};});
  results.set(image,operation);if(results.size>48)results.delete(results.keys().next().value);
  return operation;
 }
 const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(item,className='',alt='',fallback=''){
  const image=src(item,fallback)||placeholder;
  return '<img class="'+esc(className)+'" src="'+esc(image)+'" data-local-artwork="'+esc(local(item?.image))+'"'+(validId(item?.artworkId)?' data-artwork-id="'+esc(item.artworkId)+'"':'')+' alt="'+esc(alt)+'" loading="lazy" />';
 }
 document.addEventListener('error',event=>{
  const node=event.target;if(node.tagName!=='IMG')return;
  if(node.dataset.artworkId||node.dataset.localArtwork){failed.add(node.src);const fallback=local(node.dataset.localArtwork);if(fallback&&node.src!==fallback)node.src=fallback;else if(node.src!==placeholder)node.src=placeholder;else{node.hidden=true;node.removeAttribute('src');}}
 },true);
 window.addEventListener('online',()=>{failed.clear();document.querySelectorAll('img[data-artwork-id]').forEach(node=>bind(node,{artworkId:node.dataset.artworkId,image:node.dataset.localArtwork}));});
 window.DNArtwork={validId,asset,src,bind,html,match,load,local,enabled};
 // Descriptor loading failures leave local scanning and images intact.
 if(enabled())load().catch(()=>{});
})();
