/* Authority: User's moving-star concern and browser-local capture contract.
 * Ownership: Temporal filtering and cleanup regressions only.
 * Invariants: Preserve stationary text; reject mixed dimensions; no image persistence.
 * Constraints: Synthetic transient overlays, not a recorded live game sequence. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const made=[];
function canvas() {
  let width=0,height=0;
  const item={pixels:[],resizes:0,clears:0,
    get width(){return width;},set width(value){width=value;this.resizes++;this.pixels=Array(width*height*4).fill(0);},
    get height(){return height;},set height(value){height=value;this.resizes++;this.pixels=Array(width*height*4).fill(0);},getContext(){return {
    clearRect(){item.pixels=Array(width*height*4).fill(0);item.clears++;},
    drawImage(source){
      // Reproduce source-over alpha so a missing clear retains stale pixels.
      for(let i=0;i<source.pixels.length;i+=4) {
        const alpha=source.pixels[i+3]/255,prior=(item.pixels[i+3] || 0)/255,out=alpha+prior*(1-alpha);
        for(let channel=0;channel<3;channel++)item.pixels[i+channel]=out?Math.round((source.pixels[i+channel]*alpha+(item.pixels[i+channel] || 0)*prior*(1-alpha))/out):0;
        item.pixels[i+3]=Math.round(out*255);
      }
    },
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
assert.throws(()=>median(views,new Uint8ClampedArray(1)),/Equal-sized/);
for(let destination=0;destination<3;destination++) {
  const copies=views.map(sample=>sample.slice()),output=copies[destination];
  assert.equal(median(copies,output),output,'median can reuse any input buffer');assert.deepEqual(output,base);
}
const signed=[[4,-8],[6,-7],[5,-6]];
assert.equal(median(signed,signed[0]),signed[0]);assert.deepEqual(signed[0],[5,-7],'reusing numeric signatures retains signed precision');
const window=create(),target=canvas();
for(const pixels of views)window.push({width:3,height:1,pixels});
assert.equal(window.snapshot(target,{width:3,height:1}).frames,3);assert.deepEqual(target.pixels,Array.from(base));
window.push({width:2,height:1,pixels:[10,10,10,255,20,20,20,255]});
assert.equal(window.snapshot(target,{width:2,height:1,pixels:base.slice(0,8)}).frames,1,'resize clears old samples');
window.clear();assert.equal(made.filter(item=>item!==target && item.width).length,0,'clearing releases buffered pixels');
window.push({width:4000001,height:1,pixels:[]});
assert.equal(window.snapshot(target,{width:1,height:1,pixels:[0,0,0,255]}).frames,1,'large capture falls back to a single frame');
window.clear();
const ringStart=made.length;
for(let i=0;i<3;i++)window.push({width:1,height:1,pixels:[180,60,20,255]});
const ring=made.slice(ringStart),resizes=ring.map(item=>item.resizes);
for(let i=0;i<3;i++)window.push({width:1,height:1,pixels:[0,0,0,0]});
assert.equal(window.snapshot(target,{width:1,height:1}).frames,3);
assert.deepEqual(target.pixels,[0,0,0,0],'transparent replacement samples cannot retain pixels from an older artifact');
assert.deepEqual(ring.map(item=>item.resizes),resizes,'same-size pushes retain backing buffers');
assert.deepEqual(ring.map(item=>item.clears),[1,1,1],'each reused frame is cleared before drawing');
assert.equal(made.length,ringStart+3,'ring allocations remain bounded to three canvases');
window.clear();assert.ok(ring.every(item=>item.width===0 && item.height===0),'clear releases every reused frame');
window.push({width:1,height:1,pixels:[9,8,7,255]});
assert.equal(window.snapshot(target,{width:1,height:1,pixels:[1,2,3,255]}).frames,1,'a new epoch cannot use a previous artifact median');
window.push({width:2,height:1,pixels:[10,20,30,255,40,50,60,255]});
assert.equal(window.snapshot(target,{width:2,height:1,pixels:[11,22,33,255,44,55,66,255]}).frames,1,'geometry changes discard the prior epoch');
assert.deepEqual(target.pixels,[11,22,33,255,44,55,66,255]);
window.clear();
console.log('Temporal median, in-place equality, transparent replacement, buffer reuse, epoch cleanup and memory bounds passed.');
