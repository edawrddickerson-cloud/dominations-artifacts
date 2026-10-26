'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildSite}=require('./build_site.cjs');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(root,'data/temp/site-build-'));
function put(name,text){const target=path.join(temp,'source',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}
const options={source:path.join(temp,'source'),output:path.join(temp,'output')};
try{
  put('page.html','<script src="app.js?v=old"></script><link href="styles.css"><a href="page.html">Page</a>');
  put('app.js',"fetch('./data/a.json',{credentials:'same-origin'});script('optional.js?v=old');new URL('vendor/tesseract/',document.baseURI);const image='assets/artwork/'+id+'.jpg';const route='page.html';script('service-config.js?v=old');");
  put('optional.js',"fetch('./data/'+name);");put('styles.css','@import url("components.css?v=old");');put('components.css','body{}');
  put('data/a.json','{"image":"assets/artwork/a.jpg","external":"https://example.com/image.jpg"}');
  put('assets/artwork/a.jpg','image');put('vendor/tesseract/worker.min.js',"importScripts('core/a.js');");
  put('vendor/tesseract/core/a.js','core');put('service-config.js','window.config=1;');
  let first=buildSite(options),second=buildSite(options);
  assert.deepEqual(first,second,'unchanged sources build reproducibly');
  const read=file=>fs.readFileSync(path.join(options.output,file),'utf8');
  const app=read('app.js');
  assert.ok(app.includes(first.prefix+'data/a.json'));assert.ok(app.includes(first.prefix+'optional.js'));
  assert.ok(app.includes(first.prefix+'vendor/tesseract/'));assert.ok(app.includes(first.prefix+'assets/artwork/'));
  assert.ok(app.includes("const route='page.html'"));assert.ok(app.includes("script('/service-config.js')"));
  assert.ok(read('optional.js').includes(first.prefix+'data/'));
  assert.ok(read('styles.css').includes(first.prefix+'components.css'));assert.ok(!read('styles.css').includes('?v='));
  assert.ok(read('page.html').includes('href="page.html"'));assert.ok(read('page.html').includes(first.prefix+'app.js'));
  assert.equal(JSON.parse(read('data/a.json')).image,first.prefix+'assets/artwork/a.jpg');
  assert.equal(JSON.parse(read('data/a.json')).external,'https://example.com/image.jpg');
  assert.equal(read(first.prefix.slice(1)+'vendor/tesseract/worker.min.js'),"importScripts('core/a.js');",'vendor relative URL contract is preserved');
  const headers=read('_headers');assert.ok(headers.includes('/static/*\n  Cache-Control: public, max-age=31536000, immutable'));
  assert.ok(!headers.startsWith('/*\n'),'immutable rule must not overlap a blanket revalidation rule');
  put('service-config.js','window.config=2;');assert.equal(buildSite(options).release,first.release,'live configuration stays independently revalidated');
  for(const file of ['data/a.json','components.css','optional.js','assets/artwork/a.jpg','vendor/tesseract/core/a.js']){
    const before=buildSite(options);fs.appendFileSync(path.join(options.source,file),file.endsWith('.json')?' ':'\n');
    const after=buildSite(options);assert.notEqual(after.release,before.release,file+' invalidates its whole dependency tree');
    assert.ok(fs.existsSync(path.join(options.output,before.prefix.slice(1),'app.js')),'old version retained for open tabs');
  }
  fs.unlinkSync(path.join(options.source,'optional.js'));buildSite(options);assert.ok(!fs.existsSync(path.join(options.output,'optional.js')),'removed stable alias is removed');
  assert.throws(()=>buildSite({source:options.source,output:options.source}),/separate/);
  console.log('PASS: reproducibility, asset/config invalidation, HTML routes, dynamic loaders/data/artwork, CSS imports, vendor paths, cache scope and old-release retention.');
}finally{
  if(!temp.startsWith(path.join(root,'data','temp')+path.sep))throw Error('Unsafe temporary path.');
  fs.rmSync(temp,{recursive:true,force:true});
}
