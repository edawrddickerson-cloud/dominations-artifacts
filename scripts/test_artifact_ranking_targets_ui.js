/* Isolated Artifact Rankings check; block external services and analytics. */
const fs = require('node:fs'), path = require('node:path');
const project = path.resolve(__dirname, '..');
let runner = fs.readFileSync(path.join(project, 'scripts/run_scanner_ocr_fixture.js'), 'utf8');
runner = runner.replace("const root = path.resolve(__dirname, '..');", 'const root = ' + JSON.stringify(project) + ';');
runner = runner.replace("await client.send('Network.enable');", "await client.send('Network.enable'); await client.send('Network.setBlockedURLs',{urls:['https://*']});");
runner = runner.replace("(storage?'storage-scanner.html':'scanner.html')", "'artifacts.html'");
runner = runner.replace("const evaluation=client.send('Runtime.evaluate'", 'expression = ' + JSON.stringify(fs.readFileSync(path.join(project, 'tests/artifact-ranking-targets-browser.js'), 'utf8')) + ";\n    const evaluation=client.send('Runtime.evaluate'");
eval(runner);
