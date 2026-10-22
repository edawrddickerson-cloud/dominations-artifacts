(async()=>{
  const checks={};
  const check=(name,condition)=>{checks[name]=!!condition;if(!condition)throw new Error(name);};
  async function wait(fn){const until=performance.now()+10000;while(!fn()){if(performance.now()>until)throw new Error('Navigation timeout');await new Promise(resolve=>setTimeout(resolve,25));}}
  await wait(()=>document.querySelector('.site-nav a .nav-icon svg'));
  const navigationDocument=window.parent.DNAppShell ? window.parent.document : document;
  const nav=navigationDocument.querySelector('.site-nav');
  check('every crafting scanner link has an icon',Array.from(nav.querySelectorAll('a[href]')).every(link=>link.querySelector('.nav-icon svg')));
  check('current page named Crafting Scanner',nav.querySelector('[aria-current="page"] .nav-text').textContent==='Crafting Scanner');
  check('scanner menu links request current HTML',Array.from(nav.querySelectorAll('a[href^="scanner.html"], a[href^="storage-scanner.html"]')).every(link=>new URL(link.href).searchParams.get('v')==='2'));
  check('ratings icons are distinct',nav.querySelector('[href="ratings.html"] svg').outerHTML!==nav.querySelector('[href="council-ratings.html"] svg').outerHTML);
  navigationDocument.getElementById('nav-collapse-btn').click();
  check('collapsed navigation retains icons',Array.from(nav.querySelectorAll('a[href] .nav-icon')).every(icon=>icon.getBoundingClientRect().width>0));
  navigationDocument.getElementById('nav-collapse-btn').click();
  const frame=document.createElement('iframe');
  frame.srcdoc=(await(await fetch('scanner.html')).text()).replace('<div id="header-profile" class="header-profile"></div>','').replace('>Crafting Scanner</a>','>Scanner</a>');
  document.body.append(frame);
  await wait(()=>frame.contentDocument?.querySelector('.site-nav a .nav-icon svg'));
  check('legacy scanner label corrected',frame.contentDocument.querySelector('[href^="scanner.html"] .nav-text').textContent==='Crafting Scanner');
  check('missing profile header does not prevent navigation icons',Array.from(frame.contentDocument.querySelectorAll('.site-nav a[href]')).every(link=>link.querySelector('.nav-icon svg')));
  frame.contentDocument.querySelector('[href^="scanner.html"]').click();
  await wait(()=>frame.contentWindow.location.pathname.endsWith('/scanner.html') && frame.contentDocument?.querySelector('.site-nav a .nav-icon svg'));
  check('clicking crafting scanner requests current page',new URL(frame.contentWindow.location.href).searchParams.get('v')==='2');
  check('destination retains the shared heading',frame.contentDocument.querySelector('h1').textContent==='DomiNations Artifacts');
  check('destination retains all sidebar icons',Array.from(frame.contentDocument.querySelectorAll('.site-nav a[href]')).every(link=>link.querySelector('.nav-icon svg')));
  check('destination retains profile selector at top',!!frame.contentDocument.querySelector('.top #profile-select'));
  frame.remove();return {passed:Object.values(checks).every(Boolean),ui:checks};
})()
