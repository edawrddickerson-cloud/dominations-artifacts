(async () => {
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const triggers = [...document.querySelectorAll('.perk-filter-btn,.strategy-comparison-picker>summary,.probability-perks>summary,.collection-slot-filter>summary')].filter(trigger=>trigger.getClientRects().length);
  const results = [];
  for (const trigger of triggers) {
    trigger.scrollIntoView({block:'nearest'});trigger.focus();trigger.click();await nextFrame();
    const panel=document.getElementById(trigger.getAttribute('aria-controls'));
    if(!panel){results.push({name:trigger.textContent,error:'No panel'});continue;}
    const b=panel.getBoundingClientRect(), inside=b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1;
    const checked=[...panel.querySelectorAll('input:checked')].map(input=>input.value);
    let searchRetention=true, searchDetails;
    const search=panel.querySelector('input[type="search"]'),option=panel.querySelector('input[type="checkbox"]');
    if(search&&option){
      const originalSearch=search.value,value=option.value,wasChecked=option.checked;
      if(!wasChecked){option.click();await nextFrame();}
      search.value='zzzz-no-perk-matches';search.dispatchEvent(new Event('input',{bubbles:true}));await nextFrame();
      const noMatches=!panel.querySelector('.ui-picker-empty')?.hidden;
      search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));await nextFrame();
      const restored=[...panel.querySelectorAll('input[type="checkbox"]')].find(input=>input.value===value);
      searchRetention=!!restored?.checked&&noMatches;
      searchDetails={noMatches,checked:restored?.checked};
      if(!wasChecked&&restored){restored.click();await nextFrame();}
      search.value=originalSearch;search.dispatchEvent(new Event('input',{bubbles:true}));await nextFrame();
    }
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await nextFrame();
    results.push({name:trigger.textContent.trim(),inside,closed:panel.parentElement.tagName==='DETAILS'?!panel.parentElement.open:panel.hidden,focus:document.activeElement===trigger,retained:JSON.stringify(checked)===JSON.stringify([...panel.querySelectorAll('input:checked')].map(input=>input.value)),searchRetention,searchDetails});
  }
  scrollTo(0,0);
  return results;
})();
