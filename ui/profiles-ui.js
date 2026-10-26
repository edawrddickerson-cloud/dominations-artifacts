(() => {
  "use strict";

  const DN = window.DN;
  if (!DN) return;

  const strategyStyles = document.createElement('link');
  strategyStyles.rel = 'stylesheet';
  strategyStyles.href = 'strategies.css?v=20261025-slate';
  document.head.appendChild(strategyStyles);

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
    councilRatings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M2.5 18v-1c0-3 2-5 5.5-5 1.6 0 2.9.4 3.8 1.2M16 10v9M20 6v13M12 16v3" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    collapse:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 5v14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 5v14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  };

  function fileForHref(href) {
    return (href || "").split(/[?#]/)[0].split("/").pop() || "";
  }

  function iconForHref(href) {
    const file = fileForHref(href);
    if (file === "army.html") return ICONS.army;
    if (file === "artifacts.html") return ICONS.artifactsPriority;
    if (file === "collection.html") return ICONS.artifactsCollection;
    if (file === "totals.html") return ICONS.ratings;
    if (file === "council.html") return ICONS.councilPriority;
    if (file === "council-collection.html") return ICONS.councilCollection;
    if (file === "config.html") return ICONS.settings;
    if (file === "ratings.html") return ICONS.ratings;
    if (file === "council-ratings.html") return ICONS.councilRatings;
    return ICONS.artifactsPriority;
  }

  function titleForHref(href, fallback) {
    const file = fileForHref(href);
    if (file === "army.html") return "Army Loadout";
    if (file === "artifacts.html") return "Artifact Rankings";
    if (file === "collection.html") return "Crafted Collection";
    if (file === "totals.html") return "Active Artifact Totals";
    if (file === "scanner.html") return "Crafting Scanner";
    if (file === "crafting-stats.html") return "Crafting Stats";
    if (file === "storage-scanner.html") return "Storage Scanner";
    if (file === "council.html") return "Council Rankings";
    if (file === "council-collection.html") return "Council Collection";
    if (file === "config.html") return "Profiles";
    if (file === "ratings.html") return "Collection Targets";
    if (file === "council-ratings.html") return "Council Stat Ratings";
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
      const href = a.getAttribute("href") || "";
      const label = ["scanner.html", "storage-scanner.html"].includes(fileForHref(href))
        ? titleForHref(href) : (a.textContent || "").trim();
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
    for(const link of nav.querySelectorAll('a[href]'))if(['privacy','privacy.html'].includes(fileForHref(link.getAttribute('href'))))link.remove();
    ensureLink("crafting-statistics.html", "Statistics Methods");
  }

  function ensureCouncilNav(nav) {
    const councilLink = nav.querySelector('a[href="council.html"]');
    const section = councilLink?.closest(".site-nav-section");
    if (!section) return;
    let link = nav.querySelector('a[href="council-ratings.html"]');
    if (!link) {
      link = document.createElement("a");
      link.href = "council-ratings.html";
      link.textContent = "Council Ratings";
    }
    if (fileForHref(location.pathname) === "council-ratings.html") {
      link.setAttribute("aria-current", "page");
    }
    section.appendChild(link);
  }

  function ensureTargetsNav(nav) {
    let section = nav.querySelector("[data-nav-targets]");
    if (!section) {
      section = document.createElement("div");
      section.className = "site-nav-section";
      section.dataset.navTargets = "1";
      section.innerHTML = '<h2 class="site-nav-label">Planning</h2>';
    }
    let link = nav.querySelector('a[href="ratings.html"]');
    if (!link) {
      link = document.createElement("a");
      link.href = "ratings.html";
      link.textContent = "Collection Targets";
      if (fileForHref(location.pathname) === "ratings.html") link.setAttribute("aria-current", "page");
    }
    section.appendChild(link);
    const rankings=nav.querySelector('a[href="artifacts.html"]');
    if(rankings)section.appendChild(rankings);
    nav.insertBefore(section, nav.firstChild);
  }

  function mountNav() {
    const nav = document.querySelector(".site-nav");
    if (!nav || nav.dataset.profilesMounted === "1") return;
    nav.dataset.profilesMounted = "1";
    if (!nav.id) nav.id = "site-nav";

    const state = DN.ensureProfiles();
    ensureSettingsNav(nav);
    ensureCouncilNav(nav);
    ensureTargetsNav(nav);
    if(!nav.querySelector('a[href="crafting-stats.html"]')){
      const link=document.createElement('a');link.href='crafting-stats.html';link.textContent='Crafting Stats';
      if(fileForHref(location.pathname)==='crafting-stats.html')link.setAttribute('aria-current','page');
      const scanner=nav.querySelector('a[href^="storage-scanner.html"]');
      if(scanner)scanner.after(link);
    }
    const storageScanner=nav.querySelector('a[href^="storage-scanner.html"]');
    const totals=nav.querySelector('a[href="totals.html"]');
    const craftingStats=nav.querySelector('a[href="crafting-stats.html"]');
    if(storageScanner && totals)storageScanner.after(totals);
    if(craftingStats && (totals || storageScanner))(totals || storageScanner).after(craftingStats);

    const toggleWrap = document.createElement("div");
    toggleWrap.className = "site-nav-toggle-wrap";
    toggleWrap.innerHTML =
      `<button type="button" class="nav-link site-nav-toggle" id="nav-collapse-btn" aria-controls="site-nav" aria-expanded="true" title="Collapse navigation"></button>`;

    const head = document.createElement("div");
    head.className = "header-profile-picker";
    head.innerHTML =
      `<span class="filter-label">Profile</span>` +
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
    (document.getElementById("header-profile") || nav).appendChild(head);

    decorateLinks(nav);

    const select = /** @type {HTMLSelectElement} */ (head.querySelector("#profile-select"));
    fillSelect(select, state);

    select.addEventListener("change", async () => {
      const id = select.value;
      if (!id || id === DN.activeProfileId()) return;
      const editor = window.DNCraftingPurposeEditor || window.DNStrategyEditor;
      if (editor?.canLeave) {
        select.value = DN.activeProfileId();
        if (!await editor.canLeave()) return;
      }
      try { if (DN.setActiveProfile(id)) location.reload(); }
      catch (err) { showStrategyError(err); select.value = DN.activeProfileId(); }
    });

    const collapseBtn = document.getElementById("nav-collapse-btn");
    collapseBtn.addEventListener("click", () => {
      setCollapsed(!document.body.classList.contains("nav-collapsed"));
    });

    mountPrimaryFilters();
    mountStrategies();
    setCollapsed(loadCollapsed());
  }

  function showStrategyError(err) {
    let node = document.getElementById('strategy-storage-error');
    if (!node) {
      node = document.createElement('p'); node.id = 'strategy-storage-error'; node.className = 'error'; node.setAttribute('role', 'alert');
      (document.querySelector('.app-main') || document.body).appendChild(node);
    }
    node.textContent = `Your strategy change could not be saved. ${err?.message || err}`;
  }

  function mountStrategies() {
    if (!DN.loadStrategies) return;
    const file = fileForHref(location.pathname).replace(/^(army|artifacts|collection|totals|ratings|scanner|storage-scanner)$/, '$1.html');
    if (file === 'artifacts.html') return;
    if (!['artifacts.html', 'collection.html', 'scanner.html', 'storage-scanner.html'].includes(file)) return;
    const header = document.querySelector('.app-header');
    if (!header) return;
    const filters=file==='collection.html'?document.querySelector('.collection-controls .filter-main'):null;
    const parent = filters || document.createElement('div');
    if(!filters){parent.className = 'page-strategy-controls';parent.setAttribute('aria-label', 'Collection targets');header.after(parent);}
    if(file==='scanner.html') {
      parent.classList.add('scanner-header-controls');
      parent.setAttribute('aria-label','Scanner controls');
      const setup=document.getElementById('scanner-setup');
      if(setup)parent.appendChild(setup);
      return;
    }
    let comparison;
    if (['artifacts.html', 'collection.html', 'scanner.html', 'storage-scanner.html'].includes(file)) {
      comparison = document.createElement('details'); comparison.className = 'strategy-comparison-picker';
      comparison.innerHTML = '<summary>Collection Targets</summary><div class="strategy-comparison-options"></div>';
      if(filters)parent.insertBefore(comparison,filters.querySelector('#collection-list-toolbar'));else parent.appendChild(comparison);
      comparison.addEventListener('change', ev => {
        if (!ev.target.matches('[data-compare-strategy]')) return;
        const selected = [...comparison.querySelectorAll('[data-compare-strategy]:checked')].map(input => input.value);
        try { DN.setComparisonStrategyIds(selected); }
        catch (err) { showStrategyError(err); refresh(); }
      });
    }
    function refresh() {
      try {
        const state = DN.loadStrategies();
        const strategies = state.strategies.filter(s => !s.archived);
        if (comparison) {
          const ids = state.comparisonIds || [];
          comparison.querySelector('summary').textContent = `Collection Targets (${ids.length})`;
          comparison.querySelector('.strategy-comparison-options').innerHTML = strategies.map(s => `<label${filters?' class="perk-check"':''}><input type="checkbox" data-compare-strategy value="${DN.esc(s.id)}"${ids.includes(s.id) ? ' checked' : ''}/> ${DN.esc(s.name)}${s.id === state.activeId ? ' (active)' : ''}</label>`).join('');
        }
      } catch (err) { showStrategyError(err); }
    }
    for (const event of ['dn-strategies-changed','focus','storage']) window.addEventListener(event, refresh);
    refresh();
  }

  function mountPrimaryFilters() {
    const main = document.querySelector("#hall-main, #mode-main, #header-main");
    const war = document.querySelector("#hall-war, #mode-war, #header-war");
    const off = document.querySelector("#sort-off, #header-off");
    const def = document.querySelector("#sort-def, #header-def");
    if (!main || !war) return;

    const key = `dn-primary-filters:${DN.activeProfileId()}`;
    function readObject(storageKey) {
      try { return JSON.parse(DN.lsGet(storageKey) || "{}"); } catch { return {}; }
    }
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* use existing preferences */ }
    const legacyAxes = readObject("dn-artifact-pref-sort-axes");
    const state = saved || {
      hall: DN.lsGet("dn-artifact-hall-filter") === "Main" ? "Main" : "War",
      offensive: legacyAxes.offensive !== false,
      defensive: legacyAxes.defensive !== false,
    };
    if (!state.offensive && !state.defensive) state.offensive = state.defensive = true;
    function hallAxes(value, fallback) {
      const axes = value && typeof value === 'object' ? value : fallback;
      const offensive = axes.offensive !== false, defensive = axes.defensive !== false;
      return offensive || defensive ? { offensive, defensive } : { offensive: true, defensive: true };
    }
    state.axesByHall = Object.fromEntries(['Main', 'War'].map(hall =>
      [hall, hallAxes(state.axesByHall?.[hall], state)]));
    Object.assign(state, state.axesByHall[state.hall]);
    function selectHall(value) {
      state.axesByHall[state.hall] = { offensive: state.offensive, defensive: state.defensive };
      state.hall = String(value).toLowerCase() === 'war' ? 'War' : 'Main';
      Object.assign(state, state.axesByHall[state.hall]);
    }
    function persist() {
      state.axesByHall[state.hall] = { offensive: state.offensive, defensive: state.defensive };
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage unavailable */ }
      DN.lsSet("dn-artifact-hall-filter", state.hall);
      DN.lsSet("dn-artifact-collection-ui", JSON.stringify({ ...readObject("dn-artifact-collection-ui"), hall: state.hall }));
      DN.lsSet("dn-council-ui", JSON.stringify({ ...readObject("dn-council-ui"), mode: state.hall.toLowerCase() }));
      const axes = JSON.stringify({ offensive: state.offensive, defensive: state.defensive });
      DN.lsSet("dn-artifact-pref-sort-axes", axes);
      DN.lsSet("dn-council-pref-sort-axes", axes);
    }
    persist();
    function sync(notifyScanner=true) {
      for (const [button, active] of [[main, state.hall === "Main"], [war, state.hall === "War"], [off, state.offensive], [def, state.defensive]]) {
        if (!button) continue;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }
      const hall=document.getElementById('scanner-hall');
      if(hall) {
        const next=state.hall.toLowerCase(),changed=hall.value!==next;
        hall.value=next;
        if(changed && notifyScanner)hall.dispatchEvent(new Event('change',{bubbles:true}));
      }
      for(const [id,active] of [['scanner-off',state.offensive],['scanner-def',state.defensive]]) {
        const input=document.getElementById(id);if(!input)continue;
        const changed=input.checked!==active;input.checked=active;
        if(changed && notifyScanner)input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    sync(false);
    window.DNPrimaryFilters={setHall(value){selectHall(value);persist();sync(false);}};
    const scannerHall=document.getElementById('scanner-hall');
    if(scannerHall) {
      scannerHall.addEventListener('change',()=>window.DNPrimaryFilters.setHall(scannerHall.value));
      for(const event of ['focus','storage'])window.addEventListener(event,()=>{
        let current;try {current=JSON.parse(localStorage.getItem(key) || 'null');}catch{return;}
        if(!current)return;
        state.hall=current.hall==='Main'?'Main':'War';state.offensive=current.offensive!==false;state.defensive=current.defensive!==false;
        if(!state.offensive && !state.defensive)state.offensive=state.defensive=true;
        state.axesByHall = Object.fromEntries(['Main', 'War'].map(hall =>
          [hall, hallAxes(current.axesByHall?.[hall], state)]));
        Object.assign(state, state.axesByHall[state.hall]);
        sync();
      });
    }
    for (const [button, hall] of [[main, "Main"], [war, "War"]]) {
      button.addEventListener("click", () => {
        selectHall(hall);
        persist();
        sync();
      }, true);
    }
    for (const [button, axis, other] of [[off, "offensive", "defensive"], [def, "defensive", "offensive"]]) {
      if (!button) continue;
      button.addEventListener("click", () => {
        if (state[axis] && !state[other]) return;
        state[axis] = !state[axis];
        persist();
        sync();
      }, true);
    }
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

  mountNav();
})();
