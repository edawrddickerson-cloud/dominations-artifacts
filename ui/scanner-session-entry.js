/* Keep the capture owner alive while the two scanner documents change. */
(() => {
  if (window.top !== window) return;
  window.DNShellRedirecting = true;
  const file = location.pathname.split('/').pop() || '';
  const cleanURLs = /^https?:$/.test(location.protocol) && !file.endsWith('.html');
  const host = new URL(cleanURLs ? 'scanner-session' : 'scanner-session.html', location.href);
  host.searchParams.set('v', '20261022-fixed-header');
  host.searchParams.set('page', location.pathname + location.search + location.hash);
  location.replace(host.href);
})();
