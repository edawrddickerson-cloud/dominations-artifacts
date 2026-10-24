// Extract candidates locally; never publish unreviewed source images.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {browserRun}=require('./artwork_browser.cjs');
const files=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
if(!files.length)throw Error('Pass owner-selected backup or scanner export JSON files.');
const items=[],seen=new Set();
for(const file of files){
 const d=JSON.parse(fs.readFileSync(file,'utf8'));let log=d.records?.find(r=>r.id==='crafting-log')?.value;if(typeof log==='string')log=JSON.parse(log);
 for(const item of [...(d.items||[]),...(d.records||[]).flatMap(r=>r.items||[]),...(log?.items||[])]){
  if(!/^data:image\/(jpeg|png|webp);base64,/.test(item.image||''))continue;
  const hash=crypto.createHash('sha256').update(item.image).digest('hex');if(seen.has(hash))continue;seen.add(hash);
  items.push({candidate:items.length+1,name:item.name||'',hall:item.hall||'',type:item.type||'',image:item.image,source:path.basename(file),encounter:item.encounterId||item.id||hash});
 }
}
fs.mkdirSync('data/temp/artwork-review',{recursive:true});
fs.writeFileSync('data/temp/artwork-review/candidates.json',JSON.stringify(items));
if(process.argv.includes('--extract-only')){console.log(JSON.stringify({candidates:items.length}));process.exit(0);}
browserRun(async({evaluate})=>{
 const result=await evaluate(`(async()=>{const items=await (await fetch('/candidates')).json();const output=[];
 for(let start=0;start<items.length;start+=80){const page=items.slice(start,start+80),c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(page.length/10)*155;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
 for(let n=0;n<page.length;n++){const item=page[n],im=new Image();im.src=item.image;await im.decode();const col=n%10*120,row=Math.floor(n/10)*155;x.drawImage(im,col+10,row+5,100,115);x.fillStyle='#111';x.font='12px sans-serif';x.fillText('#'+item.candidate+' '+item.name.slice(0,12),col+3,row+135);x.fillText(item.type.slice(0,16),col+3,row+149);}output.push(c.toDataURL('image/png'));}return output;})()`);
 result.forEach((data,i)=>fs.writeFileSync('data/temp/artwork-review/contact-'+(i+1)+'.png',Buffer.from(data.split(',')[1],'base64')));
 console.log(JSON.stringify({candidates:items.length,contactSheets:result.length,output:'data/temp/artwork-review'}));
},{'/candidates':items}).catch(e=>{console.error(e);process.exitCode=1;});
