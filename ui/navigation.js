(() => {
  "use strict";

  const LAST_PAGE_KEY = "dn-last-page";
  const pages = new Set([
    "army.html",
    "artifacts.html",
    "collection.html",
    "council.html",
    "council-collection.html",
    "ratings.html",
    "council-ratings.html",
    "config.html",
  ]);
  const file = location.pathname.split("/").pop() || "";

  if (!file || file === "index" || file === "index.html") {
    let destination = "army.html";
    try {
      const saved = localStorage.getItem(LAST_PAGE_KEY);
      if (pages.has(saved)) destination = saved;
    } catch {
      // Browsers with storage disabled still open the default page.
    }
    location.replace(destination + location.search + location.hash);
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
