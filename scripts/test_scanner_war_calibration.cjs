/* Real War OCR with existing saved calibration. Local disposable browser only. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(__dirname,'run_scanner_ocr_fixture.js'),'utf8');
function replace(before,after){if(!runner.includes(before))throw Error('OCR harness changed: '+before);runner=runner.replace(before,after);}
replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
replace("await client.send('Network.enable');","await client.send('Network.enable');await client.send('Network.setBlockedURLs',{urls:['https://*']});");
replace("if(snapshot && file.startsWith(path.join(root,'ui')+path.sep))file=path.join(snapshot,path.relative(root,file));","if(snapshot && file.startsWith(path.join(root,'ui')+path.sep)){const overlay=path.join(snapshot,path.relative(root,file));if(fs.existsSync(overlay))file=overlay;}");
replace('longBenchmark?600000:90000','240000');
replace('longBenchmark?650000:120000','260000');
const live=process.argv.includes('--live');
if(live){
  // Simulate a browser which already has the old broad calibration before any
  // scanner script loads. This profile is disposable; no user storage is used.
  const template={version:1,aspect:632/330,category:null,hall:null,rows:Array.from({length:5},(_,i)=>{
    const y=.275+.657*i/5,height=.657/5;
    return {name:{x:.115,y,width:.84,height},percentage:{x:.115,y,width:.84,height},star:{x:.062,y:y+height/2-.018,width:.022,height:.036},dice:null};
  })};
  const seed='localStorage.setItem("dn-crafting-field-template-v1",'+JSON.stringify(JSON.stringify(template))+');';
  replace("await client.send('Page.navigate'",'await client.send("Page.addScriptToEvaluateOnNewDocument",{source:'+JSON.stringify(seed)+'});await client.send(\'Page.navigate\'');
}
const code='window.DNWarCalibrationFull='+process.argv.includes('--full')+';window.DNWarCalibrationDimming='+live+';\n'+fs.readFileSync(path.join(project,live?'tests/scanner/latency-live-browser.js':'tests/scanner/war-calibration-browser.js'),'utf8');
replace("const evaluation=client.send('Runtime.evaluate'",'expression=\'(document.getElementById("scanner-view")?.contentWindow || window).eval(\'+JSON.stringify('+JSON.stringify(code)+')+\')\';const evaluation=client.send(\'Runtime.evaluate\'');
const evidence=process.argv.find(arg=>arg.startsWith('--evidence='))?.slice(11);
let saveEvidence='';
if(evidence){
  if(!/^[a-z0-9-]+$/.test(evidence))throw Error('Invalid evidence label');
  saveEvidence="fs.writeFileSync(path.join(root,'data/temp/war-calibration-"+evidence+".json'),JSON.stringify({...value,network:{external:value.network.externalRequests.length,errors:value.network.browserErrors},sourceHash:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(snapshot || root,'ui/scanner-field-recognition.js'))).digest('hex')},null,2));";
}
replace("console.log(JSON.stringify(process.argv.includes('--summary')?summary:value,null,2));",saveEvidence+"console.log(JSON.stringify({passed:value.passed,...value.metrics,runs:value.metrics.runs.map(({observations,rows,warnings,...run})=>({...run,...(warnings?{warnings}: {})})),network:{external:value.network.externalRequests.length,errors:value.network.browserErrors}},null,2));");
eval(runner);
