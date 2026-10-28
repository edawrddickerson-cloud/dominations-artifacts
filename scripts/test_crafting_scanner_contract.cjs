/* One fail-fast entry point for the crafting scanner's protected behaviour.
 * Disposable local browser profiles; no live game/account or timing threshold. */
const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const checks=[
  ['test_scanner_recognition.js'],['test_scanner_comparison.js'],['test_strategy_scanner.js'],
  ['test_scanner_reading.js'],['test_scanner_collection.js'],['test_crafting_log_statistics.js'],
  ['test_scanner_speculation.js'],['test_scanner_worker_readiness.js'],
  ['test_scanner_field_reuse.js'],['test_scanner_capture.js'],['check_design_system.cjs'],
  ['run_scanner_ocr_fixture.js','--crafting-keep','--viewport=1440x900','--recent-report','--summary'],
  ['run_scanner_ocr_fixture.js','--crafting-keep','--viewport=390x844','--recent-report','--summary'],
  ['run_scanner_ocr_fixture.js','--crafting-keep','--viewport=320x800','--recent-report','--summary'],
  ['run_scanner_ocr_fixture.js','--glance','--viewport=1440x900','--summary'],
  ['run_scanner_ocr_fixture.js','--provisional-colours','--summary'],
  ['test_scanner_latency.cjs','--real-ocr','--summary'],
];
for(const [file,...args] of checks){
  console.log('Checking '+file+(args.length?' '+args.join(' '):''));
  const result=spawnSync(process.execPath,[path.join(__dirname,file),...args],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status || 1);
}
console.log('Crafting scanner contract passed.');
