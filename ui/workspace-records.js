/* Lossless record projection for private synchronization. The browser's existing
 * workspace remains the local authority; these records contain no capture data. */
(() => {
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const identity=row=>JSON.stringify([row.kind,row.scope || '',row.key]);
  function jsonbBytes(value) {
    const json=JSON.stringify(value);let extra=0,quoted=false,escaped=false;
    for(let i=0;i<json.length;i++) {
      const char=json[i];
      if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}
      if(char===',' || char===':'){extra++;continue;}
      if(char==='-' || /[0-9]/.test(char)) {
        const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(json.slice(i))[0];
        if(/[eE]/.test(number)) {
          const [mantissa,exponent]=number.toLowerCase().split('e'),negative=mantissa.startsWith('-')?1:0;
          const unsigned=mantissa.slice(negative),digits=unsigned.replace('.','').length,fraction=unsigned.includes('.')?unsigned.length-unsigned.indexOf('.')-1:0;
          const point=digits-fraction+Number(exponent),expanded=negative+(point<=0?2-point+digits:point>=digits?point:digits+1);
          extra+=expanded-number.length;
        }
        i+=number.length-1;
      }
    }
    return new TextEncoder().encode(json).length+extra;
  }
  function rows(workspace) {
    const result=[],add=(kind,scope,key,position,data)=>result.push({kind,scope,key,position,data:copy(data)});
    const {settings,records,craftingLog,...root}=workspace;
    add('workspace','','root',0,root);
    for(const [key,value] of Object.entries(settings))add('setting','',key,0,value);
    records.forEach((record,position)=>{
      add('collection','',record.id,position,{id:record.id});
      record.items.forEach((item,index)=>add('inventory',record.id,item.id,index,item));
    });
    if(craftingLog) {
      const {items,ledger,...metadata}=craftingLog;
      const {archived,...ledgerMetadata}=ledger;
      add('log','','root',0,{...metadata,ledger:ledgerMetadata});
      items.forEach((item,index)=>add('craft','',item.id,index,item));
      archived.forEach((item,index)=>add('archive','',item.id,index,item));
    }
    return result;
  }
  function workspace(records) {
    const unique=new Map(),byKind=new Map(),positions=new Set();
    for(const row of records) {
      if(row.deleted)continue;
      if(!['workspace','setting','collection','inventory','log','craft','archive'].includes(row.kind) || typeof row.scope!=='string' || typeof row.key!=='string' || !row.key || row.kind!=='inventory' && row.scope!=='')throw Error('Invalid cloud record identity.');
      const id=identity(row);
      if(unique.has(id))throw Error('Duplicate cloud record.');
      if(!Number.isSafeInteger(row.position) || row.position<0)throw Error('Invalid cloud record order.');
      if(['collection','inventory','craft','archive'].includes(row.kind)) {
        const position=JSON.stringify([row.kind,row.scope,row.position]);
        if(positions.has(position))throw Error('Duplicate cloud record order.');positions.add(position);
        if(row.data?.id!==row.key)throw Error('Cloud record identity does not match its data.');
      }
      unique.set(id,row);
      if(!byKind.has(row.kind))byKind.set(row.kind,[]);byKind.get(row.kind).push(row);
    }
    const kind=name=>byKind.get(name) || [];
    const single=name=>{const values=kind(name);if(values.length>1 || values[0] && (values[0].scope!=='' || values[0].key!=='root'))throw Error('Invalid cloud metadata.');return values[0]?.data;};
    const ordered=values=>values.sort((a,b)=>a.position-b.position || identity(a).localeCompare(identity(b)));
    const root=single('workspace');if(!root)throw Error('Cloud workspace metadata is missing.');
    const containers=ordered(kind('collection'));
    const inventory=new Map(containers.map(row=>[row.key,[]]));
    for(const row of kind('inventory')){if(!inventory.has(row.scope))throw Error('Cloud collection is missing.');inventory.get(row.scope).push(row);}
    const value={...copy(root),settings:Object.fromEntries(kind('setting').map(row=>[row.key,copy(row.data)])),
      records:containers.map(row=>({id:row.key,items:ordered(inventory.get(row.key)).map(item=>copy(item.data))}))};
    const log=single('log');
    if(log)value.craftingLog={...copy(log),ledger:{...copy(log.ledger),archived:ordered(kind('archive')).map(row=>copy(row.data))},items:ordered(kind('craft')).map(row=>copy(row.data))};
    else if(kind('craft').length || kind('archive').length)throw Error('Cloud crafting metadata is missing.');
    return window.DNIntegrationCore.validate(value);
  }
  function changes(next,previous) {
    const before=new Map((previous || []).filter(row=>!row.deleted).map(row=>[identity(row),row])),result=[];
    for(const row of next) {
      const id=identity(row),prior=before.get(id);before.delete(id);
      if(!prior || row.position!==prior.position || window.DNIntegrationCore.canonical(row.data)!==window.DNIntegrationCore.canonical(prior.data))result.push(copy(row));
    }
    for(const row of before.values())result.push({kind:row.kind,scope:row.scope,key:row.key,position:row.position,data:null,deleted:true});
    return result;
  }
  window.DNWorkspaceRecords={rows,workspace,changes,identity,jsonbBytes};
})();
