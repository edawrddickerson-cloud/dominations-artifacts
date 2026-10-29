/* Persistent application navigation and in-memory scanner capture owner. */
(() => {
  'use strict';
  let frame = document.getElementById('scanner-view');
  const main = document.querySelector('.app-shell-main');
  const directory = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
  // Capture the serving style before shell history adopts a content-page URL.
  // Static HTML previews keep .html; Workers' clean URLs stay extensionless.
  const cleanURLs = /^https?:$/.test(location.protocol) && !location.pathname.endsWith('.html');
  const pages = new Set(['ratings.html','artifacts.html','collection.html','totals.html','scanner.html','crafting-stats.html','storage-scanner.html','council.html','council-collection.html','council-ratings.html','config.html','privacy.html','crafting-statistics.html','research-planner.html']);
  let stream = null, nav = null, checking = false, restoring = null;
  let currentURL, currentIndex = 0;
  let header = null, headerObserver = null;
  let captureEnded = null;
  const headerButtons = {
    main: '#hall-main, #mode-main, #header-main',
    war: '#hall-war, #mode-war, #header-war',
    off: '#sort-off, #header-off',
    def: '#sort-def, #header-def',
  };
  function syncHeader() {
    if (!header) return;
    const source = frame.contentDocument.querySelector('.app-header');
    if (!source) return;
    for (const [key, selector] of Object.entries(headerButtons)) {
      const button = source.querySelector(selector), proxy = header.querySelector('[data-shell-filter="' + key + '"]');
      if (!button || !proxy) continue;
      proxy.setAttribute('aria-pressed', button.getAttribute('aria-pressed'));
      proxy.classList.toggle('is-active', button.getAttribute('aria-pressed') === 'true');
      proxy.disabled = button.disabled;
    }
    const select = source.querySelector('#profile-select'), proxy = header.querySelector('#profile-select');
    if (select && proxy) {
      if (proxy.innerHTML !== select.innerHTML) proxy.innerHTML = select.innerHTML;
      proxy.value = select.value;
      proxy.disabled = select.disabled;
    }
  }
  function mountHeader(child) {
    const source = child.document.querySelector('.app-header');
    if (!source) return;
    if (!header) {
      header = source.cloneNode(true);
      header.id = 'app-shell-header';
      for (const [key, selector] of Object.entries(headerButtons)) {
        const button = header.querySelector(selector);
        if (!button) continue;
        button.id = 'header-' + key;
        button.dataset.shellFilter = key;
        button.addEventListener('click', () => {
          frame.contentDocument.querySelector('.app-header')?.querySelector(selector)?.click();
          syncHeader();
        });
      }
      header.querySelector('#profile-select')?.addEventListener('change', event => {
        const select = frame.contentDocument.getElementById('profile-select');
        if (!select) return;
        select.value = event.target.value;
        select.dispatchEvent(new frame.contentWindow.Event('change', {bubbles: true}));
        syncHeader();
      });
      main.insertBefore(header, frame);
    }
    headerObserver?.disconnect();
    headerObserver = new MutationObserver(syncHeader);
    headerObserver.observe(source, {subtree: true, childList: true, attributes: true, characterData: true});
    syncHeader();
  }
  function pageURL(value) {
    const url = new URL(value, location.href);
    let file = url.pathname.slice(directory.length);
    if (!file.endsWith('.html')) file += '.html';
    if (url.origin !== location.origin || !url.pathname.startsWith(directory) || !pages.has(file)) return null;
    url.pathname = directory + (cleanURLs ? file.slice(0, -5) : file);
    return url;
  }
  function fileOf(url) {
    const file = url.pathname.split('/').pop();
    return file.endsWith('.html') ? file : file + '.html';
  }
  function isScanner(url) { return ['scanner.html','storage-scanner.html'].includes(fileOf(url)); }
  function connected() { return !!stream?.getVideoTracks().some(track => track.readyState === 'live'); }
  function updateCaptureIndicators() {
    const state = connected() ? 'connected' : 'disconnected';
    for (const link of nav?.querySelectorAll('a[href]') || []) {
      const url = pageURL(link.href);
      if (!url || !isScanner(url)) continue;
      let dot = link.querySelector('.scanner-connection-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'scanner-connection-dot';
        dot.setAttribute('aria-hidden', 'true');
        link.appendChild(dot);
      }
      link.dataset.captureStatus = state;
      const label = link.querySelector('.nav-text')?.textContent.trim() || link.textContent.trim();
      link.title = label + ': ' + (state === 'connected' ? 'Connected' : 'Disconnected');
      link.setAttribute('aria-label', link.title);
    }
  }
  function stop() {
    if (captureEnded) stream?.getVideoTracks().forEach(track => track.removeEventListener('ended', captureEnded));
    captureEnded = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    updateCaptureIndicators();
  }
  window.DNScannerSession = {
    current() { return stream?.getVideoTracks().some(track => track.readyState === 'live') ? stream : null; },
    retain(capture) {
      if (stream === capture) { updateCaptureIndicators(); return; }
      stop();stream = capture;
      captureEnded = () => { if (stream === capture && !connected()) stop(); };
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', captureEnded));
      updateCaptureIndicators();
    },
    capture(options) { return navigator.mediaDevices.getDisplayMedia(options); },
    stop, confirmProfile: false,
  };
  function setCollapsed(collapsed) {
    document.body.classList.toggle('nav-collapsed', collapsed);
    try { localStorage.setItem('dn-nav-collapsed', collapsed ? '1' : '0'); } catch { /* Navigation works without storage. */ }
    const button = nav?.querySelector('#nav-collapse-btn');
    if (!button) return;
    button.setAttribute('aria-expanded', String(!collapsed));
    button.title = collapsed ? 'Expand navigation' : 'Collapse navigation';
    button.innerHTML = '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      (collapsed ? 'M10 6l6 6-6 6M4 5v14' : 'M14 6l-6 6 6 6M20 5v14') +
      '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="nav-text">' + (collapsed ? 'Expand' : 'Collapse') + '</span>';
  }
  function updateNav(url) {
    for (const link of nav?.querySelectorAll('a[href]') || []) {
      const target = pageURL(link.href);
      if (target && fileOf(target) === fileOf(url)) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
  }
  function writeHistory(url, push) {
    history[push ? 'pushState' : 'replaceState']({dnShellIndex: currentIndex}, '', url.href);
    currentURL = url;
    updateNav(url);
  }
  function display(url) {
    const child = frame.contentWindow;
    if (child.location.origin === url.origin && child.location.pathname === url.pathname && child.location.search === url.search) {
      if (child.location.hash !== url.hash) {
        const oldURL = child.location.href;
        child.history.replaceState(child.history.state, '', url.href);
        child.dispatchEvent(new child.HashChangeEvent('hashchange', {oldURL, newURL: url.href}));
        child.document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
      }
    } else {
      // A fresh browsing context prevents browser Back from restoring an old
      // iframe document before the shell can resolve its unsaved-draft guard.
      const next = document.createElement('iframe');
      next.id = 'scanner-view';
      next.title = 'Main page';
      next.allow = 'display-capture';
      next.src = url.href;
      next.addEventListener('load', mounted);
      frame.replaceWith(next);
      frame = next;
    }
    frame.title = nav?.querySelector('[aria-current="page"]')?.textContent.trim() || 'Main page';
  }
  async function canLeave() {
    const child = frame.contentWindow;
    const editor = child.DNCraftingPurposeEditor || child.DNStrategyEditor;
    return editor?.canLeave ? await editor.canLeave() : true;
  }
  async function navigate(value) {
    const url = pageURL(value);
    if (!url || checking || url.href === currentURL.href) return false;
    checking = true;
    try {
      // Category tabs and in-page links retain their independent drafts.
      const samePage = url.pathname === currentURL.pathname && url.search === currentURL.search;
      if (!samePage && !await canLeave()) return false;
      currentIndex++;
      writeHistory(url, true);
      display(url);
      return true;
    } catch (err) {
      const child = frame.contentWindow;
      const error = child.document.getElementById('error');
      if (error) { error.textContent = err.message || 'Could not open page.'; error.hidden = false; }
      return false;
    } finally { checking = false; }
  }
  window.DNAppShell = {accepts: value => !!pageURL(value), navigate};
  function clicked(event) {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') || link.target && link.target !== '_self') return;
    if (!pageURL(link.href)) return;
    event.preventDefault();
    navigate(link.href);
  }
  document.addEventListener('click', clicked);
  const initial = pageURL(new URL(location.href).searchParams.get('page') || 'ratings.html') || pageURL('ratings.html');
  writeHistory(initial, false);
  try { setCollapsed(localStorage.getItem('dn-nav-collapsed') === '1'); } catch { setCollapsed(false); }
  function mounted(event) {
    if (event.target !== frame) return;
    const child = frame.contentWindow, url = pageURL(child.location.href);
    if (!url) {
      if (child.location.href !== 'about:blank') location.assign(child.location.href);
      return;
    }
    if (!nav) {
      const source = child.document.querySelector('.site-nav');
      if (!source) return;
      nav = source.cloneNode(true);
      // Canonical hrefs also cover open-in-new-tab and copied navigation links.
      for (const link of nav.querySelectorAll('a[href]')) {
        const target = pageURL(link.href);
        if (target && cleanURLs) link.setAttribute('href', target.pathname.slice(directory.length) + target.search + target.hash);
      }
      document.body.insertBefore(nav, main);
      nav.querySelector('#nav-collapse-btn')?.addEventListener('click', () => setCollapsed(!document.body.classList.contains('nav-collapsed')));
      setCollapsed(document.body.classList.contains('nav-collapsed'));
    }
    updateCaptureIndicators();
    document.title = child.document.title;
    mountHeader(child);
    frame.title = child.document.title;
    writeHistory(url, false);
    // Category tabs update their URL with replaceState. Mirror those changes
    // without adding a second browser-history entry for the iframe.
    const replace = child.history.replaceState.bind(child.history);
    child.history.replaceState = (...args) => {
      replace(...args);
      const next = pageURL(child.location.href);
      if (next) writeHistory(next, false);
    };
    child.addEventListener('hashchange', () => {
      const next = pageURL(child.location.href);
      if (next) writeHistory(next, false);
    });
  }
  window.addEventListener('popstate', async event => {
    if (restoring) { const resolve = restoring; restoring = null; resolve(); return; }
    const url = pageURL(location.href);
    if (!url) return;
    const nextIndex = event.state?.dnShellIndex ?? currentIndex - 1;
    const child = frame.contentWindow;
    const editor = child.DNCraftingPurposeEditor || child.DNStrategyEditor;
    const samePage = url.pathname === currentURL.pathname && url.search === currentURL.search;
    if (editor?.canLeave && !samePage && nextIndex !== currentIndex) {
      const delta = nextIndex - currentIndex;
      // Return to the current history entry while Save / Discard / Cancel is
      // open. Cancel must preserve both the URL and the forward/back stack.
      await new Promise(resolve => { restoring = resolve; history.go(-delta); });
      if (checking) return;
      checking = true;
      try {
        if (!await canLeave()) return;
        await new Promise(resolve => { restoring = resolve; history.go(delta); });
      } finally { checking = false; }
    }
    currentIndex = nextIndex;
    currentURL = url;
    updateNav(url);
    display(url);
  });
  window.addEventListener('pagehide', stop);
  display(initial);
})();
