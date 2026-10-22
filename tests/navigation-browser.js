(async()=>{
  const ui={},check=(name,passed)=>{ui[name]=!!passed;if(!passed)throw Error(name);};
  const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Navigation timeout: '+location.href);};
  const frame=()=>document.getElementById('scanner-view'),rootDocument=document;
  const view=()=>frame().contentWindow,doc=()=>frame().contentDocument;
  await wait(()=>document.querySelector('.site-nav [aria-current="page"]')&&doc().querySelector('#tbody tr'));
  const nav=document.querySelector('.site-nav'),firstLink=nav.querySelector('a'),collapse=nav.querySelector('#nav-collapse-btn');
  const header=document.getElementById('app-shell-header'),profilePicker=header.querySelector('#profile-select');
  const headerIdentity=()=>document.getElementById('app-shell-header')===header&&header.querySelector('#profile-select')===profilePicker;
  const sidebarIdentity=()=>document===rootDocument&&document.querySelector('.site-nav')===nav&&nav.querySelector('a')===firstLink;
  const readiness={
    'council.html':()=>doc().querySelector('#tbody tr'),
    'council-ratings.html':()=>doc().querySelector('input[data-layer="council"]'),
    'council-collection.html':()=>view().DNCouncil&&doc().getElementById('collection-list').children.length,
    'ratings.html':()=>doc().querySelector('[data-purpose-name]'),
    'config.html':()=>doc().querySelector('#profile-select'),
    'artifacts.html':()=>doc().querySelector('#tbody tr'),
    'collection.html':()=>view().DNStoredArtifacts,
    'totals.html':()=>view().DN,
    'scanner.html':()=>view().DNScannerReading&&doc().querySelector('#scanner-connect'),
    'storage-scanner.html':()=>view().DNScannerReading&&doc().querySelector('#scanner-connect'),
  };
  async function ready(page,previous) {
    await wait(()=>view().location.pathname.endsWith('/'+page)&&doc()!==previous&&doc().readyState==='complete'&&readiness[page]());
    await wait(()=>location.pathname.endsWith('/'+page)&&nav.querySelector('[aria-current="page"]')?.getAttribute('href').split('?')[0]===page);
  }
  async function open(page) {
    const previous=doc();nav.querySelector('a[href^="'+page+'"]').click();await ready(page,previous);
  }
  for(const page of ['council-ratings.html','council-collection.html','artifacts.html','collection.html','totals.html','config.html','ratings.html','scanner.html','storage-scanner.html','council.html']) {
    await open(page);
    check(page+' changes only the main document',sidebarIdentity());
    check(page+' has one visible sidebar',doc().documentElement.classList.contains('app-embedded')&&view().getComputedStyle(doc().querySelector('.site-nav')).display==='none');
    check(page+' keeps the same fixed header',headerIdentity()&&view().getComputedStyle(doc().querySelector('.app-header')).display==='none'&&frame().getBoundingClientRect().top===header.getBoundingClientRect().bottom);
    const sourceMain=doc().querySelector('#hall-main, #mode-main, #header-main'),sourceWar=doc().querySelector('#hall-war, #mode-war, #header-war');
    header.querySelector('#header-main').click();
    check(page+' header Hall control updates the main page',sourceMain.getAttribute('aria-pressed')==='true'&&header.querySelector('#header-main').getAttribute('aria-pressed')==='true');
    header.querySelector('#header-war').click();
    check(page+' header War control updates the main page',sourceWar.getAttribute('aria-pressed')==='true');
    const sourceOff=doc().querySelector('#sort-off, #header-off'),sourceDef=doc().querySelector('#sort-def, #header-def');
    if(sourceOff.getAttribute('aria-pressed')!=='true')header.querySelector('#header-off').click();
    if(sourceDef.getAttribute('aria-pressed')!=='true')header.querySelector('#header-def').click();
    header.querySelector('#header-def').click();
    check(page+' header Base Type control updates the main page',sourceDef.getAttribute('aria-pressed')==='false'&&header.querySelector('#header-def').getAttribute('aria-pressed')==='false');
    header.querySelector('#header-def').click();
  }
  const same=doc();nav.querySelector('[aria-current="page"]').click();await new Promise(r=>setTimeout(r,50));
  check('Clicking the current page does not reload it',doc()===same);
  const startWidth=nav.getBoundingClientRect().width;
  collapse.click();await new Promise(r=>setTimeout(r,220));
  await open('council-ratings.html');
  check('Collapsed sidebar stays mounted across navigation',sidebarIdentity()&&document.body.classList.contains('nav-collapsed')&&localStorage.getItem('dn-nav-collapsed')==='1');
  if(innerWidth>900)check('Collapsed sidebar releases space to the main page',nav.getBoundingClientRect().width<startWidth&&frame().getBoundingClientRect().left===nav.getBoundingClientRect().right);
  collapse.click();await new Promise(r=>setTimeout(r,220));
  if(nav.scrollHeight>nav.clientHeight){nav.scrollTop=30;const scroll=nav.scrollTop;await open('config.html');check('Sidebar scroll position survives navigation',nav.scrollTop===scroll);}
  await open('council.html');await open('council-ratings.html');
  let previous=doc();history.back();await ready('council.html',previous);
  check('Browser Back updates only the main page',sidebarIdentity());
  previous=doc();history.forward();await ready('council-ratings.html',previous);
  check('Browser Forward updates only the main page',sidebarIdentity());
  // Direct links in the page use the same persistent shell.
  await open('council.html');previous=doc();const statLink=doc().querySelector('.council-stat-link'),stat=new URL(statLink.href).searchParams.get('stat');statLink.click();await ready('council-ratings.html',previous);
  check('Stat links retain the shell and their query',sidebarIdentity()&&new URL(location.href).searchParams.get('stat')===stat&&doc().getElementById('ratings-q').value===stat);
  await open('ratings.html');
  const originalProfile=view().DN.activeProfileId();
  const headerBounds=header.getBoundingClientRect();view().scrollTo(0,350);
  check('Main header stays fixed while page content scrolls',view().scrollY>0&&header.getBoundingClientRect().top===headerBounds.top&&header.getBoundingClientRect().bottom===headerBounds.bottom);
  view().scrollTo(0,0);
  function editName(value){const field=doc().querySelector('[data-purpose-name]');field.value=value;field.dispatchEvent(new (view().Event)('input',{bubbles:true}));}
  const dialog=()=>doc().getElementById('target-unsaved-dialog');
  async function answer(action){dialog().querySelector('[value="'+action+'"]').click();await new Promise(r=>setTimeout(r,30));}
  editName('Persistent sidebar draft');previous=doc();nav.querySelector('[href="council.html"]').click();await wait(()=>dialog().open);
  check('Sidebar navigation uses the themed unsaved dialog',dialog().matches(':modal')&&sidebarIdentity()&&location.pathname.endsWith('/ratings.html')&&nav.querySelector('[aria-current="page"]').getAttribute('href')==='ratings.html');
  await answer('cancel');check('Cancel keeps the current page and draft',doc()===previous&&doc().querySelector('[data-purpose-name]').value==='Persistent sidebar draft');
  const unload=new (view().Event)('beforeunload',{cancelable:true});view().dispatchEvent(unload);check('Browser refresh and close retain the native draft warning',unload.defaultPrevented);
  // A profile change still prompts inside the main page.
  const second=view().DN.addProfile('Navigation profile'),select=doc().getElementById('profile-select');
  const option=doc().createElement('option');option.value=second;option.textContent='Navigation profile';select.append(option);
  await wait(()=>profilePicker.querySelector('option[value="'+second+'"]'));
  profilePicker.value=second;profilePicker.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>dialog().open);await answer('cancel');
  check('Cancelling a profile change keeps profile and draft',view().DN.activeProfileId()===originalProfile&&doc().querySelector('[data-purpose-name]').value==='Persistent sidebar draft');
  check('Fixed profile picker returns to the active profile on Cancel',profilePicker.value===originalProfile&&headerIdentity());
  nav.querySelector('[href="council.html"]').click();await wait(()=>dialog().open);await answer('discard');await ready('council.html',previous);
  check('Discard navigates while preserving the sidebar',sidebarIdentity());
  await open('ratings.html');editName('Saved by navigation');
  doc().querySelector('[data-purpose-selection="attack-heavy-infantry"]').click();previous=doc();
  nav.querySelector('[href="config.html"]').click();await wait(()=>dialog().open);await answer('save');await ready('config.html',previous);
  check('Save persists target changes before navigation',view().DNCraftingPurposes?.settings().customPurposes.some(p=>p.label==='Saved by navigation')||JSON.parse(view().DN.lsGet('dn-crafting-purposes')).customPurposes.some(p=>p.label==='Saved by navigation'));
  // Back/Forward must use the same dialog and retain the history stack on Cancel.
  previous=doc();history.back();await ready('ratings.html',previous);editName('Back button draft');previous=doc();history.back();await wait(()=>dialog().open);
  check('Browser Back shows the themed draft dialog at the current URL',location.pathname.endsWith('/ratings.html'));
  await answer('cancel');check('Cancelling Back preserves the page and URL',doc()===previous&&location.pathname.endsWith('/ratings.html'));
  history.back();await wait(()=>dialog().open);await answer('discard');await ready('council.html',previous);
  check('Discarding Back restores the correct history destination',sidebarIdentity());
  previous=doc();history.forward();await ready('ratings.html',previous);
  check('Forward still works after cancelling Back',sidebarIdentity());
  // Child reloads (including profile changes) never recreate the sidebar.
  profilePicker.value=second;previous=doc();profilePicker.dispatchEvent(new Event('change',{bubbles:true}));await ready('ratings.html',previous);
  check('Profile switching reloads only the main page',sidebarIdentity()&&view().DN.activeProfileId()===second);
  check('Profile switching keeps the header and selector mounted',headerIdentity()&&profilePicker.value===second);
  check('No horizontal page overflow',document.documentElement.scrollWidth<=innerWidth);
  check('Main frame fills the remaining height',frame().getBoundingClientRect().bottom<=innerHeight+1&&frame().getBoundingClientRect().height>0);
  return {passed:Object.values(ui).every(Boolean),ui};
})()
