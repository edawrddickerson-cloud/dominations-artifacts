/* Optional integration state, separate from planner records and auth tokens.
 * IndexedDB commits precede success messages. No uploads or scoring here. */
(() => {
  'use strict';
  let opening;
  function open() {
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('dn-service-state',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state',{keyPath:'id'});
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      request.onerror=()=>{opening=null;reject(request.error);};
      request.onblocked=()=>{opening=null;reject(Error('Close other planner tabs to update optional storage.'));};
    });
    return opening;
  }
  async function transaction(mode,run) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state',mode);let request;
      tx.oncomplete=()=>resolve(request?.result?.value ?? null);
      tx.onabort=tx.onerror=()=>reject(tx.error || Error('Optional data could not be saved.'));
      try {request=run(tx.objectStore('state'));}catch(error){tx.abort();reject(error);}
    });
  }
  async function list(prefix) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly'),request=tx.objectStore('state').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));
      tx.oncomplete=()=>resolve(request.result.map(record=>record.value));tx.onabort=tx.onerror=()=>reject(tx.error);
    });
  }
  window.DNServiceStore={get:id=>transaction('readonly',store=>store.get(id)),put:(id,value)=>transaction('readwrite',store=>store.put({id,value})),remove:id=>transaction('readwrite',store=>store.delete(id)),list,
    putMany:records=>transaction('readwrite',store=>{let request;for(const record of records)request=store.put(record);return request;}),
    removePrefix:prefix=>transaction('readwrite',store=>{const request=store.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};return request;})};
})();
