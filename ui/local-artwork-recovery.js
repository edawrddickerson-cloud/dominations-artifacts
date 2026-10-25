/* Recover pixels by existing record/item identity only. Never create items,
 * restore settings, change stats or copy another account's safety snapshots. */
(() => {
 'use strict';
 const local=value=>window.DNArtwork?.local(value)||(typeof value==='string'&&value.length<1000000&&/^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(value)?value:'');
 function recover(records,sources,{owner}={}){
  if(!owner)return {records,patches:[]};
  const images=new Map(),key=(record,id)=>JSON.stringify([record,id]);
  for(const source of sources || []){
   if(source?.owner!==owner||source.local?.kind!=='dominations-planner-backup'||source.local.version!==1||!Array.isArray(source.local.records))continue;
   for(const record of source.local.records || []){
    if(!record||(record.id!=='items'&&!/^collection:[^:]+$/.test(record.id))||!Array.isArray(record.items))continue;
    for(const item of record.items)if(item&&typeof item.id==='string'&&local(item.image)&&!images.has(key(record.id,item.id)))images.set(key(record.id,item.id),item.image);
   }
  }
  const patches=[];
  const next=records.map(record=>{
   if(!Array.isArray(record.items))return record;
   return {...record,items:record.items.map(item=>{
    const image=images.get(key(record.id,item.id));if(local(item.image)||!image)return item;
    patches.push({record:record.id,id:item.id,image});return {...item,image};
   })};
  });
  return {records:next,patches};
 }
 window.DNLocalArtworkRecovery={local,recover};
})();
