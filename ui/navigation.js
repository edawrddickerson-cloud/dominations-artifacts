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
