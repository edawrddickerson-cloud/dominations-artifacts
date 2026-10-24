// Publication input is an explicit, visually reviewed candidate grouping.
// Source metadata and captions never enter public files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {browserRun}=require('./artwork_browser.cjs');
const {calibrate}=require('./calibrate_artwork_catalog.cjs');
const input=process.argv.find(a=>a.startsWith('--candidates='))?.slice(13)||'data/temp/artwork-review/candidates.json';
const approval=process.argv.find(a=>a.startsWith('--approval='))?.slice(11)||'data/temp/artwork-review/approved.json';
const candidates=JSON.parse(fs.readFileSync(input,'utf8')),review=JSON.parse(fs.readFileSync(approval,'utf8'));
if(review.reviewed!==true)throw Error('A visually reviewed approval file is required.');
const seen=new Set();for(const group of review.groups)for(const n of group){if(seen.has(n)||!candidates[n-1])throw Error('Invalid/repeated approved candidate '+n);seen.add(n);}
browserRun(async({evaluate})=>{
 const result=await evaluate(`(async()=>{await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/ui/artwork-matcher.js';s.onload=ok;s.onerror=no;document.head.append(s);});const input=await(await fetch('/input')).json(),out=[];
 for(const item of input){const im=new Image();im.src=item.image;await im.decode();const c=document.createElement('canvas');c.width=192;c.height=Math.round(192*im.height/im.width);const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,c.width,c.height);out.push({candidate:item.candidate,descriptor:DNArtworkMatcher.describe(x.getImageData(0,0,c.width,c.height).data,c.width,c.height),image:c.toDataURL('image/jpeg',.88)});}return out;})()`);
 const byNumber=new Map(result.map(r=>[r.candidate,r])),entries=[],tests=[];
 fs.mkdirSync('ui/assets/artwork',{recursive:true});
 for(const group of review.groups){
  const display=byNumber.get(group[0]),buffer=Buffer.from(display.image.split(',')[1],'base64');
  const id='art-'+crypto.createHash('sha256').update(buffer).digest('hex').slice(0,16);
  const file=id+'.jpg';
  // Use the preferred image and at most one independent layout example as
  // references. All remaining encounters are held out from threshold tuning.
  const refs=group.slice(0,Math.min(2,Math.max(1,group.length-1)));
  entries.push({id,file,examples:group.map(n=>byNumber.get(n).descriptor),trialExamples:refs.map(n=>byNumber.get(n).descriptor)});
  fs.writeFileSync(path.join('ui/assets/artwork',file),buffer);
  for(const n of group.slice(refs.length))tests.push({id,candidate:n,descriptor:byNumber.get(n).descriptor,source:candidates[n-1].source,encounter:candidates[n-1].encounter});
 }
 const trialEntries=entries.map(({trialExamples,...e})=>({...e,examples:trialExamples}));
 for(const e of entries)delete e.trialExamples;
 const catalog=calibrate({version:1,descriptorVersion:1,maxDistance:.03,minMargin:.008,entries});
 fs.writeFileSync('ui/data/artwork_catalog.json',JSON.stringify(catalog)+'\n');
 fs.writeFileSync('ui/data/artwork_ids.js','/* Generated approved IDs. No captures or source metadata. */\n(()=>{const ids='+JSON.stringify(entries.map(e=>e.id))+';window.DNArtworkIds=Object.freeze(ids);})();\n');
 fs.writeFileSync('data/temp/artwork-review/evaluation.json',JSON.stringify({tests,trialCatalog:{...catalog,entries:trialEntries},reviewedCandidates:result.map(r=>({candidate:r.candidate,descriptor:r.descriptor})),approvedGroups:review.groups}));
 console.log(JSON.stringify({approvedArtwork:entries.length,heldOutCaptures:tests.length,assetsBytes:entries.reduce((n,e)=>n+fs.statSync('ui/assets/artwork/'+e.file).size,0),manifestBytes:fs.statSync('ui/data/artwork_catalog.json').size}));
},{'/input':candidates.filter(c=>seen.has(c.candidate))}).catch(e=>{console.error(e);process.exitCode=1;});
