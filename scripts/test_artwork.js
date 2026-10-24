const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const matcher=require('../ui/artwork-matcher.js'),catalog=JSON.parse(fs.readFileSync('ui/data/artwork_catalog.json','utf8'));
const context={window:{},TextEncoder,Date};vm.createContext(context);
for(const file of ['data/artwork_ids.js','crafting-history.js','integration-core.js'])vm.runInContext(fs.readFileSync('ui/'+file,'utf8'),context);
const H=context.window.DNCraftingHistory,C=context.window.DNIntegrationCore,id=catalog.entries[0].id;
assert.equal(new Set(catalog.entries.map(e=>e.id)).size,catalog.entries.length);
for(const e of catalog.entries){assert.match(e.id,/^art-[a-f0-9]{16}$/);assert.ok(fs.existsSync('ui/assets/artwork/'+e.file));assert.equal('art-'+crypto.createHash('sha256').update(fs.readFileSync('ui/assets/artwork/'+e.file)).digest('hex').slice(0,16),e.id);for(const d of e.examples)assert.equal(d.length,24*24*3);}
const settings={'dn-profiles':JSON.stringify({activeId:'main',profiles:[{id:'main',name:'Main'}]})};
const records=[{id:'items',items:[]},{id:'collection:main',items:[{id:'copy-1',name:'',type:'Weapon',hall:'main',artworkId:id,image:'data:image/jpeg;base64,AAAA',artworkDescriptor:[1],rows:[{name:'Damage',value:1}]}]}];
const log=H.normalize({version:2,items:[{id:'encounter',artworkId:id,image:'private',rows:[]}]});
const w=C.createWorkspace(settings,records,log);assert.equal(w.artworkSchema,1);assert.equal(w.records[1].items[0].artworkId,id);assert.equal(w.craftingLog.items[0].artworkId,id);assert.equal(JSON.stringify(w).includes('base64'),false);assert.equal('artworkDescriptor' in w.records[1].items[0],false);assert.equal('image' in w.craftingLog.items[0],false);
const restored=H.preserveLocalDetails(w.craftingLog,log);assert.equal(restored.items[0].image,'private');assert.equal(restored.items[0].artworkId,id);
assert.throws(()=>C.validate({...w,records:[w.records[0],{...w.records[1],items:[{...w.records[1].items[0],artworkId:'https://evil.invalid'}]}]}));
assert.throws(()=>H.normalize({version:2,items:[{id:'x',artworkId:'art-0000000000000000',rows:[]}]}));
const blank=Array(24*24*3).fill(0);assert.equal(matcher.match(blank,catalog).artworkId,null);
const report={references:catalog.entries.length,examples:catalog.entries.reduce((n,e)=>n+e.examples.length,0),known:0,ambiguous:0};
for(const e of catalog.entries)for(const d of e.examples){const r=matcher.match(d,catalog);if(r.artworkId){assert.equal(r.artworkId,e.id,'reference may only select its own artwork');report.known++;}else report.ambiguous++;}
for(const e of catalog.entries)for(const d of e.examples)assert.equal(matcher.match(d,catalog,{excludeId:e.id}).artworkId,null,'artwork omitted from the reference set must remain unknown');
console.log('Artwork assets, ID-only serialization, local preservation and invalid-ID rejection passed. '+JSON.stringify(report));
