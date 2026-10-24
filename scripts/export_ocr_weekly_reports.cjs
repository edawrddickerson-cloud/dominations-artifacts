/* Export permanent aggregate reports and explicitly reviewed fixtures only. */
const fs=require('node:fs'),path=require('node:path');
const {sourceEnvironment,query,setLog}=require('./backup_database.cjs');
setLog(path.resolve('data/temp/ocr-weekly-export.log'));
try{
 const week=process.argv.find(a=>a.startsWith('--week='))?.slice(7);if(week && !/^\d{4}-\d{2}-\d{2}$/.test(week))throw Error('Use --week=YYYY-MM-DD (Monday UTC).');
 const report=JSON.parse(query(sourceEnvironment(),"select public.planner_read_ocr_weekly_reports("+(week?"'"+week+"'::date":'null')+")"));
 const directory=path.resolve('data/temp/ocr-weekly-reports');fs.mkdirSync(directory,{recursive:true});
 for(const row of report.reports){if(!/^\d{4}-\d{2}-\d{2}$/.test(row.week))throw Error('Invalid report date.');fs.writeFileSync(path.join(directory,row.week+'.json'),JSON.stringify(row,null,2)+'\n');}
 fs.writeFileSync(path.join(directory,'index.json'),JSON.stringify({exportedAt:new Date().toISOString(),retention:report.retention,weeks:report.reports.map(r=>r.week)},null,2)+'\n');
 console.log('Exported '+report.reports.length+' weekly reports: '+directory);
}catch(e){console.error(e.message);process.exitCode=1;}
