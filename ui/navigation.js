/* Authority: existing multi-page navigation and approved Phase 2 scanner.
 * Ownership: page routing only; scanner may be opened without starting capture.
 * Invariants: remembered page must belong to the allowlist; no capture permissions.
 * History: Army editor removed; crafting purposes and ratings are the default. */
(() => {
  "use strict";

  const LAST_PAGE_KEY = "dn-last-page";
  const pages = new Set([
    "army.html",
    "artifacts.html",
    "scanner.html",
    "crafting-stats.html",
    "storage-scanner.html",
    "collection.html",
    "totals.html",
    "council.html",
    "council-collection.html",
    "ratings.html",
    "council-ratings.html",
    "config.html",
  ]);
  const file = location.pathname.split("/").pop() || "";

  if (!file || file === "index" || file === "index.html") {
    let destination = "ratings.html";
    try {
      const saved = localStorage.getItem(LAST_PAGE_KEY);
      if (pages.has(saved)) destination = saved === 'army.html' ? 'ratings.html' : saved;
    } catch {
      // Browsers with storage disabled still open the default page.
    }
    const destinationUrl = new URL(destination + location.search + location.hash, location.href);
    if (destination === "scanner.html" || destination === "storage-scanner.html") {
      destinationUrl.searchParams.set("v", "2");
    }
    location.replace(destinationUrl.href);
    return;
  }

  // Workers may serve HTML pages using extensionless URLs.
  const page = file.endsWith(".html") ? file : file + ".html";
  if (!pages.has(page)) return;

  if (window.top === window && !window.DNShellRedirecting) {
    const openShell = () => {
      window.DNShellRedirecting = true;
      const host = new URL("scanner-session.html", location.href);
      host.searchParams.set("v", "20261022-fixed-header");
      host.searchParams.set("page", location.pathname + location.search + location.hash);
      location.replace(host.href);
    };
    // The OAuth callback is captured in memory before this script runs. Let
    // its original document finish the exchange before entering the shell.
    if (window.DNOAuthReturn) {
      document.addEventListener("DOMContentLoaded", async () => {
        await window.DNServicesReady;
        await window.DNCloud?.start();
        if (window.DNCloud?.user()) openShell();
      }, {once: true});
    } else {
      openShell();
      return;
    }
  }

  const shell = window.parent !== window && window.parent.DNAppShell;
  if (shell && window.frameElement?.id === "scanner-view") {
    document.documentElement.classList.add("app-embedded");
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = "app-shell.css?v=20261025-slate";
    document.head.appendChild(sheet);
    document.addEventListener("click", event => {
      const link = event.target.closest?.("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute("download") || link.target && link.target !== "_self") return;
      const url = new URL(link.href, location.href);
      if (!shell.accepts(url.href)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      shell.navigate(url.href);
    }, true);
  }

  function rememberPage() {
    try {
      localStorage.setItem(LAST_PAGE_KEY, page);
    } catch {
      // Page navigation remains available when storage is disabled.
    }
  }

  rememberPage();
  window.addEventListener("pageshow", rememberPage);
})();
