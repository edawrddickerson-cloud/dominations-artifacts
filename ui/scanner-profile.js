/* Use the site's existing dialog theme before starting a new scan. */
(() => {
  'use strict';
  const session = window.parent !== window ? window.parent.DNScannerSession : null;
  const resumeKey = 'dn-scanner-confirm-profile';
  function confirm(start) {
    const state = window.DN?.ensureProfiles();
    if (!state || state.profiles.length < 2) { start(); return; }
    if (document.getElementById('scanner-profile-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'scanner-profile-dialog';
    dialog.className = 'ratings-dialog uncollect-dialog';
    dialog.setAttribute('aria-labelledby', 'scanner-profile-title');
    dialog.innerHTML = '<div class="ratings-form"><div class="ratings-header"><h2 id="scanner-profile-title">Confirm scanning profile</h2><p class="ratings-hint">Choose which profile you are scanning for.</p></div><div class="ratings-list"><button type="button" class="btn" id="scanner-profile-continue"></button><p class="ratings-hint">Or switch profile:</p><div id="scanner-profile-options" class="ratings-list"></div><p id="scanner-profile-error" role="alert"></p></div><div class="ratings-footer"><button type="button" class="btn" id="scanner-profile-cancel">Cancel</button></div></div>';
    const active = state.profiles.find(profile => profile.id === state.activeId);
    const next = dialog.querySelector('#scanner-profile-continue');
    next.textContent = `Continue with ${active.name} profile`;
    next.addEventListener('click', () => { dialog.close(); start(); });
    dialog.querySelector('#scanner-profile-cancel').addEventListener('click', () => dialog.close());
    for (const profile of state.profiles.filter(profile => profile.id !== state.activeId)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn'; button.textContent = profile.name;
      button.addEventListener('click', () => {
        try {
          if (!window.DN.setActiveProfile(profile.id)) throw new Error('Profile could not be changed.');
          if (session) session.confirmProfile = true;
          else sessionStorage.setItem(resumeKey, '1');
          location.reload();
        } catch (error) { dialog.querySelector('#scanner-profile-error').textContent = error.message; }
      });
      dialog.querySelector('#scanner-profile-options').append(button);
    }
    dialog.addEventListener('close', () => { dialog.remove(); document.getElementById('scanner-connect')?.focus(); });
    document.body.append(dialog);
    dialog.showModal();
    next.focus();
  }
  window.DNScannerProfile = { confirm };
  let resume = session?.confirmProfile;
  if (session) session.confirmProfile = false;
  try { resume ||= sessionStorage.getItem(resumeKey) === '1'; sessionStorage.removeItem(resumeKey); } catch { /* Storage may be unavailable. */ }
  window.DNScannerProfile.resume = !!resume;
})();
