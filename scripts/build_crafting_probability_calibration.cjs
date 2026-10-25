/* Publish counts only from a reviewed, opted-in historical analysis snapshot.
 * Never copy owner IDs, encounter IDs, names, OCR or private workspace data. */
const fs=require('node:fs'),vm=require('node:vm');
const input=process.argv.find(a=>a.startsWith('--input='))?.slice(8);
if(!input)throw Error('Use --input=PRIVATE_BACKFILL_PLAN.json');
const source=JSON.parse(fs.readFileSync(input)),app={window:{}};vm.createContext(app);
for(const f of ['data/artifact_stat_context','crafted-log-stats','crafting-community','crafting-probability'])vm.runInContext(fs.readFileSync('ui/'+f+'.js','utf8'),app);
const P=app.window.DNCraftingProbability,records=source.workspace.craftingLog.items;
const result={version:1,calibration:P.calibration,halls:{}};
for(const hall of ['main','war']){result.halls[hall]={};for(const category of P.categories[hall]){const model=P.model(records,hall,category);result.halls[hall][category]={profiles:model.profiles};}}
fs.writeFileSync('ui/data/crafting_probability_calibration.js','// Historical aggregate tier counts; inferred periods, no encounter data.\nwindow.DN_CRAFTING_PROBABILITY_CALIBRATION = '+JSON.stringify(result)+';\n');
console.log('Historical aggregate tier profiles written.');
