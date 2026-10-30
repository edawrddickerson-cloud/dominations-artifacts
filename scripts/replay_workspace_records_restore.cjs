/* Rehearse a revised candidate against an already verified private archive.
 * Restores to a new loopback cluster; never writes to the hosted connection. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{spawnSync}=require('node:child_process');
const {sourceEnvironment,query,fingerprints,security,setLog}=require('./backup_database.cjs');
const {rehearse}=require('./rehearse_workspace_records.cjs');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp');
async function main() {
  const option=process.argv.find(arg=>arg.startsWith('--backup='));if(!option)throw Error('Use --backup=<verified backup folder>.');
  const backup=path.resolve(root,option.slice(9)),boundary=path.join(scratch,'database-backups')+path.sep;
  if(!backup.startsWith(boundary))throw Error('Expected a private backup inside the workspace.');
  const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
  const archive=path.resolve(backup,manifest.archive);
  if(!archive.startsWith(backup+path.sep) || !manifest.restoreVerified || crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==manifest.sha256)throw Error('Verified archive checksum required.');
  const directory=fs.mkdtempSync(path.join(scratch,'record-restore-replay-')),log=path.join(directory,'execution.log');setLog(log);
  const bin=process.env.PLANNER_PG_BIN || path.join(scratch,'postgresql-tools/pgsql/bin');
  function run(tool,args,env) {
    const fd=fs.openSync(log,'a');let result;
    try{result=spawnSync(path.join(bin,tool+'.exe'),args,{env,windowsHide:true,encoding:'utf8',timeout:180000,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
    if(result.error || result.status!==0)throw Error('Local '+tool+' failed; details remain in the private execution log.');
  }
  const source=sourceEnvironment();
  const roles=query(source,"select rolname from pg_roles where rolname !~ '^pg_' and rolname<>'planner_restore' order by rolname").split(/\r?\n/).filter(Boolean);
  const listener=net.createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const passwordFile=path.join(directory,'restore-password.txt'),password=crypto.randomBytes(32).toString('hex'),cluster=path.join(directory,'cluster');
  fs.writeFileSync(passwordFile,password,{mode:0o600});
  const local={...process.env,PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:'postgres',PGUSER:'planner_restore',PGPASSWORD:password,PGSSLMODE:'disable',PGAPPNAME:'planner-local-restore',PGOPTIONS:'-c timezone=UTC',PGCONNECT_TIMEOUT:'10'};
  let started=false;
  try {
    run('initdb',['-D',cluster,'-U','planner_restore','--auth=scram-sha-256','--pwfile',passwordFile,'--encoding=UTF8','--locale=C'],local);
    started=true;run('pg_ctl',['-D',cluster,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],local);
    const quote=value=>'"'+value.replaceAll('"','""')+'"';
    query(local,roles.map(role=>'create role '+quote(role)+' nologin;').join('\n')+'\ndrop schema public;');
    run('pg_restore',['-w','--exit-on-error','--single-transaction','--no-owner','--dbname','postgres',archive],local);
    const tables=manifest.tables.map(({schema,name})=>({schema,name}));
    const verify=()=>{if(JSON.stringify(fingerprints(local,tables))!==JSON.stringify(manifest.tables) || JSON.stringify(security(local))!==JSON.stringify(manifest.security))throw Error('Restored table or security fingerprints differ.');};
    verify();const result=rehearse({local,query,root});verify();
    const report={at:new Date().toISOString(),backup,archiveSha256:manifest.sha256,verifiedTables:tables.length,originalDataAndSecurityMatch:true,...result};
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.relative(root,path.join(directory,'report.json')),...result}));
  }finally {
    if(started)run('pg_ctl',['-D',cluster,'-m','fast','-w','stop'],local);
    fs.unlinkSync(passwordFile);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
