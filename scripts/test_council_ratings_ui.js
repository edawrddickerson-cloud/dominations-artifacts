/* Local isolated browser check; external services and analytics are blocked. */
const fs = require('node:fs'), path = require('node:path');
const project = path.resolve(__dirname, '..');
let runner = fs.readFileSync(path.join(project, 'scripts/run_scanner_ocr_fixture.js'), 'utf8');
runner = runner.replace("const root = path.resolve(__dirname, '..');", 'const root = ' + JSON.stringify(project) + ';');
runner = runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
runner = runner.replace("(storage?'storage-scanner.html':'scanner.html')", "'council-ratings.html'");
runner = runner.replace("const origin='http://127.0.0.1:'", "{const size=(process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11)||'1440x900').split('x').map(Number);await client.send('Emulation.setDeviceMetricsOverride',{width:size[0],height:size[1],deviceScaleFactor:1,mobile:false});}\n    const origin='http://127.0.0.1:'");
const scenario = fs.readFileSync(path.join(project, 'tests/council-ratings-browser.js'), 'utf8');
const expression = '(document.getElementById("scanner-view")?.contentWindow || window).eval(' + JSON.stringify(scenario) + ')';
runner = runner.replace("const evaluation=client.send('Runtime.evaluate'", 'expression = ' + JSON.stringify(expression) + ";\n    const evaluation=client.send('Runtime.evaluate'");
if (process.argv.includes('--screenshot')) runner = runner.replace('if(result.exceptionDetails)', "fs.writeFileSync(path.join(root,'data/temp/council-ratings-review-'+(process.argv.find(arg=>arg.startsWith('--viewport='))?.slice(11)||'1440x900')+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));\n    if(result.exceptionDetails)");
eval(runner);
