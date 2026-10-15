/* Authority: User's moving-star concern and browser-local capture contract.
 * Ownership: Temporal filtering and cleanup regressions only.
 * Invariants: Preserve stationary text; reject mixed dimensions; no image persistence.
 * Constraints: Synthetic transient overlays, not a recorded live game sequence. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const made=[];
function canvas() {
  const item={width:0,height:0,pixels:[],getContext(){return {
    drawImage(source){item.pixels=Array.from(source.pixels);},
    getImageData(){return {data:new Uint8ClampedArray(item.pixels)};},
    putImageData(image){item.pixels=Array.from(image.data);}
  };}};made.push(item);return item;
}
const context={window:{},document:{createElement:canvas},Uint8ClampedArray};vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/scanner-frames.js','utf8'),context);
const {median,create}=context.window.DNScannerFrames;
const base=new Uint8ClampedArray([20,30,40,255,80,90,100,255,15,60,15,255]);
const views=[0,1,2].map(index=>{const sample=base.slice();sample.fill(255,index*4,index*4+3);return sample;});
assert.deepEqual(median(views),base,'different moving overlays disappear without changing stationary glyphs');
const signature=[4,-7,2.5,-16,0,12];
assert.deepEqual(Array.from(median([signature,signature,signature])),signature,'identical numeric signatures preserve signed chroma and fractions');
assert.deepEqual(Array.from(median([[4,-8],[6,-7],[5,-6]])),[5,-7],'median of varying numeric signatures remains signed');
assert.throws(()=>median([views[0],views[1]]),/Three/);
assert.throws(()=>median([views[0],views[1],[]]),/equal/);
const window=create(),target=canvas();
for(const pixels of views)window.push({width:3,height:1,pixels});
assert.equal(window.snapshot(target,{width:3,height:1}).frames,3);assert.deepEqual(target.pixels,Array.from(base));
window.push({width:2,height:1,pixels:[10,10,10,255,20,20,20,255]});
assert.equal(window.snapshot(target,{width:2,height:1,pixels:base.slice(0,8)}).frames,1,'resize clears old samples');
window.clear();assert.equal(made.filter(item=>item!==target && item.width).length,0,'clearing releases buffered pixels');
window.push({width:4000001,height:1,pixels:[]});
assert.equal(window.snapshot(target,{width:1,height:1,pixels:[0,0,0,255]}).frames,1,'large capture falls back to a single frame');
console.log('Temporal median, stationary glyph preservation, resize cleanup and memory bounds passed.');
