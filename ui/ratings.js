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
  };
  let factoryDefaults = {}, allPerkNames = [], globalBag = {}, groupBag = {}, profileBags = {}, profiles = [];
  const expanded = new Set();
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
  function input(layer, key, axis, value, placeholder, profileId = "") {
    return '<label class="rating-axis ' + (value == null ? 'is-inherit' : 'is-override') + '">' +
      '<span class="visually-hidden">' + DN.esc(key + ' ' + (profileId ? profiles.find(p => p.id === profileId)?.name : layer) + ' ' + axis) + '</span>' +
      '<input type="number" class="rating-input" min="' + DN.RATING_MIN + '" max="' + DN.RATING_MAX + '" step="1"' +
      ' data-layer="' + layer + '" data-key="' + DN.esc(key) + '" data-axis="' + axis + '" data-profile-id="' + DN.esc(profileId) + '"' +
      ' value="' + (value ?? '') + '" placeholder="' + DN.esc(String(placeholder)) + '" /></label>';
  }
  function pair(layer, key, bag, fallback, profileId = "") {
    return '<div class="ratings-page-pair">' + AXES.map(axis => input(layer, key, axis,
      DN.perkRatingAxisOrNull(bag, key, axis), fallback(axis), profileId)).join('') + '</div>';
  }
  function perkRow(name) {
    let html = '<div class="ratings-page-row"><span class="rating-name">' + DN.esc(name) + '</span>' +
      pair('global', name, globalBag, axis => inherited(name, axis));
    for (const p of profiles) html += pair('profile', name, profileBags[p.id] || {}, axis => globalValue(name, axis), p.id);
    return html + '</div>';
  }
  function perkHead() {
    return '<div class="ratings-page-head"><div class="ratings-page-corner">Individual stat</div>' +
      [{name: 'Global'}, ...profiles].map(p => '<div class="ratings-page-group"><div class="ratings-page-group-title">' + DN.esc(p.name) +
      '</div><div class="ratings-page-group-axes"><div>Off</div><div>Def</div></div></div>').join('') + '</div>';
  }
  function groupPlaceholder(perks, kind, axis) {
    const values = new Set(perks.filter(p => p.kind === kind).map(p => factoryDefaults[p.name]?.[axis] ?? 0));
    return values.size === 1 ? [...values][0] : 'Mixed';
  }
  function render() {
    const q = DN.text(el.q.value).toLowerCase();
    el.grid.style.setProperty('--ratings-groups', String(1 + profiles.length));
    el.clearOverrides.hidden = !profiles.length;
    const known = new Set(DN.PERK_GROUPS.flatMap(g => g.perks.map(p => p.name)));
    const sections = [...DN.PERK_GROUPS, {id:'unmapped',label:'Other stats',perks:allPerkNames.filter(n => !known.has(n)).map(name=>({name,kind:name}))}];
    let html = '';
    for (const section of sections) {
      const perks = section.perks.filter(p => allPerkNames.includes(p.name));
      const matches = perks.filter(p => !q || section.label.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
      if (!matches.length) continue;
      const kinds = [...new Set(perks.map(p => p.kind))].filter(k => k !== 'combined');
      html += '<section class="rating-section" data-section="' + section.id + '"><div class="rating-section-heading"><h2>' + DN.esc(section.label) +
        '</h2><span>' + perks.length + ' stats</span></div><div class="rating-group-head"><span>Global defaults</span><span>Off</span><span>Def</span></div>';
      for (const kind of kinds) {
        const key = section.id + ':' + kind;
        html += '<div class="rating-group-row"><span>' + DN.esc(kindLabels[kind] || kind) + '</span>' +
          AXES.map(axis => input('group',key,axis,DN.perkRatingAxisOrNull(groupBag,key,axis),groupPlaceholder(perks,kind,axis))).join('') + '</div>';
      }
      if (perks.some(p => p.kind === 'combined')) html += '<p class="rating-section-note">Combined HP &amp; damage inherits the higher rating.</p>';
      html += '<details class="rating-section-details" data-section-id="' + section.id + '"' + (q || expanded.has(section.id) ? ' open' : '') +
        '><summary>Individual stats and profile overrides</summary><div class="rating-section-perks">' + perkHead() +
        matches.map(p => perkRow(p.name)).join('') + '</div></details></section>';
    }
    el.grid.innerHTML = html || '<p class="empty-hint">No perks match.</p>';
  }
  function bind() {
    el.q.addEventListener('input', render);
    el.grid.addEventListener('toggle', ev => {
      const details = ev.target;
      if (!details.matches?.('details[data-section-id]') || el.q.value) return;
      if (details.open) expanded.add(details.dataset.sectionId); else expanded.delete(details.dataset.sectionId);
    }, true);
    el.grid.addEventListener('change', ev => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement) || !target.matches('.rating-input')) return;
      const {layer,key,axis,profileId} = target.dataset;
      if (!AXES.includes(axis) || !key || !target.validity.valid) return;
      const value = target.value === '' ? null : Number(target.value);
      // Capture open sections before replacing their contents.
      el.grid.querySelectorAll('details[open]').forEach(d => { if (!el.q.value) expanded.add(d.dataset.sectionId); });
      if (layer === 'group') { setAxis(groupBag,key,axis,value); DN.savePerkGroupDefaults(groupBag); }
      else if (layer === 'global') { setAxis(globalBag,key,axis,value); persistGlobal(); }
      else if (layer === 'profile' && profileId) { profileBags[profileId] ||= {}; setAxis(profileBags[profileId],key,axis,value); persistProfile(profileId); }
      render();
    });
    el.resetGlobal.addEventListener('click', () => {
      if (!confirm('Reset group defaults and individual global ratings to factory defaults? Profile overrides are kept.')) return;
      globalBag = {}; groupBag = {}; persistGlobal(); DN.savePerkGroupDefaults(groupBag); render();
    });
    el.clearOverrides.addEventListener('click', () => {
      if (!confirm('Clear perk-rating overrides for every profile?')) return;
      for (const p of profiles) { profileBags[p.id] = {}; persistProfile(p.id); } render();
    });
  }
  async function load() {
    try {
      DN.ensurePerkRatingsMigrated();
      const state = DN.ensureProfiles();
      profiles = state.profiles.slice();
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

      showError("");
      render();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  bind();
  load();
})();
