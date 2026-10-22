/* Reuse the local headless Chrome harness with a strategy integration scenario. */
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
const requestedViewport=process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11) || '1440x900';
if(!/^\d{3,4}x\d{3,4}$/.test(requestedViewport))throw Error('Invalid viewport');
const [width,height]=requestedViewport.split('x').map(Number);
let runner=fs.readFileSync(path.join(project,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root = '+JSON.stringify(project)+';');
runner=runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['*://static.cloudflareinsights.com/*','*://static.wikia.nocookie.net/*']});");
runner=runner.replace("await client.send('Page.enable');", "await client.send('Page.enable'); await client.send('Emulation.setDeviceMetricsOverride',"+JSON.stringify({width,height,deviceScaleFactor:1,mobile:false})+");");
const scenario=fs.readFileSync(path.join(project,'tests/strategies-browser.js'),'utf8');
const expression='(document.getElementById("scanner-view")?.contentWindow || window).eval('+JSON.stringify(scenario)+')';
runner=runner.replace("const evaluation=client.send('Runtime.evaluate'",'expression = '+JSON.stringify(expression)+";\n    const evaluation=client.send('Runtime.evaluate'");
runner=runner.replace("console.log(JSON.stringify(process.argv.includes('--summary')?summary:value,null,2));", "console.log(JSON.stringify({passed:value.passed,checks:value.checks,network:{externalRequests:value.network.externalRequests.map(request=>request.url),errors:browserErrors}},null,2));");
if(process.argv.includes('--screenshots'))runner=runner.replace('const result=await evaluation;', "const result=await evaluation; const layout=await client.send('Page.getLayoutMetrics'); const screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:"+width+",height:Math.min(1800,layout.cssContentSize.height),scale:1}}); fs.mkdirSync(path.join(root,'data/temp/strategy-previews'),{recursive:true}); fs.writeFileSync(path.join(root,'data/temp/strategy-previews/scanner-"+requestedViewport+".png'),Buffer.from(screenshot.data,'base64'));");
eval(runner);
