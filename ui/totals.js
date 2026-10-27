(() => {
  'use strict';
  const DN = window.DN;
  const el = {
    main:document.getElementById('header-main'), war:document.getElementById('header-war'),
    sub:document.getElementById('totals-sub'), list:document.getElementById('totals-list'),
    search:document.getElementById('totals-search'), error:document.getElementById('error'),
    sourcesAll:document.getElementById('totals-sources-all'), sourcesNone:document.getElementById('totals-sources-none'),
  };
  let rows = [], canonPerk = DN.polishPerk, hall = DN.loadCollectionUi().hall;
  let totals = [], refreshId = 0;
  let showSources = true;

  function computeTotals(scans) {
    const byId = new Map(rows.map(row => [DN.artifactKey(row), row]));
    const owned = DN.loadCollected(), levels = DN.loadLevels();
    for (const item of scans) {
      const row = window.DNStoredArtifacts.toRow(item), id = DN.artifactKey(row);
      byId.set(id, row); if(!item.catalogId)owned.add(id);
    }
    const loadout = DN.loadLoadout(DN.activeStrategyId())[hall], map = new Map();
    const assigned = new Set([...loadout.mains, loadout.hermitage].filter(Boolean));
    function addArtifact(id, role, singleIndex) {
      const row = byId.get(id);
      if (!row || !owned.has(id) || row.hall !== hall) return;
      for (const perk of DN.perksOf(row, canonPerk)) {
        if (singleIndex != null && perk.index !== singleIndex) continue;
        const scanned = row.scanned?.rows[perk.index - 1];
        if (scanned && scanned.unlocked !== true) continue;
        const revision = row.scanned && (Date.parse(row.scanned.updatedAt || row.scanned.capturedAt) || 0);
        const override = !scanned || levels[id]?._scanRevision === revision ? levels[id]?.[String(perk.index)] : null;
        const range = DN.effectivePerkRange(perk);
        const value = override != null && Number.isFinite(Number(override)) ? Number(override)
          : scanned ? scanned.value
          : range.base != null && range.max != null ? DN.clampPerkLevel(range.base, range.max, range.base) : perk.base;
        if (!perk.name || !Number.isFinite(value)) continue;
        if (!map.has(perk.name)) map.set(perk.name, {name:perk.name, value:0, sources:[]});
        const total = map.get(perk.name);
        total.value += value;
        total.sources.push({name:DN.show(row.name), role, value});
      }
    }
    for (const id of loadout.mains) {
      const grade = byId.get(id)?.grade;
      addArtifact(id, ['Mythical','Legendary'].includes(grade) ? 'Hall' : 'Exhibit');
    }
    if (loadout.hermitage) addArtifact(loadout.hermitage, 'Hermitage');
    for (const [id, index] of Object.entries(loadout.singles)) {
      if (!assigned.has(id)) addArtifact(id, 'Showcase · perk ' + index, index);
    }
    // Owned catalogue artifacts default to their first Showcase perk in Collection.
    for (const id of owned) {
      const row = byId.get(id);
      if (!row || row.scanned && !row.scanned.catalogId || !['Mythical','Legendary'].includes(row.grade)
        || assigned.has(id) || Object.hasOwn(loadout.singles, id)) continue;
      const first = DN.perksOf(row, canonPerk)[0];
      if (first) addArtifact(id, 'Showcase · perk ' + first.index, first.index);
    }
    return [...map.values()].sort((a,b) => Math.abs(b.value) - Math.abs(a.value) || a.name.localeCompare(b.name));
  }

  function render() {
    const query = el.search.value.trim().toLowerCase();
    const shown = totals.filter(total => total.name.toLowerCase().includes(query));
    el.list.classList.toggle('hide-sources', !showSources);
    for (const [button, active] of [[el.sourcesAll,showSources], [el.sourcesNone,!showSources]]) {
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const [button, value] of [[el.main,'Main'], [el.war,'War']]) {
      button.classList.toggle('is-active', hall === value);
      button.setAttribute('aria-pressed', String(hall === value));
    }
    el.sub.textContent = `${DN.activeStrategy().name} · ${totals.length} active stats · ${hall} hall`;
    el.list.innerHTML = shown.length ? shown.map(total => {
      const tone = total.value > 0 ? 'pref-pos' : total.value < 0 ? 'pref-neg' : '';
      const sourceRow = source => `<li><span>${DN.esc(source.name)}<small>${DN.esc(source.role)}</small></span><b>${DN.formatPerkValue(total.name,source.value)}</b></li>`;
      return `<article class="active-total"><header><h3>${DN.esc(total.name)}</h3><strong class="${tone}">${DN.formatPerkValue(total.name,total.value)}</strong></header>` +
        '<div class="active-total-sources"><ul aria-label="Contributing artifacts">' + total.sources.map(sourceRow).join('') + '</ul></div></article>';
    }).join('') : `<p class="totals-empty">${query ? 'No stats match your search.' : 'No active bonuses in this hall.'}</p>`;
  }

  async function refresh() {
    const request = ++refreshId;
    hall = DN.loadCollectionUi().hall;
    try {
      const scans = await window.DNStoredArtifacts.read(window.DNStoredArtifacts.collectionKey());
      if (request !== refreshId) return;
      totals = computeTotals(scans);
      el.error.hidden = true;
      render();
    } catch {
      if (request !== refreshId) return;
      el.error.textContent = 'Could not load your active totals. Reload to try again.';
      el.error.hidden = false;
    }
  }

  async function load() {
    try {
      const [data, mapping] = await Promise.all([fetch('./data/artifacts.json'), fetch('./data/perk_name_mapping.csv')]);
      if (!data.ok || !mapping.ok) throw new Error('Could not load artifact data.');
      rows = (await data.json()).filter(row => row.artifact_id !== 'leftwich-trophy-legendary');
      await window.DNStoredArtifacts.reconcileCatalog(rows);
      canonPerk = DN.makeCanonPerk(DN.parseMappingCsv(await mapping.text()));
      el.search.addEventListener('input', render);
      for (const [button, value] of [[el.sourcesAll,true], [el.sourcesNone,false]]) button.addEventListener('click', () => {
        showSources = value;
        render();
      });
      for (const [button, value] of [[el.main,'Main'], [el.war,'War']]) button.addEventListener('click', () => {
        hall = value;
        DN.saveCollectionUi({...DN.loadCollectionUi(), hall});
        window.DNPrimaryFilters.setHall(hall);
        refresh();
      });
      window.addEventListener('focus', refresh);
      window.addEventListener('storage', refresh);
      window.addEventListener('pageshow', refresh);
      window.addEventListener('dn-strategies-changed', refresh);
      window.addEventListener('dn-artifacts-changed', refresh);
      await refresh();
    } catch {
      el.sub.textContent = '';
      el.error.textContent = 'Could not load artifact data. Reload to try again.';
      el.error.hidden = false;
    }
  }
  load();
})();
