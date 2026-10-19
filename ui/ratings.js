(() => {
  "use strict";
  const DN = window.DN;
  if (!DN) return;
  const DEFAULTS_URL = "./data/perk_rating_defaults.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";
  const AXES = DN.RATING_AXES;
  const el = {
    q: document.getElementById("ratings-q"), grid: document.getElementById("ratings-grid"),
    error: document.getElementById("error"), resetGlobal: document.getElementById("ratings-reset-global"),
    clearOverrides: document.getElementById("ratings-clear-overrides"),
    groupBy: document.getElementById("ratings-group-by"),
    artifactScope: document.getElementById("ratings-artifact-scope"),
    hint: document.getElementById("ratings-hint"),
  };
  let factoryDefaults = {}, allPerkNames = [], globalBag = {}, groupBag = {}, profileBags = {}, profiles = [];
  let strategies = [], strategyBags = new Map(), strategyContexts = new Map();
  let canonicalizePerk = name => name;
  function refreshStrategy() {
    profiles = [DN.activeProfile()];
    profileBags = Object.fromEntries(profiles.map(p => [p.id, DN.loadProfilePerkOverrides(p.id)]));
    strategies = DN.loadStrategies().strategies.filter(s => !s.archived);
    strategyBags = new Map(strategies.map(s => [s.id, structuredClone(s.overrides || {})]));
    strategyContexts = new Map(strategies.map(s => [s.id, DN.createStrategyRatingContext(factoryDefaults, {canonPerk: canonicalizePerk, strategyId: s.id})]));
  }
  const expanded = new Set();
  const poolData = window.DN_CRAFTED_PERK_POOLS;
  for (const [hall, types] of Object.entries(poolData?.pools || {})) {
    for (const type of Object.keys(types)) expanded.add('artifact-' + hall + '-' + type);
  }
  if (el.groupBy) el.groupBy.value = ['artifact','purpose'].includes(DN.lsGet('dn-ratings-group-by')) ? DN.lsGet('dn-ratings-group-by') : 'family';
  const artifactView = () => el.groupBy?.value === 'artifact';
  const selectedHall = () => DN.lsGet('dn-artifact-hall-filter') === 'Main' ? 'main' : 'war';
  function artifactSections() {
    const hall = selectedHall(), assigned = new Set();
    const sections = Object.entries(poolData?.pools?.[hall] || {}).map(([type, stats]) => {
      const perks = Object.entries(stats).filter(([name]) => allPerkNames.includes(name)).map(([name, evidence]) => {
        assigned.add(name);
        return {name, evidence};
      });
      return {id: 'artifact-' + hall + '-' + type, label: type === 'Jewelry' ? 'Jewellery' : type, perks};
    });
    sections.push({id: 'artifact-' + hall + '-unassigned', label: 'Type not established',
      note: 'These catalogue stats have no established crafted type in this Hall yet. They remain available to rate.',
      perks: allPerkNames.filter(name => !assigned.has(name)).map(name => ({name}))});
    return sections;
  }
  const kindLabels = { damage: "Damage", hp: "Hitpoints", speed: "Attack speed", movement: "Movement speed",
    spawn: "Spawn time", healing: "Healing", cooldown: "Cooldown and deploy time", other: "Other bonuses",
    resources: "Resources looted", refund: "Loot refund", chance: "Trade good chance", production: "Resource production",
    capacity: "Vault capacity", interest: "Vault interest", time: "Research time", cost: "Research cost",
    training: "Training cost", expansion: "Expansion refund", recon: "Recon effects", rally: "Rally",
    victory: "Quick victory", tactics: "Tactic effects" };
  function showError(msg) { el.error.hidden = !msg; el.error.textContent = msg; }
  function persistGlobal() { DN.saveGlobalPerkRatings(globalBag); }
  function persistProfile(id) { DN.saveProfilePerkOverrides(id, profileBags[id] || {}); }
  function inherited(name, axis) {
    return DN.groupPerkRating(name, axis, groupBag) ?? factoryDefaults[name]?.[axis] ?? 0;
  }
  function globalValue(name, axis) { return DN.perkRatingAxisOrNull(globalBag, name, axis) ?? inherited(name, axis); }
  function setAxis(bag, key, axis, value) {
    if (value == null) {
      if (bag[key]) { delete bag[key][axis]; if (!Object.keys(bag[key]).length) delete bag[key]; }
    } else { bag[key] = { ...(bag[key] || {}), [axis]: DN.clampPerkRating(value) }; }
  }
  function input(layer, key, axis, value, placeholder, profileId = "", strategyId = "") {
    return '<label class="rating-axis ' + (value == null ? 'is-inherit' : 'is-override') + '">' +
      '<span class="visually-hidden">' + DN.esc(key + ' ' + (strategyId ? strategies.find(s => s.id === strategyId)?.name : profileId ? profiles.find(p => p.id === profileId)?.name : layer) + ' ' + axis) + '</span>' +
      '<input type="number" class="rating-input" min="' + DN.RATING_MIN + '" max="' + DN.RATING_MAX + '" step="1"' +
      ' data-layer="' + layer + '" data-key="' + DN.esc(key) + '" data-axis="' + axis + '" data-profile-id="' + DN.esc(profileId) + '" data-strategy-id="' + DN.esc(strategyId) + '"' +
      ' value="' + (value ?? '') + '" placeholder="' + DN.esc(String(placeholder)) + '" /></label>';
  }
  function pair(layer, key, bag, fallback, profileId = "") {
    return '<div class="ratings-page-pair">' + AXES.map(axis => input(layer, key, axis,
      DN.perkRatingAxisOrNull(bag, key, axis), fallback(axis), profileId)).join('') + '</div>';
  }
  function perkRow(name, evidence) {
    const reviewed = evidence?.reviewedFrames?.length > 0;
    const badge = evidence ? '<small class="strategy-rating-source" title="' + DN.esc(reviewed
      ? 'Type seen in manually reviewed game footage.'
      : 'Type recorded in ' + evidence.observedItems + ' scanner item encounters; OCR evidence is unverified.') + '">' + (reviewed ? 'Reviewed type' : 'Observed type') + '</small>' : '';
    let html = '<div class="ratings-page-row"><span class="rating-name">' + DN.esc(name) + badge + '</span>' +
      pair('global', name, globalBag, axis => inherited(name, axis));
    for (const p of profiles) html += pair('profile', name, profileBags[p.id] || {}, axis => globalValue(name, axis), p.id);
    for (const strategy of strategies) html += '<div class="ratings-page-pair strategy-rating-pair" data-strategy-column="' + DN.esc(strategy.id) + '">' + AXES.map(axis => {
      const detail = strategyContexts.get(strategy.id).explain(name, axis);
      const source = {override:'Strategy override',legacy:'Migrated snapshot',army:'Army default',profile:'Profile preference',global:'Global preference',group:'Group default',factory:'Factory default'}[detail.source] || detail.source;
      return '<div title="' + DN.esc(source + ': ' + detail.value) + '">' + input('strategy', name, axis, DN.perkRatingAxisOrNull(strategyBags.get(strategy.id),name,axis),detail.value,DN.activeProfileId(),strategy.id) + '</div>';
    }).join('') + '</div>';
    return html + '</div>';
  }
  function perkHead() {
    return '<div class="ratings-page-head"><div class="ratings-page-corner">Individual stat</div>' +
      [{name: 'Global'}, ...profiles.map(p => ({name: p.name + ' preferences'})), ...strategies].map(p => '<div class="ratings-page-group"' + (strategies.includes(p) ? ' data-strategy-heading="' + DN.esc(p.id) + '"' : '') + '><div class="ratings-page-group-title" title="' + DN.esc(p.name) + '">' + DN.esc(p.name) +
      '</div><div class="ratings-page-group-axes"><div>Off</div><div>Def</div></div></div>').join('') + '</div>';
  }
  function groupPlaceholder(perks, kind, axis) {
    const values = new Set(perks.filter(p => p.kind === kind).map(p => factoryDefaults[p.name]?.[axis] ?? 0));
    return values.size === 1 ? [...values][0] : 'Mixed';
  }
  function render() {
    if (!strategies.length) return;
    const q = DN.text(el.q.value).toLowerCase();
    const byArtifact = artifactView();
    const byPurpose = el.groupBy?.value === 'purpose';
    if (el.hint) el.hint.hidden = byArtifact || byPurpose;
    if (el.artifactScope) {
      el.artifactScope.hidden = !byArtifact && !byPurpose;
      el.artifactScope.textContent = byPurpose ? 'Selected collection targets. Each perk edits the same shared profile Off/Def rating as the other views. Changes update every target using that stat and its scanner comparison. Included perks may span Halls and artifact types.' : (selectedHall() === 'main' ? 'Main Hall' : 'War Hall') +
        ' crafted types. Reviewed types come from game footage; observed types come from scanner records. Coverage is incomplete' +
        (selectedHall() === 'war' ? ', especially for War' : '') + '. Unseen stats may still be possible. Each stat uses the same ratings in both views. Blank fields inherit; edits save automatically.';
    }
    el.grid.style.setProperty('--ratings-groups', String(1 + profiles.length + strategies.length));
    document.getElementById('ratings-profile-scope').textContent = `${DN.activeProfile().name} · ${strategies.length} ${strategies.length === 1 ? 'loadout or strategy' : 'loadouts and strategies'}. Strategies and their ratings belong to this profile.`;
    el.clearOverrides.hidden = !profiles.length;
    el.resetGlobal.hidden = byPurpose;
    if (byPurpose) {
      el.clearOverrides.hidden = true;
      const service = window.DNCraftingPurposes, state = service?.settings();
      document.getElementById('ratings-profile-scope').textContent = DN.activeProfile().name + ' · ' + (state?.selected.length || 0) + ' selected collection targets';
      const html = state?.selected.map(id => service.renderGrouped(id, q)).join('');
      el.grid.innerHTML = html || (state?.selected.length ? '<p class="empty-hint">No selected targets or perks match this search.</p>' : '<p class="empty-hint">Select targets above, or add your own target, to edit their perk weights here.</p>');
      return;
    }
    const known = new Set(DN.PERK_GROUPS.flatMap(g => g.perks.map(p => p.name)));
    const sections = byArtifact ? artifactSections() : [...DN.PERK_GROUPS, {id:'unmapped',label:'Other stats',perks:allPerkNames.filter(n => !known.has(n)).map(name=>({name,kind:name}))}];
    let html = '';
    for (const section of sections) {
      const perks = section.perks.filter(p => allPerkNames.includes(p.name));
      const matches = perks.filter(p => !q || section.label.toLowerCase().includes(q) || (section.label === 'Jewellery' && 'jewelry'.includes(q)) || p.name.toLowerCase().includes(q));
      if (!matches.length) continue;
      const kinds = [...new Set(perks.map(p => p.kind))].filter(k => k !== 'combined');
      html += '<section class="rating-section" data-section="' + section.id + '"><div class="rating-section-heading"><h2>' + DN.esc(section.label) +
        '</h2><span>' + (q ? matches.length + ' of ' : '') + perks.length + ' stats</span></div>';
      if (section.note) html += '<p class="rating-section-note">' + DN.esc(section.note) + '</p>';
      if (!byArtifact) html += '<div class="rating-group-head"><span>Global defaults</span><span>Off</span><span>Def</span></div>';
      for (const kind of byArtifact ? [] : kinds) {
        const key = section.id + ':' + kind;
        html += '<div class="rating-group-row"><span>' + DN.esc(kindLabels[kind] || kind) + '</span>' +
          AXES.map(axis => input('group',key,axis,DN.perkRatingAxisOrNull(groupBag,key,axis),groupPlaceholder(perks,kind,axis))).join('') + '</div>';
      }
      if (perks.some(p => p.kind === 'combined')) html += '<p class="rating-section-note">Combined HP &amp; damage inherits the higher rating.</p>';
      html += '<details class="rating-section-details" data-section-id="' + section.id + '"' + (q || expanded.has(section.id) ? ' open' : '') +
        '><summary>Individual stats, profile preferences and strategies</summary><div class="rating-section-perks" tabindex="0" role="region" aria-label="' + DN.esc(section.label) + ' rating columns">' + perkHead() +
        matches.map(p => perkRow(p.name, p.evidence)).join('') + '</div></details></section>';
    }
    el.grid.innerHTML = html || '<p class="empty-hint">No perks match.</p>';
  }
  function bind() {
    el.q.addEventListener('input', render);
    el.groupBy?.addEventListener('change', () => {
      DN.lsSet('dn-ratings-group-by', ['artifact','purpose'].includes(el.groupBy.value) ? el.groupBy.value : 'family');
      render();
    });
    for (const id of ['header-main', 'header-war']) document.getElementById(id)?.addEventListener('click', render);
    el.grid.addEventListener('toggle', ev => {
      const details = ev.target;
      if (!details.matches?.('details[data-section-id]') || el.q.value) return;
      if (details.open) expanded.add(details.dataset.sectionId); else expanded.delete(details.dataset.sectionId);
    }, true);
    el.grid.addEventListener('change', ev => {
      const target = ev.target;
      const purposeId = target.dataset.purposeWeight;
      if (purposeId && window.DNCraftingPurposes) {
        if (!target.validity.valid) return;
        const patch = {weights:{[target.dataset.perk]:target.value === '' ? null : Number(target.value)}};
        try { window.DNCraftingPurposes.configure(purposeId, patch);showError(''); }
        catch (error) { showError(error.message || 'Could not save target settings.'); }
        return;
      }
      if (!(target instanceof HTMLInputElement) || !target.matches('.rating-input')) return;
      const {layer,key,axis,profileId,strategyId} = target.dataset;
      if (!AXES.includes(axis) || !key || !target.validity.valid) return;
      const value = target.value === '' ? null : Number(target.value);
      // Capture open sections before replacing their contents.
      el.grid.querySelectorAll('details[open]').forEach(d => { if (!el.q.value) expanded.add(d.dataset.sectionId); });
      try {
        if (layer === 'group') { setAxis(groupBag,key,axis,value); DN.savePerkGroupDefaults(groupBag); }
        else if (layer === 'global') { setAxis(globalBag,key,axis,value); persistGlobal(); }
        else if (layer === 'profile' && profileId) { profileBags[profileId] ||= {}; setAxis(profileBags[profileId],key,axis,value); persistProfile(profileId); }
        else if (layer === 'strategy') {
          const bag = strategyBags.get(strategyId);
          if (!bag || profileId !== DN.activeProfileId()) return;
          const next = structuredClone(bag);
          setAxis(next,key,axis,value); DN.saveStrategyOverrides(strategyId, next);
        }
        refreshStrategy(); render(); showError('');
      } catch (err) { showError(`Could not save rating: ${err.message || err}`); }
    });
    el.resetGlobal.addEventListener('click', () => {
      if (!confirm('Reset group defaults and individual global ratings to factory defaults? Profile overrides are kept.')) return;
      try { globalBag = {}; groupBag = {}; persistGlobal(); DN.savePerkGroupDefaults(groupBag); refreshStrategy(); render(); } catch (err) { showError(`Could not reset ratings: ${err.message || err}`); }
    });
    el.grid.addEventListener('click', ev => {
      const target = ev.target.closest('[data-purpose-edit]');
      if (target) window.DNCraftingPurposes?.editCustom(target.dataset.purposeEdit);
    });
    el.clearOverrides.addEventListener('click', () => {
      if (!confirm(`Clear perk-rating overrides for “${DN.activeProfile().name}”? Strategy overrides are kept.`)) return;
      try { for (const p of profiles) { profileBags[p.id] = {}; persistProfile(p.id); } refreshStrategy(); render(); } catch (err) { showError(`Could not clear profile ratings: ${err.message || err}`); }
    });
    window.addEventListener('dn-strategies-changed', () => { if (allPerkNames.length) { refreshStrategy(); render(); } });
    window.addEventListener('dn-crafting-purposes-changed', () => { if (allPerkNames.length) render(); });
    for (const event of ['focus','storage']) window.addEventListener(event, () => {
      if (!allPerkNames.length) return;
      try {
        profiles = [DN.activeProfile()];
        globalBag = DN.loadStoredGlobalPerkRatings(); groupBag = DN.loadPerkGroupDefaults();
        profileBags = Object.fromEntries(profiles.map(profile => [profile.id, DN.loadProfilePerkOverrides(profile.id)]));
        refreshStrategy(); render();
      } catch (err) { showError(`Could not refresh ratings: ${err.message || err}`); }
    });
  }
  async function load() {
    try {
      DN.ensurePerkRatingsMigrated();
      const state = DN.ensureProfiles();
      profiles = state.profiles.filter(p => p.id === state.activeId);
      globalBag = DN.loadStoredGlobalPerkRatings();
      groupBag = DN.loadPerkGroupDefaults();
      profileBags = {};
      for (const p of profiles) {
        profileBags[p.id] = DN.loadProfilePerkOverrides(p.id);
      }

      const [mapRes, defRes] = await Promise.all([
        fetch(MAPPING_URL, { cache: "no-store" }),
        fetch(DEFAULTS_URL, { cache: "no-store" }),
      ]);
      if (!defRes.ok) throw new Error(`HTTP ${defRes.status} loading ${DEFAULTS_URL}`);
      const canonPerk = DN.makeCanonPerk(
        mapRes.ok ? DN.parseMappingCsv(await mapRes.text()) : {}
      );
      canonicalizePerk = canonPerk;
      const rawDefaults = await defRes.json();
      /** @type {Record<string, { offensive: number, defensive: number }>} */
      const defaults = {};
      for (const [k, v] of Object.entries(rawDefaults || {})) {
        const canon = canonPerk(k) || DN.polishPerk(DN.text(k));
        if (!canon || !v || typeof v !== "object") continue;
        const obj = /** @type {Record<string, unknown>} */ (v);
        defaults[canon] = {
          offensive: DN.clampPerkRating(Number(obj.offensive) || 0),
          defensive: DN.clampPerkRating(Number(obj.defensive) || 0),
        };
      }
      if (!Object.keys(defaults).length) {
        throw new Error("perk_rating_defaults.json contained no usable defaults");
      }
      factoryDefaults = defaults;
      window.DNCraftingPurposes?.setDefaults(defaults);
      allPerkNames = Object.keys(defaults).sort((a, b) => a.localeCompare(b));

      // Canon-collapse stored bags once
      function migrateBag(bag) {
        /** @type {Record<string, { offensive?: number, defensive?: number }>} */
        const out = {};
        for (const [k, v] of Object.entries(bag)) {
          const entry = DN.normalizePerkRatingEntry(v);
          if (!entry) continue;
          const canon = canonPerk(k) || DN.polishPerk(k);
          if (!canon) continue;
          out[canon] = { ...(out[canon] || {}), ...entry };
        }
        return out;
      }
      globalBag = migrateBag(globalBag);
      persistGlobal();
      for (const p of profiles) {
        profileBags[p.id] = migrateBag(profileBags[p.id] || {});
        persistProfile(p.id);
      }

      DN.initializeStrategyBaselines(factoryDefaults, {canonPerk: canonicalizePerk});
      refreshStrategy();

      showError("");
      render();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  bind();
  load();
})();
