/* Replay labelled original War motion through the production capture UI.
 * Original video is read-only and served on loopback. No pixels are published. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project=path.resolve(__dirname,'..'),option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const recording=path.resolve(option('video') || ''),labels=JSON.parse(fs.readFileSync(path.join(project,'tests/scanner/video/war-2026-10-28.json'),'utf8'));
if(!option('video') || !fs.statSync(recording).isFile())throw Error('Use --video=PATH to the original War recording.');
let runner=fs.readFileSync(path.join(__dirname,'run_scanner_ocr_fixture.js'),'utf8');
function replace(before,after){if(!runner.includes(before))throw Error('OCR harness changed: '+before);runner=runner.replace(before,after);}
replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
replace("await client.send('Network.enable');","await client.send('Network.enable');await client.send('Network.setBlockedURLs',{urls:['https://*']});");
replace("if(snapshot && file.startsWith(path.join(root,'ui')+path.sep))file=path.join(snapshot,path.relative(root,file));","if(snapshot && file.startsWith(path.join(root,'ui')+path.sep)){const overlay=path.join(snapshot,path.relative(root,file));if(fs.existsSync(overlay))file=overlay;}");
replace('chrome.kill(); server.close();','chrome.kill();server.closeAllConnections();server.close();');
const videoRoute=`if(new URL(req.url,'http://localhost').pathname==='/__war_recording'){
  const file=${JSON.stringify(recording)},size=fs.statSync(file).size,range=/^bytes=(\\d+)-(\\d*)$/.exec(req.headers.range || '');
  const start=range?Number(range[1]):0,end=range && range[2]?Math.min(size-1,Number(range[2])):size-1;
  if(start<0 || start>end || start>=size){res.writeHead(416).end();return;}
  res.writeHead(range?206:200,{'Content-Type':'video/x-matroska','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':'bytes '+start+'-'+end+'/'+size}:{})});
  fs.createReadStream(file,{start,end}).pipe(res);return;
}`;
replace("let file = path.resolve(root,",videoRoute+"let file = path.resolve(root,");
const times=option('times')?.split(',').map(Number);if(times?.some(time=>!Number.isFinite(time) || !labels.cases.some(label=>label.time===time)))throw Error('Select independently labelled times');
const code='window.DNWarVideoTimes='+JSON.stringify(times || null)+';window.DNWarVideoStatic='+process.argv.includes('--static')+';window.DNWarVideoInputs='+process.argv.includes('--debug-inputs')+';\n'+fs.readFileSync(path.join(project,'tests/scanner/war-video-browser.js'),'utf8');
replace("const evaluation=client.send('Runtime.evaluate'",'expression=\'(document.getElementById("scanner-view")?.contentWindow || window).eval(\'+JSON.stringify('+JSON.stringify(code)+')+\')\';const evaluation=client.send(\'Runtime.evaluate\'');
const evidence=option('evidence') || 'review';if(!/^[a-z0-9-]+$/.test(evidence))throw Error('Invalid evidence label');
replace("console.log(JSON.stringify(process.argv.includes('--summary')?summary:value,null,2));","for(const [index,input] of (value.inputs || []).entries())fs.writeFileSync(path.join(root,'data/temp/war-video-input-'+index+'.png'),Buffer.from(input,'base64'));delete value.inputs;const report={...value,network:{external:value.network.externalRequests.length,errors:value.network.browserErrors},sourceHashes:Object.fromEntries(['scanner-reading.js','scanner-field-recognition.js','scanner-recognition.js'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(fs.existsSync(path.join(snapshot || root,'ui',file))?path.join(snapshot || root,'ui',file):path.join(root,'ui',file))).digest('hex')]))};fs.writeFileSync(path.join(root,'data/temp/war-video-"+evidence+".json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));");
(async()=>{const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(recording))hash.update(chunk);if(hash.digest('hex')!==labels.source.sha256)throw Error('Video does not match independently labelled recording');eval(runner);})().catch(error=>{console.error(error);process.exitCode=1;});
