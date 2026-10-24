// Bound each reference by its nearest approved visual competitor. Distinctive
// artwork tolerates JPEG noise; close variants retain a much tighter radius.
const fs=require('node:fs'),matcher=require('../ui/artwork-matcher.js');
function calibrate(catalog){
 const entries=catalog.entries.map(e=>({...e,radii:e.examples.map(d=>{
  let nearest=Infinity;
  for(const other of catalog.entries)if(other.id!==e.id)for(const sample of other.examples)nearest=Math.min(nearest,matcher.distance(d,sample));
  return Math.min(.03,nearest*.3);
 })}));
 return {...catalog,maxDistance:.03,minMargin:.008,entries};
}
module.exports={calibrate};
if(require.main===module){const file='ui/data/artwork_catalog.json';fs.writeFileSync(file,JSON.stringify(calibrate(JSON.parse(fs.readFileSync(file,'utf8'))))+'\n');console.log('Calibrated conservative per-reference matching radii.');}
