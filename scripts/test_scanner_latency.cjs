/* Isolated timing evidence. Snapshot overrides may contain only changed files. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');","await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
runner=runner.replace("if(snapshot && file.startsWith(path.join(root,'ui')+path.sep))file=path.join(snapshot,path.relative(root,file));","if(snapshot && file.startsWith(path.join(root,'ui')+path.sep)){const overlay=path.join(snapshot,path.relative(root,file));if(fs.existsSync(overlay))file=overlay;}");
runner=runner.replace("const origin='http://127.0.0.1:'","await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});\n const origin='http://127.0.0.1:'");
const code='window.DNVerifyLatency='+process.argv.includes('--verify')+';\n'+fs.readFileSync(path.join(project,process.argv.includes('--live')?'tests/scanner/latency-live-browser.js':process.argv.includes('--real-ocr')?'tests/scanner/latency-ocr-browser.js':'tests/scanner/latency-browser.js'),'utf8');
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = \'(document.getElementById("scanner-view")?.contentWindow || window).eval(\'+JSON.stringify('+JSON.stringify(code)+')+\')\';\n const evaluation=client.send(\'Runtime.evaluate\'');
const evidence=process.argv.find(arg=>arg.startsWith('--evidence='))?.slice(11);
if(evidence){if(!/^[a-z0-9-]+$/.test(evidence))throw Error('Invalid evidence label');runner=runner.replace('const value=result.result.value;',"const value=result.result.value;fs.writeFileSync(path.join(root,'data/temp/scanner-latency-"+evidence+".json'),JSON.stringify(value,null,2));console.error(JSON.stringify({...value.metrics,...(value.metrics.comparison?{comparison:{...value.metrics.comparison,signature:undefined}}:{})}));");}
eval(runner);
