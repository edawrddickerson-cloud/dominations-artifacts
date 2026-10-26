/* Read-only byte/header verification of a built release. Does not publish. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function checkRelease({origin,output=path.resolve(__dirname,'../dist')}){
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'asset-manifest.json'),'utf8'));
  const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.pathname!=='/')throw Error('Origin must be an HTTP(S) site root.');
  const entries=[...Object.entries(manifest.files).map(([source,value])=>({source,url:value.url,sha256:value.sha256,immutable:true})),
    ...manifest.sourceFiles.filter(file=>file.endsWith('.html')||file==='service-config.js').map(file=>({source:file,url:'/'+file,sha256:digest(fs.readFileSync(path.join(output,file))),immutable:false}))];
  const checks=[];let next=0;
  async function worker(){while(next<entries.length){
    const entry=entries[next++],response=await fetch(new URL(entry.url,url),{cache:'no-store',signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await response.arrayBuffer()),control=response.headers.get('cache-control')||'';
    const policy=entry.immutable?/\bimmutable\b/i.test(control)&&/\bmax-age=31536000\b/i.test(control)&&!/\b(?:no-cache|no-store|max-age=0)\b/i.test(control):!/\bimmutable\b/i.test(control)&&/\bmax-age=0\b/i.test(control)&&/\bmust-revalidate\b/i.test(control);
    checks.push({file:entry.source,url:entry.url,status:response.status,bytesMatch:response.ok&&digest(bytes)===entry.sha256,cachePolicy:policy});
  }}
  await Promise.all(Array.from({length:6},worker));
  const failed=checks.filter(check=>!check.bytesMatch||!check.cachePolicy);
  if(failed.length)throw Error('Release verification failed: '+JSON.stringify(failed));
  return {passed:true,origin:url.origin,release:manifest.release,files:checks.length};
}
module.exports={checkRelease};
if(require.main===module){
  const origin=process.argv.find(arg=>arg.startsWith('--origin='))?.slice(9),output=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6);
  if(!origin)throw Error('Usage: node scripts/check_site_release.cjs --origin=https://SITE [--out=dist]');
  checkRelease({origin,...(output?{output}:{})}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
