(async () => {
  const checks = [];
  const check = (name, ok) => { checks.push({name, passed:!!ok}); if (!ok) throw Error(name); };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(fn) { for (let i=0;i<150;i++) { const value=fn(); if(value)return value; await delay(40); } throw Error('Timed out waiting for scanner'); }
  await waitFor(() => document.getElementById('scanner-view'));
  const view = () => document.getElementById('scanner-view').contentWindow;
  const ready = path => waitFor(() => view().location.pathname.endsWith(path) && view().document.readyState === 'complete' && view().DNScannerProfile && view().document.getElementById('scanner-connect'));
  const click = id => view().document.getElementById(id).click();
  await ready('scanner.html');
  let requests = 0;
  const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=360;
  canvas.getContext('2d').fillRect(0,0,640,360);
  Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async options => {
    check('Screen sharing requests no audio', options.audio === false);
    requests++; return canvas.captureStream(5);
  }});
  click('scanner-connect');
  await waitFor(() => view().document.getElementById('scanner-video').srcObject);
  const first = DNScannerSession.current();
  check('Single profile starts without confirmation',requests===1 && !view().document.getElementById('scanner-profile-dialog'));
  view().document.querySelector('a[href^="storage-scanner.html"]').click();
  await ready('storage-scanner.html');
  await waitFor(() => view().document.getElementById('scanner-video')?.srcObject === first);
  check('Storage keeps the same live capture',requests===1 && first.getVideoTracks()[0].readyState==='live' && location.pathname.endsWith('storage-scanner.html'));
  view().document.querySelector('a[href^="scanner.html"]').click();
  await ready('scanner.html');
  await waitFor(() => view().document.getElementById('scanner-video')?.srcObject === first);
  check('Crafting resumes without permission or profile prompt',requests===1 && !view().document.getElementById('scanner-profile-dialog'));
  history.back();
  await ready('storage-scanner.html');
  await waitFor(() => view().document.getElementById('scanner-video')?.srcObject === first);
  check('Browser back retains capture',requests===1);
  click('scanner-stop');
  check('Stop ends the shared track',first.getVideoTracks()[0].readyState==='ended' && !DNScannerSession.current());
  const secondProfile = view().DN.addProfile('Second scanner profile');
  const beforeReload = view().document;
  view().location.reload();
  await waitFor(() => view().document !== beforeReload);
  await ready('storage-scanner.html');
  click('scanner-connect');
  let dialog = await waitFor(() => view().document.getElementById('scanner-profile-dialog'));
  check('Multiple profiles use the existing dialog theme',dialog.open && dialog.classList.contains('ratings-dialog') && requests===1);
  click('scanner-profile-cancel');
  await waitFor(() => !view().document.getElementById('scanner-profile-dialog'));
  check('Cancel does not start sharing',requests===1 && !view().document.getElementById('scanner-profile-dialog'));
  click('scanner-connect');
  const previousDocument = view().document;
  view().document.querySelector('#scanner-profile-options button').click();
  try { await waitFor(() => view().document !== previousDocument && view().DN?.activeProfileId() === secondProfile && view().document.getElementById('scanner-profile-dialog')); }
  catch(error) { throw Error(JSON.stringify({active:view().DN?.activeProfileId(),secondProfile,changed:view().document!==previousDocument,dialog:view().document.getElementById('scanner-profile-dialog')?.textContent,error:view().document.getElementById('scanner-profile-error')?.textContent,session:DNScannerSession.confirmProfile})); }
  check('Switching profile returns to confirmation',view().document.getElementById('scanner-profile-continue').textContent.includes('Second scanner profile') && requests===1);
  click('scanner-profile-continue');
  await waitFor(() => DNScannerSession.current());
  check('Continue starts scanning for the chosen profile',requests===2 && view().DN.activeProfileId()===secondProfile);
  click('scanner-stop');
  return {passed:checks.every(check=>check.passed),checks};
})()
