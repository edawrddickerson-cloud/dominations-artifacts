/* Scheduled read-only exports into an operator-selected private sync folder.
 * Credentials stay local; only the database archive and manifest are copied.
 * A successful local copy does not prove that OneDrive uploaded it.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'data/temp');
const configFile=path.join(scratch,'database-backup-schedule.json');
const statusFile=path.join(scratch,'database-backup-status.json'),lockFile=path.join(scratch,'database-backup.lock');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function execute(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:4*1024*1024,...options});
  if(result.error || result.status!==0)throw Error('Backup command failed. See database-backup-run.log.');
  return result.stdout || '';
}
function main(){
  const config=read(configFile,null);if(!config?.destination)throw Error('Backup schedule configuration is missing.');
  const destination=fs.realpathSync(config.destination);
  if(!fs.statSync(destination).isDirectory() || destination.toLowerCase().startsWith(path.join(root,'ui').toLowerCase()+path.sep))throw Error('Expected the private backup directory outside the website.');
  let previous=read(statusFile,{}),locked=false;
  const writeStatus=fields=>{previous={...previous,...fields};fs.writeFileSync(statusFile,JSON.stringify(previous,null,2));};
  if(!process.argv.includes('--force') && previous.lastSuccess && Date.now()-Date.parse(previous.lastSuccess)<20*3600000){console.log('A recent backup already completed.');return;}
  try {
    try{fs.writeFileSync(lockFile,JSON.stringify({pid:process.pid,started:new Date().toISOString()}),{flag:'wx'});locked=true;}
    catch(error){if(error.code!=='EEXIST')throw error;throw Error('Another backup is running, or an interrupted run left database-backup.lock.');}
    writeStatus({lastAttempt:new Date().toISOString(),lastAttemptStatus:'running'});
    const verify=!previous.lastRestoreVerified || Date.now()-Date.parse(previous.lastRestoreVerified)>7*86400000;
    const runLog=path.join(scratch,'database-backup-run.log');
    const log=fs.openSync(runLog,'a');let output;
    try {
      const result=spawnSync(config.nodePath || process.execPath,[path.join(root,'scripts/backup_database.cjs'),...(verify?['--verify']:[])],{cwd:root,encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:4*1024*1024});
      fs.writeSync(log,new Date().toISOString()+'\n'+(result.stdout || '')+(result.stderr || '')+'\n');
      if(result.error || result.status!==0)throw Error('Database export or restore verification failed. See database-backup-run.log.');
      output=result.stdout;
    } finally{fs.closeSync(log);}
    const folder=path.resolve(output.match(/Backup folder: (.+)/)?.[1]?.trim() || '');
    if(!folder.startsWith(path.join(scratch,'database-backups')+path.sep))throw Error('Unexpected export directory.');
    const manifest=read(path.join(folder,'manifest.json'),null),archive=path.join(folder,'planner-auth.dump');
    if(!manifest?.sha256 || hash(archive)!==manifest.sha256 || verify && !manifest.restoreVerified)throw Error('Backup verification metadata did not match.');
    const pgBin=process.env.PLANNER_PG_BIN || path.join(scratch,'postgresql-tools/pgsql/bin');
    const contents=execute(path.join(pgBin,'pg_restore.exe'),['--list',archive]);
    if(!contents.includes('planner_workspaces') || !/TABLE DATA auth users\b/.test(contents))throw Error('The archive is missing planner or Auth records.');
    const name='dominations-database-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex')+'.zip';
    const packageFile=path.join(folder,name);
    execute(path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/package_database_backup.ps1'),'-BackupDirectory',folder,'-ArchiveFile',packageFile]);
    const pending=path.join(destination,name+'.pending'),final=path.join(destination,name);
    fs.copyFileSync(packageFile,pending,fs.constants.COPYFILE_EXCL);
    if(hash(pending)!==hash(packageFile))throw Error('The copied backup checksum did not match.');
    fs.renameSync(pending,final);
    const completed=new Date().toISOString();
    writeStatus({lastAttemptStatus:'passed',lastError:null,lastSuccess:completed,lastArchive:final,lastArchiveSha256:hash(final),lastRestoreVerified:verify?completed:previous.lastRestoreVerified,copiedToSyncFolder:true,cloudUploadVerified:false});
    console.log('Database backup copied and checksum verified: '+final);
  } catch(error){writeStatus({lastAttemptStatus:'failed',lastError:error.message});throw error;}
  finally{if(locked)fs.unlinkSync(lockFile);}
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
