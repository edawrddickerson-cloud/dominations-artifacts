const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync('ui/storage-recognition.js','utf8'),context);
const read=context.window.DNStorageRecognition.progressLevel,w=200,h=8,rect={x:0,y:0,width:1,height:1};
function bar(fraction,start=0) {
  const pixels=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=start;x<Math.round(w*fraction);x++)pixels.set([0,220,0,255],(y*w+x)*4);
  return pixels;
}
for(let level=1;level<=10;level++)assert.equal(read(bar(level/10),w,h,rect)?.level,level);
assert.equal(read(bar(0),w,h,rect),null,'empty bar');
assert.equal(read(bar(.45),w,h,rect),null,'between levels');
assert.equal(read(bar(.8,20),w,h,rect),null,'clipped fill');
const broken=bar(.8);for(let y=0;y<h;y++)for(let x=40;x<60;x++)broken.fill(0,(y*w+x)*4,(y*w+x+1)*4);
assert.equal(read(broken,w,h,rect),null,'discontinuous fill');
assert.equal(read(bar(1),w,h,{...rect,x:.1}),null,'out of bounds');
console.log('Storage progress: all ten levels, empty, ambiguous, clipped and irregular bars passed.');
