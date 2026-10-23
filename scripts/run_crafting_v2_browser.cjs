/* Reuse the repository's isolated Chrome harness; never opens a user profile. */
const fs=require('node:fs');
let runner=fs.readFileSync('scripts/run_scanner_ocr_fixture.js','utf8');
runner=runner.replaceAll("process.argv.includes('--crafting-stats')","process.argv.includes('--crafting-v2')");
runner=runner.replaceAll('tests/scanner/crafted-log-stats-browser.js','tests/scanner/crafting-v2-browser.js').replaceAll('data/temp/crafted-log-stats-previews','data/temp/crafting-v2-previews');
if(!process.argv.includes('--crafting-v2'))process.argv.push('--crafting-v2');
eval(runner);
