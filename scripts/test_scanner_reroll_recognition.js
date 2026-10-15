/* Local PNG fixtures and deterministic pixel/geometry regressions. No OCR or dependencies. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'ui/scanner-reroll-recognition.js'),'utf8'),context);
const R=context.window.DNScannerRerollRecognition;
// Decode non-interlaced RGB/RGBA PNGs, including all five PNG row filters.
function png(file) {
  const input=fs.readFileSync(file),chunks=[];let width,height,type,depth,interlace;
  for(let p=8;p<input.length;) {
    const length=input.readUInt32BE(p),kind=input.toString('ascii',p+4,p+8),data=input.subarray(p+8,p+8+length);p+=length+12;
    if(kind==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12];}
    if(kind==='IDAT')chunks.push(data);
  }
  assert.equal(depth,8);assert.ok(type===2 || type===6);assert.equal(interlace,0);
  const channels=type===6?4:3,stride=width*channels,raw=zlib.inflateSync(Buffer.concat(chunks)),decoded=Buffer.alloc(stride*height),pixels=new Uint8ClampedArray(width*height*4);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db && da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];assert.ok(filter<=4);
    for(let x=0;x<stride;x++) {
      const left=x>=channels?decoded[y*stride+x-channels]:0,up=y?decoded[(y-1)*stride+x]:0,upperLeft=y && x>=channels?decoded[(y-1)*stride+x-channels]:0;
      decoded[y*stride+x]=(raw[y*(stride+1)+1+x]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,upperLeft)][filter])&255;
    }
  }
  for(let i=0;i<width*height;i++){pixels[i*4]=decoded[i*channels];pixels[i*4+1]=decoded[i*channels+1];pixels[i*4+2]=decoded[i*channels+2];pixels[i*4+3]=channels===4?decoded[i*channels+3]:255;}
  return {pixels,width,height};
}
const fixtures={
  '230152':[true,true,true,true,true],'231624':[true,true,true,true,true],
  '231632':[true,true,true,true,true],'231642':[true,true,true,true,true],
  '231706':[false,false,false,false,false,false],'231712':[false,false,false,false,false],
  '231728':[false,false,false,false,true],'231732':[false,false,false,false,true],
  '231739':[true,true,true,true,true],'231746':[false,false,false,false,false],
  '231751':[false,false,false,false,false,false],'221542':[true,true,true,true,true],
  '221600':[true,true,true,true,true]
};
function mask(rows){return Array.from(rows,row=>row.rerollEligible);}
function transform(image,box={x:0,y:0,width:image.width,height:image.height},scale=1) {
  const width=Math.round(box.width*scale),height=Math.round(box.height*scale),pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const p=(Math.min(image.height-1,Math.floor(box.y+y/scale))*image.width+Math.min(image.width-1,Math.floor(box.x+x/scale)))*4;
    pixels.set(image.pixels.subarray(p,p+4),(y*width+x)*4);
  }
  return {pixels,width,height};
}
let transformedUnknown=0,transformedRows=0;
for(const [stamp,expected] of Object.entries(fixtures)) {
  const image=png(path.join(root,'tests/scanner/storage-'+stamp+'.png'));
  const observed=R.detectStorage(image.pixels,image.width,image.height,{expectedRows:expected.length});
  assert.deepEqual(mask(observed),expected,stamp+' '+JSON.stringify(observed));
  assert.ok(observed.every(row=>row.rerollSource==='dice-background' && row.rerollConfidence==='high'));
  for(const scale of [.75,1.5]) {
    const scaled=transform(image,undefined,scale);
    const scaledRows=R.detectStorage(scaled.pixels,scaled.width,scaled.height,{expectedRows:expected.length});
    transformedUnknown+=scaledRows.filter(row=>row.rerollEligible===null).length;transformedRows+=scaledRows.length;
    assert.ok(mask(scaledRows).every((state,i)=>state===null || state===expected[i]),stamp+' scaled '+scale+' '+JSON.stringify(scaledRows));
  }
  const cropped=transform(image,{x:image.width*.303,y:image.height*.151,width:image.width*.66,height:image.height*(expected.length===6?.785:.659)});
  assert.deepEqual(mask(R.detectStorage(cropped.pixels,cropped.width,cropped.height,{expectedRows:expected.length,layout:'storage-rows-dice'})),expected,stamp+' dice-inclusive rows');
  assert.deepEqual(mask(R.detectStorage(image.pixels,image.width,image.height,{expectedRows:expected.length,layout:'storage-rows'})),expected.map(()=>null));
}
const pixels=new Uint8ClampedArray(60*80*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=pixels[i+1]=pixels[i+2]=62;pixels[i+3]=255;}
assert.equal(R.classify(pixels,60,80).rerollEligible,null,'empty grey region is not an ineligible button');
assert.equal(R.classify(pixels,60,80,{x:-1,y:0,width:50,height:70}).rerollEvidence.reason,'clipped');
assert.equal(R.classify(pixels,60,80,{x:0,y:0,width:8,height:8}).rerollEvidence.reason,'too-small');
assert.equal(R.classify(new Uint8ClampedArray(60*80*4),60,80).rerollEligible,null,'black input remains unknown');
for(let i=0;i<pixels.length;i+=4){pixels[i]=60;pixels[i+1]=58;pixels[i+2]=110;}
assert.equal(R.classify(pixels,60,80).rerollEligible,null,'flat blue panel is not a dice control');
const real=png(path.join(root,'tests/scanner/storage-231728.png'));
const dim=real.pixels.map((value,i)=>i%4===3?value:Math.round(value*.18));
assert.ok(R.detectStorage(dim,real.width,real.height).every(row=>row.rerollEligible===null),'unreadably dim controls remain unknown');
const transparent=real.pixels.map((value,i)=>i%4===3?0:value);
assert.ok(R.detectStorage(transparent,real.width,real.height).every(row=>row.rerollEligible===null),'transparent pixels cannot prove a visible control');
// Optional dice fields must not break old templates or shift stat geometry.
context.window.DNScannerCore={validRegion:b=>!!b && ['x','y','width','height'].every(k=>Number.isFinite(b[k])) && b.x>=0 && b.y>=0 && b.width>0 && b.height>0 && b.x+b.width<=1+1e-9 && b.y+b.height<=1+1e-9,
  cropPixels:(b,w,h)=>({x:Math.floor(b.x*w),y:Math.floor(b.y*h),width:Math.floor(b.width*w),height:Math.floor(b.height*h)})};
vm.runInContext(fs.readFileSync(path.join(root,'ui/scanner-regions.js'),'utf8'),context);
const G=context.window.DNScannerRegions,template=G.defaults(2),legacy=JSON.parse(JSON.stringify(template));legacy.rows.forEach(row=>delete row.dice);
assert.equal(G.valid(legacy),true,'old v1 templates remain valid');
assert.ok(G.defaults(2).rows.every(row=>row.dice===null),'crafting defaults never invent dice geometry');
template.rows[0].dice={x:1.05,y:template.rows[0].name.y,width:.1,height:template.rows[0].name.height};
assert.equal(G.valid(template),true,'dice may be external to the stats panel');
const resolved=G.resolve(template,{x:.5,y:.2,width:.5,height:.5},{width:1200,height:600});
assert.equal(resolved.valid,true);assert.equal(resolved.unavailable['0-dice'],'clipped-or-too-small','clipped optional dice do not invalidate stats');
assert.equal(Object.keys(resolved.boxes).length,15);
template.rows[0].dice.y=template.rows[4].name.y;assert.equal(G.valid(template),false,'dice cannot belong to a different row');
context.document={createElement:()=>({width:0,height:0,pixel:null,input:null,getContext(){const canvas=this;return {drawImage(input){canvas.input=input;canvas.pixel=input.pixel;}};}})};
vm.runInContext(fs.readFileSync(path.join(root,'ui/scanner-field-recognition.js'),'utf8'),context);
const F=context.window.DNScannerFieldRecognition,frozenTemplate=G.defaults(2),source={width:1200,height:600,pixel:42},temporal={width:600,height:300,pixel:17};
frozenTemplate.rows[0].dice={x:.80,y:frozenTemplate.rows[0].name.y,width:.10,height:frozenTemplate.rows[0].name.height};
frozenTemplate.rows[1].dice={x:1.05,y:frozenTemplate.rows[1].name.y,width:.10,height:frozenTemplate.rows[1].name.height};
let frozen=F.snapshot({template:frozenTemplate,panel:{x:.1,y:.1,width:.5,height:.5},source,panelSource:temporal});
assert.equal(frozen.valid,true);assert.equal(frozen.crops['0-dice'].pixel,42,'inside-panel dice freeze from original source rather than median');
assert.equal(frozen.crops['1-dice'].pixel,42,'external dice freeze from full source');
source.pixel=99;assert.equal(frozen.crops['1-dice'].pixel,42,'external dice cannot change during worker initialization');
assert.deepEqual(Array.from(frozen.diceRequested),[true,true,false,false,false]);
frozen.release();assert.ok(Object.values(frozen.crops).every(crop=>crop.width===0 && crop.height===0),'all optional dice pixels release');
frozen=F.snapshot({template:frozenTemplate,panel:{x:.5,y:.2,width:.5,height:.5},source,panelSource:temporal});
assert.equal(frozen.valid,true);assert.equal(frozen.crops['1-dice'],undefined);assert.equal(frozen.diceRequested[1],true,'clipped requested dice remain explicit unknown evidence');frozen.release();
assert.equal(R.summarize([{rerollEligible:false},{rerollEligible:null}]).count,null);
assert.equal(R.summarize([{rerollEligible:false},{rerollEligible:true}]).pattern,'one');
console.log('Scanner reroll recognition: 13 real fixtures and dice-inclusive crops exact; 26 resized inputs safe ('+transformedUnknown+'/'+transformedRows+' rows unknown); unknown evidence and optional calibration passed.');
async function integration() {
  context.URL=URL;context.document.baseURI='http://localhost/ui/scanner.html';
  context.document.createElement=()=>({width:0,height:0,getContext(){return {drawImage(){},fillRect(){},putImageData(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=42;data[i+3]=255;}return {data};}};}});
  vm.runInContext(fs.readFileSync(path.join(root,'ui/scanner-core.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'ui/scanner-name-catalog.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'ui/scanner-recognition.js'),'utf8'),context);
  const recognition=context.window.DNScannerRecognition;let released=0;
  F.snapshot=()=>({valid:true,crops:{},release(){released++;}});
  const observed=[false,null];
  F.recognize=async()=>({rows:Array.from({length:5},(_,i)=>({name:'Catapult Damage',value:1,known:true,hasPercent:true,
    ...(i<2?{rerollEligible:observed[i],rerollSource:'dice-background',rerollConfidence:i===0?'high':'unknown',rerollEvidence:{reason:i===0?'grey-background':'clipped'}}:{})})),
    hall:'main',warnings:['Weak text read.'],valid:false,unlocked:{count:null,states:Array(5).fill(null)},observations:[]});
  context.window.Tesseract={async createWorker(){return {async setParameters(){},async terminate(){},async recognize(input){const lines=Array.from({length:5},(_,i)=>({text:'Catapult Damage +1%',confidence:95,bbox:{y0:(i+.3)*input.height/5,y1:(i+.7)*input.height/5}}));return {data:{text:lines.map(line=>line.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}};}};}};
  const engine=recognition.create({names:['Catapult Damage'],canonPerk:value=>value});
  try {
    const input=context.document.createElement('canvas');input.width=600;input.height=300;
    const result=await engine.recognize(input,{fields:{},layout:'panel'});
    assert.equal(result.recognitionPath,'calibrated-fields+standard-fallback');
    assert.equal(result.rows[0].rerollEligible,false,'calibrated grey dice override standard fresh-craft true');
    assert.equal(result.rows[1].rerollEligible,null,'calibrated unknown overrides standard fresh-craft true');
    assert.equal(result.rows[1].rerollSource,'dice-background');
    assert.ok(result.rows.slice(2).every(row=>row.rerollEligible===true && row.rerollSource==='fresh-craft'),'uncalibrated rows retain fresh-craft eligibility');
    assert.equal(released,1,'fallback releases every frozen field');
  }finally{await engine.close();}
  console.log('Calibrated dice false/unknown override fresh-craft fallback without changing uncalibrated rows.');
}
async function browser() {
  const http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process');
  const server=http.createServer((request,response)=>{
    if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<script src="/ui/scanner-core.js"></script><script src="/ui/scanner-name-catalog.js"></script><script src="/ui/scanner-recognition.js"></script><script src="/ui/scanner-reroll-recognition.js"></script>');return;}
    const file=path.resolve(root,'.'+decodeURIComponent(request.url));
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();return;}response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'image/png');response.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dn-reroll-pixels-'));
  const chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  try {
    let port;
    for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
    assert.ok(port,'Chrome CDP started');
    const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let id=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),job=pending.get(value.id);if(job){pending.delete(value.id);clearTimeout(job.timeout);value.error?job.reject(value.error):job.resolve(value.result);}});
    const send=(method,params)=>new Promise((resolve,reject)=>{const current=++id,timeout=setTimeout(()=>{pending.delete(current);reject(new Error('CDP timeout: '+method));},30000);pending.set(current,{resolve,reject,timeout});socket.send(JSON.stringify({id:current,method,params}));});
    await send('Page.enable',{});await send('Runtime.enable',{});
    await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    for(let i=0;i<100;i++){const state=await send('Runtime.evaluate',{expression:'!!window.DNScannerRerollRecognition',returnByValue:true});if(state.result.value)break;await new Promise(resolve=>setTimeout(resolve,50));}
    const expression='(async()=>{const fixtures='+JSON.stringify(fixtures)+';const runs=[];'+
      'for(const [stamp,expected] of Object.entries(fixtures)){const bitmap=await createImageBitmap(await(await fetch("/tests/scanner/storage-"+stamp+".png")).blob());'+
      'const original=document.createElement("canvas");original.width=bitmap.width;original.height=bitmap.height;original.getContext("2d").drawImage(bitmap,0,0);bitmap.close();'+
      'for(const kind of ["native","detected","scaled-.75","scaled-1.5","rows-dice"]){let input=original,layout="storage";'+
      'if(kind!=="native"){let box={x:0,y:0,width:original.width,height:original.height},scale=1;'+
      'if(kind==="detected"){const region=DNScannerRecognition.detectPanel(original,{storage:true});if(!region)throw new Error("Missing panel "+stamp);box=DNScannerCore.cropPixels(region,original.width,original.height);}'+
      'if(kind.startsWith("scaled-"))scale=Number(kind.slice(7));'+
      'if(kind==="rows-dice"){layout="storage-rows-dice";box={x:original.width*.303,y:original.height*.151,width:original.width*.66,height:original.height*(expected.length===6?.785:.659)};}'+
      'input=document.createElement("canvas");input.width=Math.round(box.width*scale);input.height=Math.round(box.height*scale);input.getContext("2d").drawImage(original,box.x,box.y,box.width,box.height,0,0,input.width,input.height);}'+
      'const pixels=input.getContext("2d").getImageData(0,0,input.width,input.height).data;const states=DNScannerRerollRecognition.detectStorage(pixels,input.width,input.height,{expectedRows:expected.length,layout}).map(row=>row.rerollEligible);'+
      'runs.push({stamp,kind,states,exact:states.every((state,i)=>state===expected[i]),safe:states.every((state,i)=>state===null||state===expected[i])});if(input!==original)input.width=input.height=0;}original.width=original.height=0;}return runs;})()';
    const evaluated=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(evaluated.exceptionDetails)throw new Error(JSON.stringify(evaluated.exceptionDetails));
    const runs=evaluated.result.value;
    assert.ok(runs.every(run=>run.safe),'Browser classification never confidently wrong: '+JSON.stringify(runs.filter(run=>!run.safe)));
    assert.ok(runs.filter(run=>run.kind==='native').every(run=>run.exact),'Native Canvas masks exact');
    console.log('Chrome Canvas: '+runs.length+' native/detected/bilinear/rows crop cases safe; '+runs.filter(run=>run.exact).length+' exact; unknown cases '+JSON.stringify(runs.filter(run=>!run.exact).map(({stamp,kind,states})=>({stamp,kind,states}))));
  }finally {socket?.close();chrome.kill();server.close();}
}
integration().then(()=>process.argv.includes('--browser')?browser():null).catch(error=>{console.error(error);process.exitCode=1;});
