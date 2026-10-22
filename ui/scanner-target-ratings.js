/* Inline shared ratings only; target membership stays with Collection Targets. */
(() => {
  'use strict';
  const result=document.getElementById('scanner-result'),panel=document.getElementById('scanner-purpose-results');
  if(!result || !panel)return;
  let editing=false,editingTarget=null,editingProfile=null;
  const context=()=>window.DNScannerComparison?.scoringContext?.();
  function refresh() {
    const target=context();
    if(editingTarget!==(target?.id || null) || editingProfile!==window.DN.activeProfileId()){
      const wasEditing=editing;editing=false;
      if(wasEditing)window.DNScannerReading?.setInlineEditing(false);
    }
  }
  function stop() {editing=false;}
  function finish() {editing=false;window.DNScannerReading?.setInlineEditing(false);}
  const announce=()=>window.dispatchEvent(new CustomEvent('dn-scanner-target-edit-changed'));
  panel.addEventListener('click',event=>{
    const row=event.target.closest('[data-purpose-result]');if(!row)return;
    if(editing)finish();window.DNScannerComparison?.focusTarget(row.dataset.purposeResult);announce();
  });
  result.addEventListener('click',event=>{
    if(!event.target.closest('[data-target-edit]'))return;
    const target=context();
    if(editing)finish();
    else {
      editing=true;editingTarget=target?.id || null;editingProfile=window.DN.activeProfileId();
      if(target)window.DNScannerComparison.focusTarget(target.id);
      if(window.DNScannerReading?.setInlineEditing(true)===false)editing=false;
    }
    announce();
    (editing?result.querySelector('[data-inline-field="name"]'):result.querySelector('[data-target-edit]'))?.focus({preventScroll:true});
  });
  result.addEventListener('input',event=>{
    const input=event.target.closest('[data-target-rating-row]');if(!input)return;
    const target=context();
    if(!editing || !target || input.dataset.targetId!==target.id || editingProfile!==window.DN.activeProfileId())return;
    input.setCustomValidity('');
    const value=input.value.trim()===''?null:Number(input.value);
    if(!input.validity.valid || value!==null && (!Number.isInteger(value) || value<0 || value>10))return;
    try{window.DNCraftingPurposes.configure(target.id,{weights:{[input.dataset.perk]:value}});}
    catch(error){input.setCustomValidity(error.message);input.reportValidity();}
  });
  window.DNScannerTargetRatings={refresh,stopEditing:stop,isEditing(){refresh();return editing;}};
})();
