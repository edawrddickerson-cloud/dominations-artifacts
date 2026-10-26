(() => {
  "use strict";
  const C = window.DNCouncil, DN = window.DN;
  if (!C || !DN) return;
  const el = {
    q: document.getElementById("ratings-q"), grid: document.getElementById("ratings-grid"),
    error: document.getElementById("error"), reset: document.getElementById("ratings-reset"),
    group: document.getElementById("ratings-group-by"), show: document.getElementById("ratings-show"),
    count: document.getElementById("ratings-count"),
  };
  let context, statModes, order = [], familyOf;
  let sort = {key: "name", dir: 1};
  const collapsed = new Set();
  const visibleAxes = () => C.AXES.filter(axis => C.loadPrefSortAxes()[axis]);
  function showError(message = "") {
    el.error.hidden = !message;
    el.error.textContent = message;
  }
  function sortValue(name) {
    if (sort.key === "name") return name;
    const [layer, axis] = sort.key.split(":");
    return layer === "shared" ? context.inherited(name, axis).value : context.ratingOf(name, axis);
  }
  function sortNames() {
    order.sort((a, b) => {
      const av = sortValue(a), bv = sortValue(b);
      return (typeof av === "number" ? av - bv : av.localeCompare(bv)) * sort.dir || a.localeCompare(b);
    });
  }
  function matchedNames() {
    const q = el.q.value.trim().toLowerCase(), mode = C.loadUi().mode, selectedAxes = visibleAxes();
    return order.filter(name => {
      if (!statModes.get(name).has(mode)) return false;
      if (q && !name.toLowerCase().includes(q) && !familyOf(name).label.toLowerCase().includes(q)) return false;
      switch (el.show.value) {
        case "overridden": return selectedAxes.some(axis => context.councilValue(name, axis) != null);
        case "zero": return selectedAxes.every(axis => context.ratingOf(name, axis) === 0);
        case "shared": return context.isShared(name);
        case "council": return !context.isShared(name);
        default: return true;
      }
    });
  }
  function sortHeader(label, key) {
    const state = sort.key === key ? sort.dir === 1 ? "ascending" : "descending" : "none";
    return `<th scope="col" aria-sort="${state}"><button type="button" class="th-sort" data-sort-key="${key}">${label}</button></th>`;
  }
  function input(name, layer, axis) {
    if (layer === "shared" && !context.isShared(name)) return '<td class="council-rating-unavailable">—</td>';
    return `<td><label class="rating-axis"><span class="visually-hidden">${C.esc(name)} ${layer === "shared" ? "Shared profile" : "Council"} ${axis === "offensive" ? "Off" : "Def"}</span>` +
      `<input type="number" class="rating-input" data-stat="${C.esc(name)}" data-layer="${layer}" data-axis="${axis}" min="${C.RATING_MIN}" max="${C.RATING_MAX}" step="1" /></label></td>`;
  }
  function table(names, selectedAxes) {
    const columns = selectedAxes.length;
    const head = '<thead><tr><th scope="col"></th>' +
      `<th scope="colgroup" colspan="${columns}">Shared profile</th><th scope="colgroup" colspan="${columns}">Council</th><th scope="col"></th></tr><tr>` +
      sortHeader("Stat", "name") + ["shared", "council"].map(layer => selectedAxes.map(axis => sortHeader(axis === "offensive" ? "Off" : "Def", layer + ":" + axis)).join("")).join("") + '<th scope="col">Reset</th></tr></thead>';
    return '<table class="council-ratings-table">' + head + '<tbody>' + names.map(name =>
      `<tr data-stat="${C.esc(name)}"><th scope="row">${C.esc(name)}</th>` +
      ["shared", "council"].map(layer => selectedAxes.map(axis => input(name, layer, axis)).join("")).join("") +
      `<td><button type="button" class="btn btn-small" data-reset-stat="${C.esc(name)}" aria-label="Reset Council ratings for ${C.esc(name)}">Reset</button></td></tr>`
    ).join("") + '</tbody></table>';
  }
  function updateFields() {
    for (const input of el.grid.querySelectorAll("input.rating-input")) {
      const {stat, layer, axis} = input.dataset;
      const value = layer === "shared" ? context.profileValue(stat, axis) : context.councilValue(stat, axis);
      const fallback = layer === "shared" ? context.sharedDefault(stat, axis) : context.inherited(stat, axis);
      if (document.activeElement !== input) input.value = value == null ? "" : String(value);
      input.placeholder = String(fallback.value);
      input.title = `${value == null ? fallback.source : layer === "shared" ? "Shared profile" : "Council override"}: ${value ?? fallback.value}. Clear to inherit.`;
      input.closest("label").classList.toggle("is-inherit", value == null);
      input.closest("label").classList.toggle("is-override", value != null);
    }
    for (const button of el.grid.querySelectorAll("[data-reset-stat]")) {
      button.disabled = !C.AXES.some(axis => context.councilValue(button.dataset.resetStat, axis) != null);
    }
    el.reset.disabled = !Object.keys(context.overrides).length;
  }
  function render() {
    const names = matchedNames(), selectedAxes = visibleAxes(), groups = new Map();
    for (const name of names) {
      const family = el.group.value === "none" ? {id: "all", label: "Stats", index: 0} : familyOf(name);
      if (!groups.has(family.id)) groups.set(family.id, {family, names: []});
      groups.get(family.id).names.push(name);
    }
    const sections = [...groups.values()].sort((a, b) => a.family.index - b.family.index);
    el.grid.innerHTML = sections.map(({family, names}) =>
      `<details class="council-rating-section" data-family="${family.id}"${el.q.value.trim() || !collapsed.has(family.id) ? " open" : ""}><summary>${C.esc(family.label)} <span>${names.length}</span></summary>` +
      table(names, selectedAxes) + '</details>'
    ).join("") || '<p class="empty-hint">No stats match.</p>';
    el.count.textContent = `${names.length} / ${order.length} stats`;
    updateFields();
  }
  function refresh() {
    if (!context) return;
    try { context.refresh(); updateFields(); showError(); }
    catch (err) { showError(`Could not refresh ratings: ${err.message || err}`); }
  }
  function setAxis(bag, name, axis, value) {
    if (value == null) {
      if (bag[name]) { delete bag[name][axis]; if (!Object.keys(bag[name]).length) delete bag[name]; }
    } else bag[name] = {...bag[name], [axis]: value};
  }
  function bind() {
    el.q.addEventListener("input", render);
    el.show.addEventListener("change", render);
    el.group.addEventListener("change", () => { DN.lsSet("dn-council-ratings-group-by", el.group.value); render(); });
    for (const id of ["header-main", "header-war", "header-off", "header-def"]) document.getElementById(id).addEventListener("click", render);
    el.grid.addEventListener("toggle", event => {
      if (!event.target.matches("details[data-family]") || el.q.value.trim()) return;
      if (event.target.open) collapsed.delete(event.target.dataset.family); else collapsed.add(event.target.dataset.family);
    }, true);
    el.grid.addEventListener("click", event => {
      const sortButton = event.target.closest("[data-sort-key]");
      if (sortButton) {
        const key = sortButton.dataset.sortKey;
        sort = {key, dir: key === sort.key ? -sort.dir : key === "name" ? 1 : -1};
        sortNames(); render(); return;
      }
      const reset = event.target.closest("[data-reset-stat]");
      if (!reset) return;
      try {
        context.refresh();
        const next = structuredClone(context.overrides);
        delete next[reset.dataset.resetStat];
        C.saveRatings(next); context.refresh();
        for (const input of reset.closest("tr").querySelectorAll('[data-layer="council"]')) input.value = "";
        updateFields(); showError();
      } catch (err) { showError(`Could not reset rating: ${err.message || err}`); }
    });
    el.grid.addEventListener("change", event => {
      const input = event.target;
      if (!input.matches("input.rating-input") || !input.validity.valid) return;
      const {stat, layer, axis} = input.dataset;
      const value = input.value === "" ? null : Number(input.value);
      try {
        context.refresh();
        const bag = layer === "shared" ? DN.loadProfilePerkOverrides(DN.activeProfileId()) : structuredClone(context.overrides);
        setAxis(bag, stat, axis, value);
        if (layer === "shared") DN.saveProfilePerkOverrides(DN.activeProfileId(), bag); else C.saveRatings(bag);
        context.refresh(); updateFields(); showError();
      } catch (err) { showError(`Could not save rating: ${err.message || err}`); }
    });
    el.reset.addEventListener("click", () => {
      if (!confirm("Clear all Council overrides for this profile?")) return;
      try { C.saveRatings({}); context.refresh(); updateFields(); showError(); }
      catch (err) { showError(`Could not reset ratings: ${err.message || err}`); }
    });
    for (const event of ["focus", "storage", "dn-strategies-changed", "dn-council-ratings-changed"]) window.addEventListener(event, refresh);
  }
  async function load() {
    try {
      const urls = ["councilors.json", "council_stat_rating_defaults.json", "perk_rating_defaults.json", "perk_name_mapping.csv"];
      const responses = await Promise.all(urls.map(url => fetch("./data/" + url)));
      responses.forEach((res, i) => { if (!res.ok) throw new Error(`HTTP ${res.status} loading ${urls[i]}`); });
      const [data, councilDefaults, artifactDefaults, mapping] = await Promise.all(responses.map((res, i) => i === 3 ? res.text() : res.json()));
      const canon = DN.makeCanonPerk(DN.parseMappingCsv(mapping));
      context = C.createRatingContext(artifactDefaults, councilDefaults, canon);
      C.saveRatings(context.overrides);
      statModes = new Map();
      for (const row of data.councilors) for (const mode of ["main", "war"]) for (const rarity of C.RARITIES) {
        for (const raw of C.statsOf(row, mode, rarity)) {
          const name = canon(raw);
          if (!statModes.has(name)) statModes.set(name, new Set());
          statModes.get(name).add(mode);
        }
      }
      const families = new Map();
      DN.PERK_GROUPS.forEach((group, index) => group.perks.forEach(perk => families.set(canon(perk.name), {...group, index})));
      familyOf = name => families.get(name) || {id: "council-only", label: "Council-only stats", index: DN.PERK_GROUPS.length};
      order = [...statModes.keys()]; sortNames();
      el.group.value = DN.lsGet("dn-council-ratings-group-by") === "none" ? "none" : "family";
      const requested = new URL(location.href).searchParams.get("stat");
      if (requested && statModes.has(canon(requested))) {
        const name = canon(requested);
        if (!statModes.get(name).has(C.loadUi().mode)) window.DNPrimaryFilters.setHall([...statModes.get(name)][0]);
        el.q.value = name;
      }
      bind(); render(); showError();
      if (requested) el.grid.querySelector('[data-layer="council"]')?.focus();
    } catch (err) { showError(err.message || String(err)); }
  }
  load();
})();
