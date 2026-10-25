/* Local browser integration: shared ownership, independent strategy scores/ranks and layouts. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let runner=fs.readFileSync(path.join(root,'scripts/run_scanner_ocr_fixture.js'),'utf8');
runner=runner.replace("const root = path.resolve(__dirname, '..');",'const root='+JSON.stringify(root)+';');
runner=runner.replace("(storage?'storage-scanner.html':'scanner.html')","'collection.html'");
runner=runner.replace("const observedRequests=[], browserErrors=[],blockedRequests=new Set();","const observedRequests=[], browserErrors=[],blockedRequests=new Set();\n    client.on(message=>{if(process.argv.includes('--trace') && message.method==='Runtime.consoleAPICalled')console.error(message.params.args.map(arg=>arg.value).join(' '));});");
runner=runner.replace("const evaluation=client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});","await client.send('Network.setBlockedURLs',{urls:['https://*']});\n    expression='(document.getElementById(\"scanner-view\")?.contentWindow || window).eval('+JSON.stringify(fs.readFileSync(path.join(root,'tests/strategy-collection-browser.js'),'utf8'))+')';\n    const evaluation=client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});");
if(!process.argv.includes('--primary-filters'))process.argv.push('--primary-filters');
eval(runner);
