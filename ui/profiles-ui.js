(() => {
  "use strict";

  const DN = window.DN;
  if (!DN) return;

  const NAV_COLLAPSED_KEY = "dn-nav-collapsed";

  const ICONS = {
    profile:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M5 19.5c1.5-3.2 4-4.8 7-4.8s5.5 1.6 7 4.8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    army:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-2.8 7.8-7 9-4.2-1.2-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M12 8v5M10 11h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    artifactsPriority:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h10M5 12h14M5 18h8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M17 15l2 2 3-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    artifactsCollection:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-3 8 3-8 3-8-3z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M4 12l8 3 8-3M4 16l8 3 8-3" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>',
    councilPriority:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M7 20v-1.5c0-2 2-3.5 5-3.5s5 1.5 5 3.5V20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M17.5 7.5l1.2-.4.4-1.2.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4z" fill="currentColor"/></svg>',
    councilCollection:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="14.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 19c.7-1.8 2.1-2.8 4.2-2.8M16 16.2c2.1 0 3.5 1 4.2 2.8M9.2 19c.5-1.2 1.4-1.9 2.8-1.9s2.3.7 2.8 1.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    ratings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V6M4 18h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M8 14v4M12 10v8M16 7v11" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    collapse:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 5v14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 5v14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  };

  function iconForHref(href) {
    const file = (href || "").split("/").pop() || "";
    if (file === "army.html") return ICONS.army;
    if (file === "index.html") return ICONS.artifactsPriority;
    if (file === "collection.html") return ICONS.artifactsCollection;
    if (file === "council.html") return ICONS.councilPriority;
    if (file === "council-collection.html") return ICONS.councilCollection;
    if (file === "config.html") return ICONS.settings;
    if (file === "ratings.html") return ICONS.ratings;
    if (file === "council-ratings.html") return ICONS.ratings;
    return ICONS.artifactsPriority;
  }

  function titleForHref(href, fallback) {
    const file = (href || "").split("/").pop() || "";
    if (file === "army.html") return "Army loadout";
    if (file === "index.html") return "Artifacts priority";
    if (file === "collection.html") return "Artifacts collection";
    if (file === "council.html") return "Council priority";
    if (file === "council-collection.html") return "Council collection";
    if (file === "config.html") return "Profiles";
    if (file === "ratings.html") return "Perk ratings";
    if (file === "council-ratings.html") return "Council stat ratings";
    return fallback || file;
  }

  function loadCollapsed() {
    try {
      return localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function saveCollapsed(on) {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function setCollapsed(on) {
    document.body.classList.toggle("nav-collapsed", !!on);
    const btn = document.getElementById("nav-collapse-btn");
    if (btn) {
      btn.setAttribute("aria-expanded", on ? "false" : "true");
      btn.title = on ? "Expand navigation" : "Collapse navigation";
      btn.innerHTML =
        `<span class="nav-icon" aria-hidden="true">${on ? ICONS.expand : ICONS.collapse}</span>` +
        `<span class="nav-text">${on ? "Expand" : "Collapse"}</span>`;
    }
    saveCollapsed(!!on);
  }

  function decorateLinks(nav) {
    for (const a of nav.querySelectorAll("a[href]")) {
      if (a.dataset.navDecorated === "1") continue;
      a.dataset.navDecorated = "1";
      const label = (a.textContent || "").trim();
      const href = a.getAttribute("href") || "";
      a.classList.add("nav-link");
      a.title = titleForHref(href, label);
      a.innerHTML =
        `<span class="nav-icon">${iconForHref(href)}</span>` +
        `<span class="nav-text">${DN.esc(label)}</span>`;
    }
  }

  function ensureSettingsNav(nav) {
    const file = (location.pathname || "").split("/").pop() || "";
    let section = nav.querySelector(".site-nav-section[data-nav-settings]");
    if (!section) {
      const configLink = nav.querySelector('a[href="config.html"]');
      section = configLink ? configLink.closest(".site-nav-section") : null;
    }
    if (!section) {
      section = document.createElement("div");
      section.className = "site-nav-section";
      section.innerHTML = `<h2 class="site-nav-label">Settings</h2>`;
      nav.appendChild(section);
    }
    section.dataset.navSettings = "1";

    function ensureLink(href, label) {
      if (section.querySelector(`a[href="${href}"]`)) return;
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (file === href) a.setAttribute("aria-current", "page");
      section.appendChild(a);
    }

    ensureLink("config.html", "Profiles");
    ensureLink("ratings.html", "Perk ratings");
    ensureLink("council-ratings.html", "Council ratings");
  }

  function mountNav() {
    const nav = document.querySelector(".site-nav");
    if (!nav || nav.dataset.profilesMounted === "1") return;
    nav.dataset.profilesMounted = "1";
    if (!nav.id) nav.id = "site-nav";

    const state = DN.ensureProfiles();
    ensureSettingsNav(nav);

    const toggleWrap = document.createElement("div");
    toggleWrap.className = "site-nav-toggle-wrap";
    toggleWrap.innerHTML =
      `<button type="button" class="nav-link site-nav-toggle" id="nav-collapse-btn" aria-controls="site-nav" aria-expanded="true" title="Collapse navigation"></button>`;

    const head = document.createElement("div");
    head.className = "site-nav-section site-nav-profiles";
    head.innerHTML =
      `<h2 class="site-nav-label">Profile</h2>` +
      `<label class="site-nav-profile-label">` +
      `<span class="nav-icon site-nav-profile-icon" aria-hidden="true">${ICONS.profile}</span>` +
      `<span class="visually-hidden">Active profile</span>` +
      `<select id="profile-select" class="site-nav-profile-select" aria-label="Active profile"></select>` +
      `</label>` +
      `<button type="button" class="nav-link site-nav-profile-collapsed-btn" id="profile-collapsed-btn" title="Active profile" hidden>` +
      `<span class="nav-icon" aria-hidden="true">${ICONS.profile}</span>` +
      `<span class="nav-text">Profile</span>` +
      `</button>`;

    nav.insertBefore(toggleWrap, nav.firstChild);
    nav.insertBefore(head, toggleWrap.nextSibling);

    decorateLinks(nav);

    const select = /** @type {HTMLSelectElement} */ (head.querySelector("#profile-select"));
    fillSelect(select, state);

    select.addEventListener("change", () => {
      const id = select.value;
      if (!id || id === DN.activeProfileId()) return;
      if (DN.setActiveProfile(id)) location.reload();
    });

    const collapseBtn = document.getElementById("nav-collapse-btn");
    collapseBtn.addEventListener("click", () => {
      setCollapsed(!document.body.classList.contains("nav-collapsed"));
    });

    // Collapsed: show active profile only; expand nav so the picker can be used.
    // Profile edit stays in Settings → Profiles.
    head.querySelector("#profile-collapsed-btn").addEventListener("click", () => {
      setCollapsed(false);
      select.focus();
    });

    setCollapsed(loadCollapsed());
  }

  function fillSelect(select, state) {
    const s = state || DN.ensureProfiles();
    select.innerHTML = s.profiles
      .map(
        (p) =>
          `<option value="${DN.esc(p.id)}"${p.id === s.activeId ? " selected" : ""}>${DN.esc(p.name)}</option>`
      )
      .join("");
    const collapsedBtn = document.getElementById("profile-collapsed-btn");
    if (collapsedBtn) {
      const active = s.profiles.find((p) => p.id === s.activeId) || s.profiles[0];
      collapsedBtn.title = active ? `Profile: ${active.name}` : "Active profile";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountNav);
  } else {
    mountNav();
  }
})();
