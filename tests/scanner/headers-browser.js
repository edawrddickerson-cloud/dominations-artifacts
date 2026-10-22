(async()=>{
  const checks={},check=(name,value)=>{checks[name]=!!value;console.log(name+': '+!!value);if(!value)throw Error(name);};
  const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Timed out loading page');};
  let frame;
  let headerAppearance;
  for(const page of ['artifacts.html','collection.html','totals.html','ratings.html','config.html','council.html','council-collection.html','council-ratings.html','scanner.html','storage-scanner.html']) {
    frame?.remove();frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-2000px;width:1000px;height:800px';document.body.append(frame);
    const previous=frame.contentDocument;frame.src=page+'?header-test=1';
    try { await wait(()=>frame.contentDocument!==previous&&frame.contentWindow.DNPrimaryFilters&&frame.contentDocument.querySelector('#profile-select')); }
    catch(error) { throw Error(page+': '+frame.contentWindow.location.href+'; '+frame.contentDocument.readyState+'; profile='+!!frame.contentDocument.querySelector('#profile-select')+'; filters='+!!frame.contentWindow.DNPrimaryFilters); }
    const doc=frame.contentDocument,view=frame.contentWindow,header=doc.querySelector('.app-header');
    check(page+' has the common title and two primary filters',header.querySelector('h1').textContent==='DomiNations Artifacts'&&[...header.querySelectorAll('legend')].map(node=>node.textContent).join('|')==='Hall|Base Type'&&header.querySelectorAll('.seg-btn').length===4);
    check(page+' keeps only the profile selector in the title bar',header.querySelectorAll('select').length===1&&!!header.querySelector('#profile-select')&&!header.querySelector('.strategy-comparison-picker'));
    check(page+' has no strategy dropdown',!doc.querySelector('#strategy-select'));
    if(page==='scanner.html')check('Crafting scanner replaces the comparison menu with Scanner setup',!doc.querySelector('.strategy-comparison-picker')&&doc.querySelector('.scanner-header-controls > #scanner-setup'));
    if(['collection.html','storage-scanner.html'].includes(page))check(page+' uses the Collection Targets label',/^Collection Targets \(\d+\)$/.test(doc.querySelector('.strategy-comparison-picker summary')?.textContent));
    const appearance=JSON.stringify([header,header.querySelector('h1'),header.querySelector('.header-controls'),header.querySelector('#profile-select')].map(node=>{const css=view.getComputedStyle(node);return [css.fontSize,css.padding,css.gap,node.getBoundingClientRect().height];}));
    headerAppearance??=appearance;
    check(page+' matches the shared header appearance',appearance===headerAppearance);
    if(page==='artifacts.html')check('Artifact Rankings removes the strategy dropdown',!doc.querySelector('#strategy-select')&&doc.querySelector('.site-nav a[href="artifacts.html"]').textContent.trim()==='Artifact Rankings');
  }
  frame.remove();return {passed:true,checks};
})()
