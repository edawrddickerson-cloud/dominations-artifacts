/* In-memory capture owner. No frames or permissions are persisted. */
(() => {
  'use strict';
  const frame = document.getElementById('scanner-view');
  let stream = null;
  function scannerURL(value) {
    const url = new URL(value, location.href);
    const directory = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
    return url.origin === location.origin && [directory + 'scanner.html', directory + 'storage-scanner.html'].includes(url.pathname) ? url : null;
  }
  function stop() {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  }
  window.DNScannerSession = {
    current() { return stream?.getVideoTracks().some(track => track.readyState === 'live') ? stream : null; },
    retain(capture) { if (stream && stream !== capture) stop(); stream = capture; },
    capture(options) { return navigator.mediaDevices.getDisplayMedia(options); },
    stop,
    confirmProfile: false,
  };
  function navigate(url, push) {
    if (push) history.pushState(null, '', url);
    frame.src = url.href;
  }
  const initial = scannerURL(new URL(location.href).searchParams.get('page') || 'scanner.html') || new URL('scanner.html', location.href);
  history.replaceState(null, '', initial);
  navigate(initial, false);
  frame.addEventListener('load', () => {
    const child = frame.contentWindow;
    if (!scannerURL(child.location.href)) return;
    document.title = child.document.title;
    child.document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname === child.location.pathname && url.hash) return;
      event.preventDefault();
      const scanner = scannerURL(url);
      if (scanner) navigate(scanner, true);
      else location.assign(url.href);
    });
  });
  window.addEventListener('popstate', () => navigate(new URL(location.href), false));
  window.addEventListener('pagehide', stop);
})();
