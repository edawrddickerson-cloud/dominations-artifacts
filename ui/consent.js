/* Local consent controls remain available when analytics cannot load. */
(() => {
  'use strict';
  if(window.DNConsent)return;
  const C=window.DNIntegrationCore,config=window.DNServiceConfig,listeners=new Set();
  let preferences=C.consent(localStorage);
  function changed(next) {
    preferences=next;
    // Revoking consent must clear identifiers even if telemetry never loaded.
    for(const key of ['dn_telemetry_session','dn_telemetry_id'])try{localStorage.removeItem(key);}catch{}
    for(const listener of listeners)try{listener({...preferences})?.catch?.(()=>{});}catch{}
  }
  window.DNConsent={get:()=>({...preferences}),set(value){
    if((value.analytics || value.diagnostics || value.research || value.ocrFeedback) && !C.privacyReady(config))throw Error('Optional sharing is not available in this version.');
    if(value.research && !C.researchReady(config))throw Error('Research sharing is not available in this version.');
    if(value.ocrFeedback && !C.ocrFeedbackReady(config))throw Error('OCR feedback is not available in this version.');
    const next=C.setConsent(localStorage,value);changed(next);return next;
  },subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
  window.addEventListener('storage',e=>{if(e.key==='dn_service_consent')changed(C.consent(localStorage));});
})();
