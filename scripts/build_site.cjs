/* Deterministic, dependency-free static release builder. Source ui/ stays usable
 * with an ordinary local file server; only deployment output is rewritten. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function walk(directory,relative=''){
  return fs.readdirSync(path.join(directory,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(entry=>{
    const name=path.posix.join(relative,entry.name);
    if(entry.name.startsWith('.')||entry.name==='AGENTS.md'||entry.name==='_headers')return [];
    if(entry.isSymbolicLink())throw Error('Symlink is not a deployable asset: '+name);
    return entry.isDirectory()?walk(directory,name):[name];
  });
}
function buildSite({source=path.join(ROOT,'ui'),output=path.join(ROOT,'dist')}={}){
  source=path.resolve(source);output=path.resolve(output);
  if(output===source||source.startsWith(output+path.sep)||output.startsWith(source+path.sep))throw Error('Build output must be separate from source.');
  // Never recursively clear a caller-selected directory. Keep prior immutable
  // releases so already-open tabs can load matching assets after a release.
  const files=walk(source),contents=new Map(files.map(file=>[file,fs.readFileSync(path.join(source,file))]));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(__filename));
  for(const [file,bytes] of contents)if(file!=='service-config.js')hash.update(file+'\0').update(bytes).update('\0');
  const release=hash.digest('hex').slice(0,24),prefix='/static/'+release+'/';
  const assets=new Set(files.filter(file=>!file.endsWith('.html')&&file!=='service-config.js'));
  const directories=new Set();for(const file of assets){let dir=path.posix.dirname(file);while(dir!=='.'){directories.add(dir+'/');dir=path.posix.dirname(dir);}}
  function assetURL(value){
    if(!value||/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))return value;
    const normalized=value.replace(/^(?:\.\/|\/)/,''),name=normalized.split(/[?#]/,1)[0];
    if(name==='service-config.js')return '/service-config.js';
    if(!assets.has(name)&&!directories.has(name))return value;
    // Query version labels are redundant once the parent tree is addressed by
    // content. Retain fragments (SVG references), discard old cache-bust labels.
    return prefix+name+(normalized.includes('#')?'#'+normalized.split('#').slice(1).join('#'):'');
  }
  function rewrite(file,bytes){
    if(file.startsWith('vendor/'))return bytes; // Preserve third-party bytes and internal relative paths.
    const text=bytes.toString('utf8');
    if(file.endsWith('.json')){
      const visit=value=>typeof value==='string'?assetURL(value):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)])):value;
      return Buffer.from(JSON.stringify(visit(JSON.parse(text))));
    }
    if(!/\.(?:html|css|js)$/.test(file))return bytes;
    // Asset literals include directory prefixes used by dynamic catalogue and
    // artwork URLs. Page routes are deliberately excluded from the asset set.
    return Buffer.from(text.replace(/(["'])([^"'\s<>`]+)\1/g,(match,quote,value)=>quote+assetURL(value)+quote));
  }
  fs.mkdirSync(output,{recursive:true});
  const written=[];
  function write(file,bytes){const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);written.push(file);}
  const manifest={version:1,release,prefix,sourceFiles:files,files:{}};
  const previous=path.join(output,'asset-manifest.json');
  if(fs.existsSync(previous)){
    const old=JSON.parse(fs.readFileSync(previous,'utf8'));
    for(const file of old.sourceFiles||[]){
      const target=path.resolve(output,file);
      if(!target.startsWith(output+path.sep)||file.startsWith('static/'))throw Error('Unsafe previous manifest path.');
      if(!contents.has(file)&&fs.existsSync(target))fs.unlinkSync(target);
    }
  }
  for(const file of files){
    const bytes=rewrite(file,contents.get(file));
    // Stable aliases retain compatibility with saved URLs and older source
    // pages. They revalidate; only the content-addressed tree is immutable.
    write(file,bytes);
    if(assets.has(file)){const target=prefix.slice(1)+file;write(target,bytes);manifest.files[file]={url:prefix+file,sha256:digest(bytes)};}
  }
  // Workers already revalidates other assets by default. Avoid an overlapping
  // /* rule: Cloudflare combines headers from all matching custom rules.
  write('_headers',Buffer.from('/static/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/service-config.js\n  Cache-Control: public, max-age=0, must-revalidate\n'));
  write('asset-manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  return manifest;
}
module.exports={buildSite};
if(require.main===module){
  const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--out'))throw Error('Usage: node scripts/build_site.cjs [--out DIRECTORY]');
  const result=buildSite(args.length?{output:args[1]}:{});
  console.log('Built '+Object.keys(result.files).length+' versioned assets at '+result.prefix+' → '+(args[1]||'dist'));
}
