(() => {
  "use strict";

  const COLLECTED_KEY = "dn-artifact-collected";
  const LOADOUT_KEY = "dn-artifact-loadout";
  const LEVELS_KEY = "dn-artifact-perk-levels";
  const COLLECTION_UI_KEY = "dn-artifact-collection-ui";
  const ARMY_PRESETS_KEY = "dn-army-presets";
  const ARMY_PRESET_MAX = 5;
  const PROFILES_KEY = "dn-profiles";
  const PROFILE_MAX = 20;
  const BLANK = "—";

  /** Global perk ratings (not profile-scoped). Profile-scoped key holds per-profile overrides. */
  const PERK_RATINGS_KEY = "dn-artifact-perk-ratings";
  const PERK_RATINGS_GLOBAL_KEY = "dn-artifact-perk-ratings-global";
  const PERK_RATINGS_LAYER_MIGRATED_KEY = "dn-perk-ratings-layer-migrated";
  const PERK_RATINGS_STORE_VERSION = 2;
  const RATING_MIN = -5;
  const RATING_MAX = 5;
  const RATING_AXES = Object.freeze(/** @type {const} */ (["offensive", "defensive"]));

  /** Base localStorage keys scoped per profile (legacy unprefixed → Main on first run). */
  const PROFILE_SCOPED_KEYS = Object.freeze([
    "dn-artifact-collected",
    "dn-artifact-loadout",
    "dn-artifact-perk-levels",
    "dn-artifact-collection-ui",
    "dn-army-presets",
    PERK_RATINGS_KEY,
    "dn-artifact-pref-sort-axes",
    "dn-artifact-hide-collected",
    "dn-artifact-score-mode",
    "dn-artifact-hall-filter",
    "dn-artifact-grade-filter",
    "dn-artifact-perk-match-mode",
    "dn-council-owned",
    "dn-council-active",
    "dn-council-stat-ratings",
    "dn-council-ui",
    "dn-council-pref-sort-axes",
    "dn-council-hide-owned",
    "dn-council-score-mode",
  ]);

  /** @type {ReturnType<typeof normalizeProfiles> | null} */
  let profilesCache = null;
  let perkRatingsMigrated = false;

  function newProfileId() {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function emptyProfiles() {
    return {
      v: 1,
      activeId: "main",
      profiles: [{ id: "main", name: "Main" }],
    };
  }

  function ptext(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function normalizeProfiles(raw) {
    const empty = emptyProfiles();
    if (!raw || typeof raw !== "object") return empty;
    const listIn = Array.isArray(raw.profiles) ? raw.profiles : [];
    /** @type {{ id: string, name: string }[]} */
    const profiles = [];
    const seen = new Set();
    for (const src of listIn) {
      if (!src || typeof src !== "object") continue;
      if (profiles.length >= PROFILE_MAX) break;
      let id = ptext(src.id);
      if (!id || seen.has(id)) id = newProfileId();
      seen.add(id);
      const name = ptext(src.name) || `Profile ${profiles.length + 1}`;
      profiles.push({ id, name });
    }
    if (!profiles.length) return empty;
    let activeId = ptext(raw.activeId);
    if (!profiles.some((p) => p.id === activeId)) activeId = profiles[0].id;
    return { v: 1, activeId, profiles };
  }

  function profileStorageKey(baseKey, profileId) {
    return `dn-p:${profileId}:${baseKey}`;
  }

  function migrateLegacyKeysToProfile(profileId) {
    for (const base of PROFILE_SCOPED_KEYS) {
      const scoped = profileStorageKey(base, profileId);
      try {
        if (localStorage.getItem(scoped) != null) continue;
        const legacy = localStorage.getItem(base);
        if (legacy == null) continue;
        localStorage.setItem(scoped, legacy);
      } catch {
        /* ignore */
      }
    }
  }

  function loadProfilesRaw() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveProfilesState(state) {
    const next = normalizeProfiles(state);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
    profilesCache = next;
    return next;
  }

  function ensureProfiles() {
    if (profilesCache) return profilesCache;
    const raw = loadProfilesRaw();
    if (!raw) {
      const created = emptyProfiles();
      migrateLegacyKeysToProfile(created.activeId);
      return saveProfilesState(created);
    }
    profilesCache = normalizeProfiles(raw);
    return profilesCache;
  }

  function activeProfileId() {
    return ensureProfiles().activeId;
  }

  function activeProfile() {
    const state = ensureProfiles();
    return state.profiles.find((p) => p.id === state.activeId) || state.profiles[0];
  }

  function lsKey(baseKey) {
    return profileStorageKey(baseKey, activeProfileId());
  }

  function lsGet(baseKey) {
    ensureProfiles();
    try {
      return localStorage.getItem(lsKey(baseKey));
    } catch {
      return null;
    }
  }

  function lsSet(baseKey, value) {
    ensureProfiles();
    localStorage.setItem(lsKey(baseKey), value);
  }

  function lsHas(baseKey) {
    ensureProfiles();
    try {
      return localStorage.getItem(lsKey(baseKey)) != null;
    } catch {
      return false;
    }
  }

  function lsRemove(baseKey) {
    ensureProfiles();
    try {
      localStorage.removeItem(lsKey(baseKey));
    } catch {
      /* ignore */
    }
  }

  function wipeProfileData(profileId) {
    for (const base of PROFILE_SCOPED_KEYS) {
      try {
        localStorage.removeItem(profileStorageKey(base, profileId));
      } catch {
        /* ignore */
      }
    }
  }

  function lsGetRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function lsSetRaw(key, value) {
    localStorage.setItem(key, value);
  }

  function lsRemoveRaw(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function clampPerkRating(n) {
    const i = Math.round(Number(n));
    if (!Number.isFinite(i)) return 0;
    return Math.max(RATING_MIN, Math.min(RATING_MAX, i));
  }

  /**
   * @returns {{ offensive?: number, defensive?: number } | null}
   */
  function normalizePerkRatingEntry(v) {
    if (v == null) return null;
    if (typeof v === "number" || typeof v === "string") {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return { offensive: clampPerkRating(n) };
    }
    if (typeof v !== "object") return null;
    /** @type {{ offensive?: number, defensive?: number }} */
    const entry = {};
    const obj = /** @type {Record<string, unknown>} */ (v);
    for (const axis of RATING_AXES) {
      if (!(axis in obj)) continue;
      const n = Number(obj[axis]);
      if (!Number.isFinite(n)) continue;
      entry[axis] = clampPerkRating(n);
    }
    return Object.keys(entry).length ? entry : null;
  }

  /**
   * @param {string | null} raw
   * @returns {Record<string, { offensive?: number, defensive?: number }>}
   */
  function parsePerkRatingsPayload(raw) {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const bag =
        Number(parsed.v) >= 2 && parsed.overrides && typeof parsed.overrides === "object"
          ? parsed.overrides
          : parsed;
      /** @type {Record<string, { offensive?: number, defensive?: number }>} */
      const out = {};
      for (const [k, v] of Object.entries(bag)) {
        if (k === "v" || k === "overrides") continue;
        if (!ptext(k)) continue;
        const entry = normalizePerkRatingEntry(v);
        if (entry) out[k] = entry;
      }
      return out;
    } catch {
      return {};
    }
  }

  /**
   * @param {Record<string, { offensive?: number, defensive?: number }>} overrides
   */
  function serializePerkRatingsPayload(overrides) {
    return JSON.stringify({ v: PERK_RATINGS_STORE_VERSION, overrides: overrides || {} });
  }

  /**
   * @param {Record<string, { offensive?: number, defensive?: number }>} bag
   * @param {string} name
   * @param {"offensive" | "defensive"} axis
   * @returns {number | null}
   */
  function perkRatingAxisOrNull(bag, name, axis) {
    const entry = bag && bag[name];
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, axis)) return null;
    return entry[axis] || 0;
  }

  /**
   * Profile override wins, then global; null if neither layer sets the axis.
   * @param {Record<string, { offensive?: number, defensive?: number }>} globalBag
   * @param {Record<string, { offensive?: number, defensive?: number }>} profileBag
   * @param {string} name
   * @param {"offensive" | "defensive"} axis
   * @returns {number | null}
   */
  function storedPerkRating(globalBag, profileBag, name, axis) {
    const fromProfile = perkRatingAxisOrNull(profileBag, name, axis);
    if (fromProfile != null) return fromProfile;
    return perkRatingAxisOrNull(globalBag, name, axis);
  }

  /**
   * @param {Record<string, { offensive?: number, defensive?: number }>} globalBag
   * @param {Record<string, { offensive?: number, defensive?: number }>} profileBag
   */
  function mergePerkRatingLayers(globalBag, profileBag) {
    /** @type {Record<string, { offensive?: number, defensive?: number }>} */
    const out = {};
    for (const [name, entry] of Object.entries(globalBag || {})) {
      out[name] = { ...entry };
    }
    for (const [name, entry] of Object.entries(profileBag || {})) {
      out[name] = { ...(out[name] || {}), ...entry };
    }
    return out;
  }

  /**
   * Keep only axes in `bag` that differ from `base` (missing base axis ≠ bag value).
   * @param {Record<string, { offensive?: number, defensive?: number }>} bag
   * @param {Record<string, { offensive?: number, defensive?: number }>} base
   */
  function diffPerkRatingsFromBase(bag, base) {
    /** @type {Record<string, { offensive?: number, defensive?: number }>} */
    const out = {};
    for (const [name, entry] of Object.entries(bag || {})) {
      /** @type {{ offensive?: number, defensive?: number }} */
      const clean = {};
      for (const axis of RATING_AXES) {
        if (!Object.prototype.hasOwnProperty.call(entry, axis)) continue;
        const baseVal = perkRatingAxisOrNull(base, name, axis);
        if (baseVal != null && entry[axis] === baseVal) continue;
        clean[axis] = entry[axis];
      }
      if (Object.keys(clean).length) out[name] = clean;
    }
    return out;
  }

  /**
   * One-time: active profile bag → global; other profiles keep only diffs as overrides.
   */
  function ensurePerkRatingsMigrated() {
    if (perkRatingsMigrated) return;
    try {
      if (lsGetRaw(PERK_RATINGS_LAYER_MIGRATED_KEY) === "1") {
        perkRatingsMigrated = true;
        return;
      }
    } catch {
      /* continue */
    }

    const state = ensureProfiles();
    /** @type {Record<string, Record<string, { offensive?: number, defensive?: number }>>} */
    const bags = {};
    for (const p of state.profiles) {
      bags[p.id] = parsePerkRatingsPayload(lsGetRaw(profileStorageKey(PERK_RATINGS_KEY, p.id)));
    }

    const activeBag = bags[state.activeId] || {};
    lsSetRaw(PERK_RATINGS_GLOBAL_KEY, serializePerkRatingsPayload(activeBag));

    for (const p of state.profiles) {
      const scoped = profileStorageKey(PERK_RATINGS_KEY, p.id);
      if (p.id === state.activeId) {
        lsRemoveRaw(scoped);
        continue;
      }
      const diff = diffPerkRatingsFromBase(bags[p.id] || {}, activeBag);
      if (Object.keys(diff).length) {
        lsSetRaw(scoped, serializePerkRatingsPayload(diff));
      } else {
        lsRemoveRaw(scoped);
      }
    }

    lsRemoveRaw(PERK_RATINGS_KEY);
    lsSetRaw(PERK_RATINGS_LAYER_MIGRATED_KEY, "1");
    perkRatingsMigrated = true;
  }

  function loadGlobalPerkRatings() {
    ensurePerkRatingsMigrated();
    return parsePerkRatingsPayload(lsGetRaw(PERK_RATINGS_GLOBAL_KEY));
  }

  /**
   * @param {Record<string, { offensive?: number, defensive?: number }>} overrides
   */
  function saveGlobalPerkRatings(overrides) {
    ensurePerkRatingsMigrated();
    lsSetRaw(PERK_RATINGS_GLOBAL_KEY, serializePerkRatingsPayload(overrides || {}));
  }

  /**
   * @param {string} [profileId]
   */
  function loadProfilePerkOverrides(profileId) {
    ensurePerkRatingsMigrated();
    const id = ptext(profileId) || activeProfileId();
    return parsePerkRatingsPayload(lsGetRaw(profileStorageKey(PERK_RATINGS_KEY, id)));
  }

  /**
   * @param {string} profileId
   * @param {Record<string, { offensive?: number, defensive?: number }>} overrides
   */
  function saveProfilePerkOverrides(profileId, overrides) {
    ensurePerkRatingsMigrated();
    const id = ptext(profileId);
    if (!id) return;
    const scoped = profileStorageKey(PERK_RATINGS_KEY, id);
    const bag = overrides || {};
    if (Object.keys(bag).length) {
      lsSetRaw(scoped, serializePerkRatingsPayload(bag));
    } else {
      lsRemoveRaw(scoped);
    }
  }

  function loadActivePerkRatingLayers() {
    ensurePerkRatingsMigrated();
    return {
      global: loadGlobalPerkRatings(),
      profile: loadProfilePerkOverrides(activeProfileId()),
    };
  }

  function setActiveProfile(profileId) {
    const state = ensureProfiles();
    if (!state.profiles.some((p) => p.id === profileId)) return false;
    if (state.activeId === profileId) return false;
    state.activeId = profileId;
    saveProfilesState(state);
    return true;
  }

  function addProfile(name) {
    const state = ensureProfiles();
    if (state.profiles.length >= PROFILE_MAX) return null;
    const id = newProfileId();
    const label = ptext(name) || `Profile ${state.profiles.length + 1}`;
    state.profiles.push({ id, name: label });
    saveProfilesState(state);
    return id;
  }

  function renameProfile(profileId, name) {
    const state = ensureProfiles();
    const p = state.profiles.find((x) => x.id === profileId);
    if (!p) return false;
    const label = ptext(name);
    if (!label) return false;
    p.name = label;
    saveProfilesState(state);
    return true;
  }

  function removeProfile(profileId) {
    const state = ensureProfiles();
    if (state.profiles.length <= 1) return false;
    if (!state.profiles.some((p) => p.id === profileId)) return false;
    state.profiles = state.profiles.filter((p) => p.id !== profileId);
    if (state.activeId === profileId) state.activeId = state.profiles[0].id;
    wipeProfileData(profileId);
    saveProfilesState(state);
    return true;
  }

  // Generated from the canonical data/army_catalog.json.
  const ARMY_CATALOG = window.DN_ARMY_CATALOG;
  if (!ARMY_CATALOG) throw new Error("Army catalog is missing");
  const ARMY_UNITS = Object.freeze(ARMY_CATALOG.units.map(u => Object.freeze(u)));
  const ARMY_UNIT_GROUPS = Object.freeze(ARMY_CATALOG.types.map(type => ({
    ...type,
    units: Object.freeze(ARMY_UNITS.filter(u => u.type === type.id)
      .sort((a, b) => a.order - b.order).map(u => u.name)),
  })));
  const ARMY_UNIT_FAMILIES = Object.freeze(ARMY_UNIT_GROUPS.flatMap(g => g.units));
  const ARMY_UNIT_ALIASES = Object.freeze(Object.fromEntries(
    ARMY_UNITS.flatMap(u => u.aliases.map(alias => [alias, u.name]))
  ));
  const ARMY_UNIT_INCLUDES = Object.freeze(Object.fromEntries(
    ARMY_UNITS.filter(u => u.includes.length).map(u => [u.name, Object.freeze(u.includes)])
  ));

  function canonicalArmyFamily(name) {
    const u = text(name);
    return ARMY_UNIT_ALIASES[u] || u;
  }

  function armyUnitType(name) {
    return ARMY_UNITS.find(u => u.name === canonicalArmyFamily(name))?.type || null;
  }

  function perkArmyScope(perkName) {
    const name = polishPerk(perkName);
    const canonical = ARMY_CATALOG.perk_aliases[name] || name;
    return ARMY_CATALOG.perk_scopes[canonical] || null;
  }

  function text(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function show(v) {
    const s = text(v);
    return s || BLANK;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function blankSpan(label) {
    return `<span class="blank">${esc(label)}</span>`;
  }

  /**
   * Normalize { meta, images } or bare map into Record<key, url string>.
   * @param {unknown} doc
   * @returns {Record<string, string>}
   */
  function imageUrlMap(doc) {
    /** @type {Record<string, string>} */
    const out = {};
    if (!doc || typeof doc !== "object") return out;
    const root = /** @type {Record<string, unknown>} */ (doc);
    const images =
      root.images && typeof root.images === "object"
        ? /** @type {Record<string, unknown>} */ (root.images)
        : root;
    for (const [key, v] of Object.entries(images)) {
      if (!key || key === "meta") continue;
      if (typeof v === "string" && v) {
        out[key] = v;
        continue;
      }
      if (v && typeof v === "object") {
        const url = /** @type {Record<string, unknown>} */ (v).url;
        if (typeof url === "string" && url) out[key] = url;
      }
    }
    return out;
  }

  /**
   * Fixed-size thumb slot (same width+height for every row). Image keeps
   * aspect ratio inside via object-fit; missing url → empty slot.
   * @param {string} url
   * @param {string} alt
   * @param {string} [extraClass] size modifier, e.g. entity-thumb--priority
   */
  function thumbHtml(url, alt, extraClass) {
    const src = text(url);
    const frameCls = extraClass
      ? `entity-thumb-frame ${extraClass}`
      : "entity-thumb-frame";
    const img = src
      ? `<img class="entity-thumb" src="${esc(src)}" alt="${esc(alt || "")}"` +
        ` loading="lazy" decoding="async" draggable="false" />`
      : "";
    return (
      `<span class="${frameCls}"${src ? "" : ' aria-hidden="true"'}>${img}</span>`
    );
  }

  function artifactKey(row) {
    const id = text(row.artifact_id);
    if (id) return id;
    return [text(row.name), text(row.grade), text(row.hall)].join("|");
  }

  function loadCollected() {
    try {
      const raw = lsGet(COLLECTED_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((x) => text(x)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function polishPerk(name) {
    return text(name).replace(/\s+/g, " ");
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseMappingCsv(textCsv) {
    /** @type {Record<string, string>} */
    const map = {};
    const lines = textCsv.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines.length < 2) return map;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCsvLine(line);
      const raw = text(cols[0]);
      const canon = polishPerk(text(cols[1]));
      if (!raw || !canon) continue;
      const prev = map[raw];
      if (!prev || (canon.includes(" & ") && !prev.includes(" & "))) {
        map[raw] = canon;
      }
    }
    return map;
  }

  function makeCanonPerk(perkCanon) {
    return function canonPerk(name) {
      const n = polishPerk(name);
      if (!n) return "";
      return polishPerk(perkCanon[n] || n);
    };
  }

  /**
   * @returns {{ index: number, name: string, rawName: string, base: number | null, max: number | null }[]}
   */
  function perksOf(row, canonPerk) {
    const out = [];
    for (let i = 1; i <= 6; i++) {
      const rawName = text(row[`perk_${i}_name`]);
      const baseRaw = text(row[`perk_${i}_base`]);
      const maxRaw = text(row[`perk_${i}_max`]);
      if (!rawName && !baseRaw && !maxRaw) continue;
      const baseN = baseRaw === "" ? null : Number(baseRaw);
      const maxN = maxRaw === "" ? null : Number(maxRaw);
      out.push({
        index: i,
        name: canonPerk(rawName) || rawName,
        rawName,
        base: Number.isFinite(baseN) ? baseN : null,
        max: Number.isFinite(maxN) ? maxN : null,
      });
    }
    return out;
  }

  /**
   * Resolve editable range. Legendary/Mythical store base→max in data
   * (max usually base±9). Blank max falls back to a fixed single value
   * (e.g. special ±1 non-% perks).
   * @returns {{ base: number | null, max: number | null }}
   */
  function effectivePerkRange(perk) {
    if (!perk || perk.base == null || !Number.isFinite(perk.base)) {
      return { base: null, max: null };
    }
    if (perk.max != null && Number.isFinite(perk.max)) {
      return { base: perk.base, max: perk.max };
    }
    return { base: perk.base, max: perk.base };
  }

  /** Clamp current along the base→max upgrade path. */
  function clampPerkLevel(base, max, current) {
    if (!Number.isFinite(base) || !Number.isFinite(max)) {
      return Number.isFinite(current) ? current : 0;
    }
    const lo = Math.min(base, max);
    const hi = Math.max(base, max);
    const n = Number.isFinite(current) ? current : base;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }

  /** dir +1 toward max (upgrade), -1 toward base. */
  function stepPerkLevel(base, max, current, dir) {
    if (!Number.isFinite(base) || !Number.isFinite(max)) return current;
    const step = Math.sign(max - base) || 1;
    const next = current + (dir >= 0 ? step : -step);
    return clampPerkLevel(base, max, next);
  }

  function emptyHallLoadout() {
    return {
      mains: /** @type {string[]} */ ([]),
      singles: /** @type {Record<string, number>} */ ({}),
      hermitage: /** @type {string | null} */ (null),
    };
  }

  function normalizeLoadout(raw) {
    /** @type {{ Main: ReturnType<typeof emptyHallLoadout>, War: ReturnType<typeof emptyHallLoadout> }} */
    const out = { Main: emptyHallLoadout(), War: emptyHallLoadout() };
    if (!raw || typeof raw !== "object") return out;
    for (const hall of ["Main", "War"]) {
      const src = raw[hall];
      if (!src || typeof src !== "object") continue;
      const mains = Array.isArray(src.mains)
        ? src.mains.map((x) => text(x)).filter(Boolean)
        : [];
      /** @type {Record<string, number>} */
      const singles = {};
      if (src.singles && typeof src.singles === "object") {
        for (const [id, idx] of Object.entries(src.singles)) {
          const key = text(id);
          const n = Number(idx);
          if (!key || !Number.isFinite(n) || n < 1 || n > 6) continue;
          singles[key] = Math.round(n);
        }
      }
      let hermitage = src.hermitage != null ? text(src.hermitage) : "";
      if (!hermitage) hermitage = "";
      // Mutual exclusion: Hall / Hermitage / Showcase.
      if (hermitage) {
        const mi = mains.indexOf(hermitage);
        if (mi >= 0) mains.splice(mi, 1);
        delete singles[hermitage];
      }
      for (const id of mains) delete singles[id];
      out[hall] = { mains, singles, hermitage: hermitage || null };
    }
    return out;
  }

  function loadLoadout() {
    try {
      const raw = lsGet(LOADOUT_KEY);
      if (!raw) return normalizeLoadout(null);
      return normalizeLoadout(JSON.parse(raw));
    } catch {
      return normalizeLoadout(null);
    }
  }

  function saveLoadout(loadout) {
    lsSet(LOADOUT_KEY, JSON.stringify(loadout));
  }

  function artifactSlots(id) {
    const loadout = loadLoadout();
    const slots = [];
    for (const hall of ["Main", "War"]) {
      const entry = loadout[hall];
      if (entry.mains.includes(id)) slots.push(`${hall} Hall`);
      if (entry.hermitage === id) slots.push(`${hall} Hermitage`);
      if (Object.prototype.hasOwnProperty.call(entry.singles, id)) slots.push(`${hall} Showcase`);
    }
    return slots;
  }

  function removeArtifactSlots(id) {
    const loadout = loadLoadout();
    for (const hall of ["Main", "War"]) {
      const entry = loadout[hall];
      entry.mains = entry.mains.filter((key) => key !== id);
      if (entry.hermitage === id) entry.hermitage = null;
      delete entry.singles[id];
    }
    saveLoadout(loadout);
  }

  function confirmUncollect(name, slots) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "ratings-dialog uncollect-dialog";
      dialog.setAttribute("aria-labelledby", "uncollect-title");
      dialog.setAttribute("aria-describedby", "uncollect-hint");
      dialog.innerHTML =
        '<form method="dialog" class="ratings-form">' +
        '<header class="ratings-header"><h2 id="uncollect-title">Remove collected item?</h2>' +
        '<p id="uncollect-hint" class="ratings-hint"></p></header>' +
        '<footer class="ratings-footer">' +
        '<button type="submit" class="btn" value="cancel" autofocus>Cancel</button>' +
        '<button type="submit" class="btn btn-accent" value="remove">Remove</button>' +
        '</footer></form>';
      dialog.querySelector(".ratings-hint").textContent =
        `${name} is currently in ${slots.join(", ")}. Are you sure? Removing ownership will also clear its collection slot.`;
      dialog.addEventListener("close", () => {
        const confirmed = dialog.returnValue === "remove";
        dialog.remove();
        resolve(confirmed);
      }, { once: true });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  function loadLevels() {
    try {
      const raw = lsGet(LEVELS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      /** @type {Record<string, Record<string, number>>} */
      const out = {};
      for (const [id, perks] of Object.entries(parsed)) {
        const key = text(id);
        if (!key || !perks || typeof perks !== "object") continue;
        /** @type {Record<string, number>} */
        const entry = {};
        for (const [idx, val] of Object.entries(perks)) {
          const n = Number(val);
          if (!Number.isFinite(n)) continue;
          entry[String(idx)] = Math.round(n);
        }
        if (Object.keys(entry).length) out[key] = entry;
      }
      return out;
    } catch {
      return {};
    }
  }

  function saveLevels(levels) {
    lsSet(LEVELS_KEY, JSON.stringify(levels));
  }

  function loadCollectionUi() {
    try {
      const raw = lsGet(COLLECTION_UI_KEY);
      if (!raw) return { hall: "Main", valueMode: "actual", viewMode: "list" };
      const parsed = JSON.parse(raw);
      const hall = parsed && parsed.hall === "War" ? "War" : "Main";
      const valueMode = parsed && parsed.valueMode === "max" ? "max" : "actual";
      const viewMode = parsed && parsed.viewMode === "structured" ? "structured" : "list";
      return { hall, valueMode, viewMode };
    } catch {
      return { hall: "Main", valueMode: "actual", viewMode: "list" };
    }
  }

  function saveCollectionUi(ui) {
    lsSet(COLLECTION_UI_KEY, JSON.stringify(ui));
  }

  /** @returns {string | null} troop family for a perk name, else null */
  function unitFamily(perkName) {
    const scope = perkArmyScope(perkName);
    if (scope?.kind === "unit") return scope.unit;
    if (scope?.kind === "type") return ARMY_UNIT_GROUPS.find(g => g.id === scope.type)?.label || null;
    return null;
  }

  function isUnitPerk(perkName) {
    return unitFamily(perkName) != null;
  }

  /**
   * @param {string} family
   * @param {Iterable<string>} perkNames
   * @returns {string[]}
   */
  function perksForFamily(family, perkNames) {
    const fam = text(family);
    if (!fam) return [];
    const out = [];
    for (const name of perkNames) {
      if (unitFamily(name) === fam) out.push(name);
    }
    return out;
  }

  function newArmyPresetId() {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function emptyArmyState() {
    const id = "p1";
    return {
      v: 1,
      activeId: id,
      lastApplied: /** @type {string[]} */ ([]),
      presets: [{ id, name: "Preset 1", units: /** @type {string[]} */ ([]) }],
    };
  }

  /** Expand a unit set with one-way includes (e.g. APC → Heavy Infantry). */
  function expandArmyUnitsWithLinks(units) {
    const allowed = new Set(ARMY_UNIT_FAMILIES);
    const out = new Set();
    for (const item of units || []) {
      const u = canonicalArmyFamily(text(item));
      if (!u || !allowed.has(u)) continue;
      out.add(u);
      const deps = ARMY_UNIT_INCLUDES[u];
      if (deps) {
        for (const other of deps) {
          if (allowed.has(other)) out.add(other);
        }
      }
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  /** Units this family pulls in (one-way). */
  function armyIncludes(unit) {
    const u = text(unit);
    return ARMY_UNIT_INCLUDES[u] ? [...ARMY_UNIT_INCLUDES[u]] : [];
  }

  /** Units that pull this family in (reverse lookup for UI notes). */
  function armyIncludedBy(unit) {
    const u = text(unit);
    const parents = [];
    for (const [parent, deps] of Object.entries(ARMY_UNIT_INCLUDES)) {
      if (deps.includes(u)) parents.push(parent);
    }
    return parents;
  }

  function normalizeArmyUnits(raw) {
    const allowed = new Set(ARMY_UNIT_FAMILIES);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
      const u = canonicalArmyFamily(text(item));
      if (!u || !allowed.has(u) || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
  }

  /**
   * Families whose ratings should change when `changed` were added/removed.
   * Includes one-way deps (APC → Heavy Infantry) only when the dep is not
   * still explicitly selected in `explicitNext`.
   * @param {string[]} changed
   * @param {Iterable<string>} explicitNext
   */
  function armyRatingFamilies(changed, explicitNext) {
    const keep = new Set(
      [...(explicitNext || [])].map((u) => canonicalArmyFamily(text(u))).filter(Boolean)
    );
    const out = new Set();
    for (const u of changed || []) {
      const name = canonicalArmyFamily(text(u));
      if (!name) continue;
      out.add(name);
      for (const dep of armyIncludes(name)) {
        if (!keep.has(dep)) out.add(dep);
      }
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  function normalizeArmyPresets(raw) {
    const empty = emptyArmyState();
    if (!raw || typeof raw !== "object") return empty;

    const presetsIn = Array.isArray(raw.presets) ? raw.presets : [];
    /** @type {{ id: string, name: string, units: string[] }[]} */
    const presets = [];
    const seenIds = new Set();
    for (const src of presetsIn) {
      if (!src || typeof src !== "object") continue;
      if (presets.length >= ARMY_PRESET_MAX) break;
      let id = text(src.id);
      if (!id || seenIds.has(id)) id = newArmyPresetId();
      seenIds.add(id);
      const name = text(src.name) || `Preset ${presets.length + 1}`;
      presets.push({ id, name, units: normalizeArmyUnits(src.units) });
    }
    if (!presets.length) return empty;

    let activeId = text(raw.activeId);
    if (!presets.some((p) => p.id === activeId)) activeId = presets[0].id;

    return {
      v: 1,
      activeId,
      lastApplied: normalizeArmyUnits(raw.lastApplied),
      presets,
    };
  }

  function loadArmyPresets() {
    try {
      const raw = lsGet(ARMY_PRESETS_KEY);
      if (!raw) return normalizeArmyPresets(null);
      return normalizeArmyPresets(JSON.parse(raw));
    } catch {
      return normalizeArmyPresets(null);
    }
  }

  function saveArmyPresets(state) {
    lsSet(ARMY_PRESETS_KEY, JSON.stringify(normalizeArmyPresets(state)));
  }

  /** Explicit lastApplied units (what the user selected). */
  function armyLastAppliedSet(state) {
    const s = state || loadArmyPresets();
    return new Set(normalizeArmyUnits(s.lastApplied));
  }

  /**
   * Effective units for default gating: explicit selection plus one-way includes
   * (APC selected ⇒ Heavy Infantry defaults apply, without HI appearing selected).
   */
  function armyEffectiveAppliedSet(stateOrUnits) {
    const units = Array.isArray(stateOrUnits) || stateOrUnits instanceof Set
      ? [...stateOrUnits] : (stateOrUnits || loadArmyPresets()).lastApplied;
    const applied = new Set(expandArmyUnitsWithLinks(units));
    for (const group of ARMY_UNIT_GROUPS) {
      if (group.units.some(unit => applied.has(unit))) applied.add(group.label);
    }
    return applied;
  }

  // A group's ratings change only on its first added or last removed unit.
  function armyGroupRatingChanges(before, after) {
    const prev = armyEffectiveAppliedSet(before), next = armyEffectiveAppliedSet(after);
    return {
      removed: ARMY_UNIT_GROUPS.filter(g => prev.has(g.label) && !next.has(g.label)).map(g => g.label),
      added: ARMY_UNIT_GROUPS.filter(g => !prev.has(g.label) && next.has(g.label)).map(g => g.label),
    };
  }

  /**
   * Factory default for a perk axis, gated by army lastApplied for unit perks.
   * @param {Record<string, { offensive: number, defensive: number }>} factoryDefaults
   * @param {Set<string> | string[]} lastApplied explicit or already-expanded set
   * @param {string} perkName
   * @param {"offensive" | "defensive"} axis
   * @param {{ expanded?: boolean }} [opts] if expanded, lastApplied is already effective
   */
  function armyAwareDefault(factoryDefaults, lastApplied, perkName, axis, opts) {
    const fam = unitFamily(perkName);
    if (fam) {
      const applied = opts && opts.expanded
        ? (lastApplied instanceof Set ? lastApplied : new Set(lastApplied || []))
        : armyEffectiveAppliedSet(lastApplied || []);
      if (!applied.has(fam)) return 0;
    }
    const entry = factoryDefaults && factoryDefaults[perkName];
    if (!entry) return 0;
    const n = Number(entry[axis]);
    return Number.isFinite(n) ? n : 0;
  }

  window.DN = {
    COLLECTED_KEY,
    LOADOUT_KEY,
    LEVELS_KEY,
    COLLECTION_UI_KEY,
    ARMY_PRESETS_KEY,
    ARMY_PRESET_MAX,
    PROFILES_KEY,
    PROFILE_MAX,
    PERK_RATINGS_KEY,
    PERK_RATINGS_GLOBAL_KEY,
    PERK_RATINGS_STORE_VERSION,
    RATING_MIN,
    RATING_MAX,
    RATING_AXES,
    ARMY_CATALOG,
    ARMY_UNITS,
    armyUnitType,
    perkArmyScope,
    armyGroupRatingChanges,
    ARMY_UNIT_GROUPS,
    ARMY_UNIT_FAMILIES,
    ARMY_UNIT_INCLUDES,
    BLANK,
    text,
    show,
    esc,
    blankSpan,
    imageUrlMap,
    thumbHtml,
    /**
     * Compact label for multi-select filter buttons.
     * Shows joined values when short; otherwise "N units · MODE".
     * @param {string} emptyLabel
     * @param {Iterable<string>} selected
     * @param {{ order?: string[], join?: string, maxLen?: number, unit?: string, mode?: string | null }} [opts]
     */
    formatMultiSummary(emptyLabel, selected, opts = {}) {
      const join = opts.join != null ? opts.join : " · ";
      const maxLen = typeof opts.maxLen === "number" ? opts.maxLen : 34;
      const unit = opts.unit || "item";
      const mode = opts.mode || null;
      const set = selected instanceof Set ? selected : new Set(selected);
      let list;
      if (Array.isArray(opts.order) && opts.order.length) {
        list = opts.order.filter((v) => set.has(v));
      } else {
        list = [...set];
      }
      if (!list.length) return emptyLabel;
      const suffix = mode ? ` · ${mode}` : "";
      if (list.length === 1) return `${list[0]}${suffix}`;
      const joined = list.join(join);
      if (joined.length + suffix.length <= maxLen) return `${joined}${suffix}`;
      const plural = list.length === 1 ? unit : `${unit}s`;
      return `${list.length} ${plural}${suffix}`;
    },
    artifactKey,
    loadCollected,
    polishPerk,
    parseMappingCsv,
    makeCanonPerk,
    perksOf,
    effectivePerkRange,
    clampPerkLevel,
    stepPerkLevel,
    emptyHallLoadout,
    normalizeLoadout,
    loadLoadout,
    saveLoadout,
    artifactSlots,
    removeArtifactSlots,
    confirmUncollect,
    loadLevels,
    saveLevels,
    loadCollectionUi,
    saveCollectionUi,
    unitFamily,
    isUnitPerk,
    perksForFamily,
    newArmyPresetId,
    emptyArmyState,
    expandArmyUnitsWithLinks,
    armyIncludes,
    armyIncludedBy,
    armyRatingFamilies,
    normalizeArmyUnits,
    normalizeArmyPresets,
    loadArmyPresets,
    saveArmyPresets,
    armyLastAppliedSet,
    armyEffectiveAppliedSet,
    armyAwareDefault,
    lsGet,
    lsSet,
    lsHas,
    lsRemove,
    ensureProfiles,
    activeProfileId,
    activeProfile,
    setActiveProfile,
    addProfile,
    renameProfile,
    removeProfile,
    clampPerkRating,
    normalizePerkRatingEntry,
    parsePerkRatingsPayload,
    serializePerkRatingsPayload,
    perkRatingAxisOrNull,
    storedPerkRating,
    mergePerkRatingLayers,
    diffPerkRatingsFromBase,
    ensurePerkRatingsMigrated,
    loadGlobalPerkRatings,
    saveGlobalPerkRatings,
    loadProfilePerkOverrides,
    saveProfilePerkOverrides,
    loadActivePerkRatingLayers,
  };

  ensureProfiles();
  ensurePerkRatingsMigrated();
})();
