/* Keep the capture owner alive while the two scanner documents change. */
(() => {
  if (window.top !== window) return;
  const host = new URL('scanner-session.html', location.href);
  host.searchParams.set('page', location.pathname + location.search + location.hash);
  location.replace(host.href);
})();
