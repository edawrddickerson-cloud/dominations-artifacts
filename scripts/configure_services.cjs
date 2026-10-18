/* Reads browser-safe setup values without echoing them. Never accepts a service
 * secret. Only --apply writes the public ui/service-config.js configuration. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const input=process.argv.find(arg=>arg.startsWith('--file='))?.slice(7) || path.join(root,'data/temp/service-credentials.txt');
try {
  const values={};
  for(const line of fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)) {
    if(!line.trim() || line.trim().startsWith('#'))continue;
    const match=/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if(!match)throw Error('Use KEY=value lines in the local credentials file.');
    values[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
  }
  if(Object.keys(values).some(key=>/SECRET|SERVICE_ROLE|PERSONAL_API/.test(key) && values[key]))throw Error('Privileged credentials cannot be used in browser configuration. Remove them from this setup file.');
  const updates={};
  if(values.SUPABASE_URL || values.SUPABASE_PUBLISHABLE_KEY) {
    if(!values.SUPABASE_URL || !values.SUPABASE_PUBLISHABLE_KEY)throw Error('Both the Supabase project URL and publishable key are required.');
    const url=new URL(values.SUPABASE_URL);
    if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))throw Error('Use the HTTPS Supabase project URL with no credentials, query or path.');
    if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(values.SUPABASE_PUBLISHABLE_KEY))throw Error('The Supabase value must be the publishable key, not a secret or legacy service-role key.');
    updates.supabaseUrl=url.origin;updates.supabasePublishableKey=values.SUPABASE_PUBLISHABLE_KEY;
  }
  if(values.POSTHOG_PROJECT_TOKEN) {
    if(!/^phc_[A-Za-z0-9_-]+$/.test(values.POSTHOG_PROJECT_TOKEN))throw Error('Use the PostHog project token, not a personal API key.');
    updates.posthogToken=values.POSTHOG_PROJECT_TOKEN;
  }
  const destination=path.join(root,'ui/service-config.js');let content=fs.readFileSync(destination,'utf8');
  for(const [key,value] of Object.entries(updates)) {
    const pattern=new RegExp('('+key+':)\\s*([\'\"])(.*?)\\2');
    if(!pattern.test(content))throw Error('The public configuration format changed; no values were written.');
    content=content.replace(pattern,(_match,prefix)=>prefix+JSON.stringify(value));
  }
  new vm.Script(content);
  if(process.argv.includes('--apply'))fs.writeFileSync(destination,content);
  console.log(JSON.stringify({validated:true,applied:process.argv.includes('--apply'),supabase:!!updates.supabaseUrl,posthog:!!updates.posthogToken}));
}catch(error){console.error(error.message);process.exitCode=1;}
