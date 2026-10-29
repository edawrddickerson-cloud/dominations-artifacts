/* Reuse the isolated local Chrome harness; no external services or user storage. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');","await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
runner=runner.replace("(storage?'storage-scanner.html':'scanner.html')","'research-planner.html'");
runner=runner.replace("const origin='http://127.0.0.1:'","{const [width,height]=(process.argv.find(a=>a.startsWith('--viewport='))?.slice(11)||'1440x900').split('x').map(Number);await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}\n    const origin='http://127.0.0.1:'");
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = \'(document.getElementById("scanner-view")?.contentWindow || window).eval(\'+JSON.stringify('+JSON.stringify(fs.readFileSync(path.join(project,'tests/research-planner-browser.js'),'utf8'))+')+\')\';\n    const evaluation=client.send(\'Runtime.evaluate\'');
if(process.argv.includes('--screenshot'))runner=runner.replace('if(result.exceptionDetails)',"fs.writeFileSync(path.join(root,'data/temp/research-'+(process.argv.find(a=>a.startsWith('--viewport='))?.slice(11)||'1440x900')+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));\n    if(result.exceptionDetails)");
eval(runner);
