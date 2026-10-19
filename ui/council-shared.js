(() => {
  "use strict";

  const BLANK = "—";
  const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const ACTIVE_CAP = 7;
  const RATING_MIN = -10;
  const RATING_MAX = 10;
  const AXES = /** @type {const} */ (["offensive", "defensive"]);

  const OWNED_KEY = "dn-council-owned";
  const ACTIVE_KEY = "dn-council-active";
  const RATINGS_KEY = "dn-council-stat-ratings";
  const RATINGS_STORE_VERSION = 2;
  const UI_KEY = "dn-council-ui";
  const PREF_SORT_AXES_KEY = "dn-council-pref-sort-axes";
  const HIDE_OWNED_KEY = "dn-council-hide-owned";
  const SCORE_MODE_KEY = "dn-council-score-mode";

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

  function clampRating(n) {
    const i = Math.round(n);
    return Math.max(RATING_MIN, Math.min(RATING_MAX, i));
  }

  /** Normalize UI mode: Main (multiplayer bonuses) or War. Accepts legacy "multiplayer". */
  function normalizeMode(mode) {
    const s = text(mode).toLowerCase();
    if (s === "main" || s === "multiplayer") return "main";
    return "war";
  }

  function modeLabel(mode) {
    return normalizeMode(mode) === "main" ? "Main" : "War";
  }

  /** Hall flag used in owned store for a UI mode. */
  function modeToHall(mode) {
    return normalizeMode(mode) === "main" ? "Main" : "War";
  }

  /** JSON bag key. Source data keeps multiplayerBonuses; UI calls that Main. */
  function modeKey(mode) {
    return normalizeMode(mode) === "main" ? "multiplayerBonuses" : "warBonuses";
  }

  function normalizeRarity(r) {
    const s = text(r);
    return RARITIES.includes(s) ? s : "Legendary";
  }

  /** @returns {{ stat: string, value: string }[]} */
  function bonusesOf(row, mode, rarity) {
    if (!row) return [];
    const bag = row[modeKey(mode)];
    if (!bag || typeof bag !== "object") return [];
    const list = bag[normalizeRarity(rarity)];
    return Array.isArray(list) ? list : [];
  }

  /** @returns {string[]} */
  function statsOf(row, mode, rarity) {
    return bonusesOf(row, mode, rarity)
      .map((b) => text(b.stat))
      .filter(Boolean);
  }

  /**
   * Normalize an owned entry. Must have Main and/or War.
   * Legacy `{ rarity }` / string → both halls (preserve prior ownership).
   * @returns {{ rarity: string, main: boolean, war: boolean } | null}
   */
  function normalizeOwnedEntry(v) {
    if (v == null) return null;
    if (typeof v === "string") {
      return { rarity: normalizeRarity(v), main: true, war: true };
    }
    if (typeof v !== "object" || Array.isArray(v)) return null;
    const rarity = normalizeRarity(v.rarity);
    const hasHallFlags =
      Object.prototype.hasOwnProperty.call(v, "main") ||
      Object.prototype.hasOwnProperty.call(v, "war") ||
      Object.prototype.hasOwnProperty.call(v, "halls");
    let main = false;
    let war = false;
    if (Array.isArray(v.halls)) {
      main = v.halls.some((h) => text(h) === "Main");
      war = v.halls.some((h) => text(h) === "War");
    }
    if (Object.prototype.hasOwnProperty.call(v, "main")) main = !!v.main;
    if (Object.prototype.hasOwnProperty.call(v, "war")) war = !!v.war;
    // Legacy owned with rarity only → treat as both halls.
    if (!hasHallFlags) {
      main = true;
      war = true;
    }
    if (!main && !war) return null;
    return { rarity, main, war };
  }

  function isOwnedEntry(entry) {
    return !!(entry && (entry.main || entry.war));
  }

  /** Owned for the hall matching the current Main/War mode. */
  function isOwnedForMode(entry, mode) {
    if (!entry) return false;
    return normalizeMode(mode) === "main" ? !!entry.main : !!entry.war;
  }

  function ownedHallsLabel(entry) {
    if (!isOwnedEntry(entry)) return "";
    const parts = [];
    if (entry.main) parts.push("Main");
    if (entry.war) parts.push("War");
    return parts.join("+");
  }

  /**
   * Toggle Main or War on an owned entry. Clears ownership if both off.
   * @param {Record<string, { rarity: string, main: boolean, war: boolean }>} owned
   * @param {string} id
   * @param {"Main"|"War"} hall
   * @param {boolean} on
   * @param {string} [rarityDefault]
   * @returns {boolean} true if still owned
   */
  function setOwnedHall(owned, id, hall, on, rarityDefault) {
    const key = text(id);
    if (!key || (hall !== "Main" && hall !== "War")) return false;
    const prev = owned[key];
    const entry = prev
      ? { rarity: normalizeRarity(prev.rarity), main: !!prev.main, war: !!prev.war }
      : { rarity: normalizeRarity(rarityDefault), main: false, war: false };
    if (hall === "Main") entry.main = !!on;
    else entry.war = !!on;
    if (!entry.main && !entry.war) {
      delete owned[key];
      return false;
    }
    owned[key] = entry;
    return true;
  }

  /** @returns {Record<string, { rarity: string, main: boolean, war: boolean }>} */
  function loadOwned() {
    try {
      const raw = window.DN ? window.DN.lsGet(OWNED_KEY) : localStorage.getItem(OWNED_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      /** @type {Record<string, { rarity: string, main: boolean, war: boolean }>} */
      const out = {};
      for (const [id, v] of Object.entries(parsed)) {
        const key = text(id);
        if (!key) continue;
        const entry = normalizeOwnedEntry(v);
        if (entry) out[key] = entry;
      }
      return out;
    } catch {
      return {};
    }
  }

  function saveOwned(owned) {
    /** @type {Record<string, { rarity: string, main: boolean, war: boolean }>} */
    const clean = {};
    if (owned && typeof owned === "object") {
      for (const [id, v] of Object.entries(owned)) {
        const key = text(id);
        const entry = normalizeOwnedEntry(v);
        if (key && entry) clean[key] = entry;
      }
    }
    const payload = JSON.stringify(clean);
    if (window.DN) window.DN.lsSet(OWNED_KEY, payload);
    else localStorage.setItem(OWNED_KEY, payload);
  }

  /** @returns {string[]} */
  function loadActive() {
    try {
      const raw = window.DN ? window.DN.lsGet(ACTIVE_KEY) : localStorage.getItem(ACTIVE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((x) => text(x)).filter(Boolean).slice(0, ACTIVE_CAP);
    } catch {
      return [];
    }
  }

  function saveActive(active) {
    const payload = JSON.stringify(active.slice(0, ACTIVE_CAP));
    if (window.DN) window.DN.lsSet(ACTIVE_KEY, payload);
    else localStorage.setItem(ACTIVE_KEY, payload);
  }

  function loadUi() {
    try {
      const raw = window.DN ? window.DN.lsGet(UI_KEY) : localStorage.getItem(UI_KEY);
      if (!raw) return { mode: "war", rarity: "Legendary", statMatch: "and" };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { mode: "war", rarity: "Legendary", statMatch: "and" };
      }
      const mode = normalizeMode(parsed.mode);
      const statMatch = parsed.statMatch === "or" ? "or" : "and";
      return { mode, rarity: normalizeRarity(parsed.rarity), statMatch };
    } catch {
      return { mode: "war", rarity: "Legendary", statMatch: "and" };
    }
  }

  function saveUi(ui) {
    const payload = JSON.stringify({
      mode: normalizeMode(ui && ui.mode),
      rarity: normalizeRarity(ui && ui.rarity),
      statMatch: ui && ui.statMatch === "or" ? "or" : "and",
    });
    if (window.DN) window.DN.lsSet(UI_KEY, payload);
    else localStorage.setItem(UI_KEY, payload);
  }

  function loadPrefSortAxes() {
    try {
      const raw = window.DN ? window.DN.lsGet(PREF_SORT_AXES_KEY) : localStorage.getItem(PREF_SORT_AXES_KEY);
      if (!raw) return { offensive: true, defensive: true };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { offensive: true, defensive: true };
      const off = parsed.offensive !== false;
      const def = parsed.defensive !== false;
      if (!off && !def) return { offensive: true, defensive: true };
      return { offensive: off, defensive: def };
    } catch {
      return { offensive: true, defensive: true };
    }
  }

  function savePrefSortAxes(axes) {
    const payload = JSON.stringify(axes);
    if (window.DN) window.DN.lsSet(PREF_SORT_AXES_KEY, payload);
    else localStorage.setItem(PREF_SORT_AXES_KEY, payload);
  }

  function loadHideOwned() {
    const raw = window.DN ? window.DN.lsGet(HIDE_OWNED_KEY) : localStorage.getItem(HIDE_OWNED_KEY);
    return raw === "1";
  }

  function saveHideOwned(hide) {
    const payload = hide ? "1" : "0";
    if (window.DN) window.DN.lsSet(HIDE_OWNED_KEY, payload);
    else localStorage.setItem(HIDE_OWNED_KEY, payload);
  }

  function normalizeRatingEntry(v) {
    if (typeof v === "number" && Number.isFinite(v)) {
      return { offensive: clampRating(v) };
    }
    if (!v || typeof v !== "object") return null;
    /** @type {{ offensive?: number, defensive?: number }} */
    const out = {};
    if (typeof v.offensive === "number" && Number.isFinite(v.offensive)) {
      out.offensive = clampRating(v.offensive);
    }
    if (typeof v.defensive === "number" && Number.isFinite(v.defensive)) {
      out.defensive = clampRating(v.defensive);
    }
    return Object.keys(out).length ? out : null;
  }

  function normalizeDefaultEntry(v) {
    if (!v || typeof v !== "object") return null;
    /** @type {{ offensive: number, defensive: number }} */
    const out = {
      offensive: typeof v.offensive === "number" && Number.isFinite(v.offensive) ? clampRating(v.offensive) : 0,
      defensive: typeof v.defensive === "number" && Number.isFinite(v.defensive) ? clampRating(v.defensive) : 0,
    };
    return out;
  }

  function loadRatingsRaw() {
    try {
      const raw = window.DN ? window.DN.lsGet(RATINGS_KEY) : localStorage.getItem(RATINGS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function migrateRatings(raw) {
    if (!raw) return {};
    if (raw && typeof raw === "object" && raw.v >= RATINGS_STORE_VERSION && raw.ratings) {
      return raw.ratings;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw.v === 1 || !raw.v)) {
      return Object.fromEntries(Object.entries(sanitizeOverrides(raw.ratings || raw)).map(([name, values]) =>
        [name, Object.fromEntries(Object.entries(values).map(([axis, value]) => [axis, clampRating(value * 2)]))]));
    }
    return {};
  }

  function sanitizeOverrides(raw) {
    /** @type {Record<string, { offensive?: number, defensive?: number }>} */
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw)) {
      const name = text(k);
      const entry = normalizeRatingEntry(v);
      if (!name || !entry) continue;
      out[name] = entry;
    }
    return out;
  }

  /**
   * Collapse alias keys onto canonical names (artifact perk_name_mapping).
   * Last write wins per axis when merging.
   * @param {Record<string, { offensive?: number, defensive?: number }>} overrides
   * @param {(name: string) => string} canonStat
   */
  function remapOverrides(overrides, canonStat) {
    /** @type {Record<string, { offensive?: number, defensive?: number }>} */
    const out = {};
    if (!overrides || typeof overrides !== "object") return out;
    const mapFn = typeof canonStat === "function" ? canonStat : (n) => n;
    for (const [k, v] of Object.entries(overrides)) {
      const entry = normalizeRatingEntry(v);
      if (!entry) continue;
      const canon = text(mapFn(k)) || text(k);
      if (!canon) continue;
      const prev = out[canon] || {};
      out[canon] = { ...prev, ...entry };
    }
    return out;
  }

  /**
   * @param {Record<string, { offensive: number, defensive: number }>} defaults
   * @param {(name: string) => string} canonStat
   */
  function remapDefaults(defaults, canonStat) {
    /** @type {Record<string, { offensive: number, defensive: number }>} */
    const out = {};
    if (!defaults || typeof defaults !== "object") return out;
    const mapFn = typeof canonStat === "function" ? canonStat : (n) => n;
    for (const [k, v] of Object.entries(defaults)) {
      const entry = normalizeDefaultEntry(v);
      if (!entry) continue;
      const canon = text(mapFn(k)) || text(k);
      if (!canon) continue;
      out[canon] = entry;
    }
    return out;
  }

  function saveRatings(ratings) {
    const payload = JSON.stringify({ v: RATINGS_STORE_VERSION, ratings });
    if (window.DN) window.DN.lsSet(RATINGS_KEY, payload);
    else localStorage.setItem(RATINGS_KEY, payload);
  }

  function parsePercent(value) {
    const s = text(value).replace(/%/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** Absolute magnitude of a bonus value string (e.g. "+16%" → 16). */
  function bonusMagnitude(value) {
    const n = parsePercent(value);
    return n == null ? 0 : Math.abs(n);
  }

  /** @returns {"combined" | "maxrow"} */
  function loadScoreMode() {
    const raw = window.DN ? window.DN.lsGet(SCORE_MODE_KEY) : localStorage.getItem(SCORE_MODE_KEY);
    return raw === "maxrow" ? "maxrow" : "combined";
  }

  /** @param {"combined" | "maxrow"} mode */
  function saveScoreMode(mode) {
    const payload = mode === "maxrow" ? "maxrow" : "combined";
    if (window.DN) window.DN.lsSet(SCORE_MODE_KEY, payload);
    else localStorage.setItem(SCORE_MODE_KEY, payload);
  }

  window.DNCouncil = {
    BLANK,
    RARITIES,
    ACTIVE_CAP,
    RATING_MIN,
    RATING_MAX,
    AXES,
    text,
    show,
    esc,
    blankSpan,
    clampRating,
    normalizeMode,
    modeLabel,
    modeToHall,
    modeKey,
    normalizeRarity,
    normalizeOwnedEntry,
    isOwnedEntry,
    isOwnedForMode,
    ownedHallsLabel,
    setOwnedHall,
    bonusesOf,
    statsOf,
    loadOwned,
    saveOwned,
    loadActive,
    saveActive,
    loadUi,
    saveUi,
    loadPrefSortAxes,
    savePrefSortAxes,
    loadHideOwned,
    saveHideOwned,
    normalizeRatingEntry,
    normalizeDefaultEntry,
    loadRatingsRaw,
    migrateRatings,
    sanitizeOverrides,
    remapOverrides,
    remapDefaults,
    saveRatings,
    parsePercent,
    bonusMagnitude,
    SCORE_MODE_KEY,
    loadScoreMode,
    saveScoreMode,
  };
})();
