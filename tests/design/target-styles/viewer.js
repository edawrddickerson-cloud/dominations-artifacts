/* Static DOM snapshots: no application scripts, storage writes, account or capture access. */
(() => {
  const descriptions = {
    current:'Current design baseline',
    bronze:'Warm charcoal · bronze edges · framed panels',
    slate:'Cool graphite · softer gold · flat panels',
    workbench:'Compact spacing · wider workspace · more visible ratings',
  };
  const initial = new URLSearchParams(location.search).get('style');
  let style = Object.hasOwn(descriptions, initial) ? initial : 'bronze';
  const frame=document.getElementById('preview'),category=document.getElementById('category'),viewport=document.getElementById('viewport');
  function resize(){
    const width=Number(viewport.value),height=width<600?844:1000;
    const available=document.querySelector('.study-stage').clientWidth-32,scale=Math.min(1,available/width);
    frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform='scale('+scale+')';
    const box=document.getElementById('preview-size');box.style.width=width*scale+'px';box.style.height=height*scale+'px';
  }
  function theme(){
    const shell=frame.contentDocument,content=shell?.getElementById('scanner-view')?.contentDocument;
    for(const doc of [shell,content])if(doc?.documentElement)doc.documentElement.dataset.targetStyle=style;
    document.querySelectorAll('[data-style]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.style===style)));
    document.getElementById('style-description').textContent=descriptions[style];
  }
  frame.addEventListener('load',()=>{
    theme();
    const child=frame.contentDocument.getElementById('scanner-view');
    const wire=()=>{
      theme();
      const doc=child.contentDocument;
      doc.addEventListener('click',event=>{
        const tab=event.target.closest('[data-crafting-tab]');
        if(tab){category.value=tab.dataset.craftingTab;frame.src='shell-'+category.value+'.html';}
        if(event.target.closest('a,button'))event.preventDefault();
      });
    };
    if(child.contentDocument?.readyState==='complete')wire();else child.addEventListener('load',wire,{once:true});
    frame.contentDocument.addEventListener('click',event=>{if(event.target.closest('a,button'))event.preventDefault();});
  });
  document.querySelectorAll('[data-style]').forEach(button=>button.addEventListener('click',()=>{style=button.dataset.style;theme();}));
  category.addEventListener('change',()=>{frame.src='shell-'+category.value+'.html';});
  viewport.addEventListener('change',resize);addEventListener('resize',resize);
  resize();theme();
})();
