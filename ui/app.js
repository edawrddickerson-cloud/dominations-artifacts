/*
 * Authority: Existing artifact priority behavior; approved scanner Phase 3 reuse.
 * Ownership: Catalogue UI and effective rating state; artifact-scoring.js owns arithmetic.
 * Invariants: Preserve canonical names, global/group/profile precedence, army fallback,
 * enabled axes and Hall/Showcase selection. Scanner integration must not change scores.
 * History: Private arithmetic extracted unchanged for scanner/manual-input reuse.
 */
(() => {
  "use strict";

  const DATA_URL = "./data/artifacts.json";
  const IMAGES_URL = "./data/artifact_images.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";
  const DEFAULTS_URL = "./data/perk_rating_defaults.json";
  const BLANK = "—";
  const PREF_SORT_AXES_KEY = "dn-artifact-pref-sort-axes";
  const SCORE_MODE_KEY = "dn-artifact-score-mode";
  const COLLECTED_KEY = "dn-artifact-collected";
  const HIDE_COLLECTED_KEY = "dn-artifact-hide-collected";
  const HALL_FILTER_KEY = "dn-artifact-hall-filter";
  const GRADE_FILTER_KEY = "dn-artifact-grade-filter";
  const PERK_MATCH_KEY = "dn-artifact-perk-match-mode";
  const RATING_MIN = window.DN ? window.DN.RATING_MIN : -5;
  const RATING_MAX = window.DN ? window.DN.RATING_MAX : 5;
  const AXES = window.DN
    ? window.DN.RATING_AXES
    : /** @type {const} */ (["offensive", "defensive"]);

  const el = {
    q: document.getElementById("q"),
    hallMain: document.getElementById("hall-main"),
    hallWar: document.getElementById("hall-war"),
    gradeAll: document.getElementById("grade-all"),
    gradeLeg: document.getElementById("grade-leg"),
    gradeMyth: document.getElementById("grade-myth"),
    tbody: document.getElementById("tbody"),
    error: document.getElementById("error"),
    table: document.getElementById("table"),
    perkFilter: document.getElementById("perk-filter"),
    perkFilterBtn: document.getElementById("perk-filter-btn"),
    perkFilterPanel: document.getElementById("perk-filter-panel"),
    perkFilterQ: document.getElementById("perk-filter-q"),
    perkFilterList: document.getElementById("perk-filter-list"),
    perkFilterClear: document.getElementById("perk-filter-clear"),
    perkMatchAnd: document.getElementById("perk-match-and"),
    perkMatchOr: document.getElementById("perk-match-or"),
    costFilter: document.getElementById("cost-filter"),
    costFilterBtn: document.getElementById("cost-filter-btn"),
    costFilterPanel: document.getElementById("cost-filter-panel"),
    costFilterClear: document.getElementById("cost-filter-clear"),
    sortOff: document.getElementById("sort-off"),
    sortDef: document.getElementById("sort-def"),
    scoreCombined: document.getElementById("score-combined"),
    scoreMaxrow: document.getElementById("score-maxrow"),
    collectedHide: document.getElementById("collected-hide"),
    collectedShow: document.getElementById("collected-show"),
  };

  /** @type {object[]} */
  let rows = [];
  let catalogRows=[],inventoryRefresh=0;

  /** @type {string[]} canonical perk names shown in filters / ratings */
  let allPerkNames = [];

  /** @type {Record<string, string>} raw → canonical */
  let perkCanon = {};

  /** @type {Set<string>} */
  let selectedPerks = new Set();

  /** @type {Set<string>} cost tier keys: "1000" | "300" | "100" | "unknown" */
  let selectedCostTiers = new Set();

  /** Hall filter: Main or War (no All). Default War. */
  let hallFilter = "War";

  /** Grade filter: "" | "Legendary" | "Mythical". */
  let gradeFilter = "";

  /** Perk match mode for multi-select. */
  let perkMatchMode = "and";

  /**
   * Factory defaults from data/perk_rating_defaults.json (the DB).
   * Every perk has offensive + defensive (may be 0).
   * @type {Record<string, { offensive: number, defensive: number }>}
   */
  let defaultRatings = {};

  /**
   * User overrides only (localStorage). Missing axis → use factory default.
   * Explicit 0 is kept when it differs from the default.
   * @type {Record<string, { offensive?: number, defensive?: number }>}
   */
  let ratings = {};
  let strategyContexts=new Map();
  function strategyContext(strategyId=window.DN.activeStrategyId()) {
    if(!strategyContexts.has(strategyId))strategyContexts.set(strategyId,window.DN.createStrategyRatingContext(defaultRatings,{strategyId,canonPerk}));
    return strategyContexts.get(strategyId);
  }
  function strategyScore(row,strategyId) {
    return window.DNArtifactScoring.score(row,{canonPerk,ratingOf:strategyContext(strategyId).ratingOf,scoreMode,prefSortAxes}).preference;
  }

  /** Which axes feed preference sort (at least one should be on). */
  let prefSortAxes = { offensive: true, defensive: true };

  /** "combined" = sum all perk lines; "maxrow" = best active-axis line only. */
  let scoreMode = "combined";

  /** @type {Set<string>} artifact_id values marked owned/collected */
  let collected = new Set();

  /** @type {Record<string, string>} artifact_id → image URL */
  let artifactImages = {};

  let hideCollected = false;

  /** @type {{ key: string, dir: 1 | -1 }} */
  let sortState = { key: "default", dir: 1 };

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

  /**
   * Normalize a stored override entry. Explicit 0 is preserved.
   * Legacy flat numbers become offensive overrides.
   * @returns {{ offensive?: number, defensive?: number } | null}
   */
  function normalizeRatingEntry(v) {
    if (v == null) return null;
    if (typeof v === "number" || typeof v === "string") {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return { offensive: clampRating(n) };
    }
    if (typeof v !== "object") return null;
    /** @type {{ offensive?: number, defensive?: number }} */
    const entry = {};
    const obj = /** @type {Record<string, unknown>} */ (v);
    for (const axis of AXES) {
      if (!(axis in obj)) continue;
      const n = Number(obj[axis]);
      if (!Number.isFinite(n)) continue;
      entry[axis] = clampRating(n);
    }
    return Object.keys(entry).length ? entry : null;
  }

  /** DB default entry: both axes, missing → 0. */
  function normalizeDefaultEntry(v) {
    if (v == null || typeof v !== "object") return null;
    const obj = /** @type {Record<string, unknown>} */ (v);
    const off = Number(obj.offensive);
    const def = Number(obj.defensive);
    return {
      offensive: Number.isFinite(off) ? clampRating(off) : 0,
      defensive: Number.isFinite(def) ? clampRating(def) : 0,
    };
  }

  /** Collapse alias keys onto canonical names; merge axes; last write wins per axis. */
  function migrateRatings(rawRatings) {
    /** @type {Record<string, { offensive?: number, defensive?: number }>} */
    const out = {};
    for (const [k, v] of Object.entries(rawRatings)) {
      const entry = normalizeRatingEntry(v);
      if (!entry) continue;
      const canon = canonPerk(k);
      if (!canon) continue;
      const prev = out[canon] || {};
      out[canon] = { ...prev, ...entry };
    }
    return out;
  }

  /** Load global + active-profile overrides into a single effective bag for scoring. */
  function loadEffectiveRatings() {
    if (!window.DN) return {};
    window.DN.ensurePerkRatingsMigrated();
    const layers = window.DN.loadActivePerkRatingLayers();
    return window.DN.mergePerkRatingLayers(
      migrateRatings(layers.global),
      migrateRatings(layers.profile)
    );
  }

  /** @type {Set<string> | null} null = army never configured; no unit gating */
  let armyLastApplied = null;

  function refreshArmyLastApplied() {
    try {
      if (!window.DN || !window.DN.lsHas(window.DN.ARMY_PRESETS_KEY)) {
        armyLastApplied = null;
        return;
      }
      armyLastApplied = window.DN.armyEffectiveAppliedSet();
    } catch {
      armyLastApplied = null;
    }
  }

  /** @param {"offensive" | "defensive"} axis */
  function defaultRating(name, axis) {
    if (armyLastApplied && window.DN && window.DN.isUnitPerk(name)) {
      const fam = window.DN.unitFamily(name);
      if (fam && !armyLastApplied.has(fam)) return 0;
    }
    const entry = defaultRatings[name];
    if (!entry) return 0;
    return entry[axis] || 0;
  }

  function hasFactoryDefaults() {
    return Object.keys(defaultRatings).length > 0;
  }

  function isOverridden(name, axis) {
    const entry = ratings[name];
    return !!(entry && Object.prototype.hasOwnProperty.call(entry, axis));
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

  function savePrefSortAxes() {
    const payload = JSON.stringify(prefSortAxes);
    if (window.DN) window.DN.lsSet(PREF_SORT_AXES_KEY, payload);
    else localStorage.setItem(PREF_SORT_AXES_KEY, payload);
  }

  function syncPrefSortAxisInputs() {
    if (el.sortOff) {
      el.sortOff.classList.toggle("is-active", !!prefSortAxes.offensive);
      el.sortOff.setAttribute("aria-pressed", prefSortAxes.offensive ? "true" : "false");
    }
    if (el.sortDef) {
      el.sortDef.classList.toggle("is-active", !!prefSortAxes.defensive);
      el.sortDef.setAttribute("aria-pressed", prefSortAxes.defensive ? "true" : "false");
    }
  }

  function loadScoreMode() {
    try {
      const raw = window.DN ? window.DN.lsGet(SCORE_MODE_KEY) : localStorage.getItem(SCORE_MODE_KEY);
      return raw === "maxrow" ? "maxrow" : "combined";
    } catch {
      return "combined";
    }
  }

  function saveScoreMode() {
    if (window.DN) window.DN.lsSet(SCORE_MODE_KEY, scoreMode);
    else localStorage.setItem(SCORE_MODE_KEY, scoreMode);
  }

  function syncScoreModeInputs() {
    const combined = scoreMode === "combined";
    if (el.scoreCombined) {
      el.scoreCombined.classList.toggle("is-active", combined);
      el.scoreCombined.setAttribute("aria-pressed", combined ? "true" : "false");
    }
    if (el.scoreMaxrow) {
      el.scoreMaxrow.classList.toggle("is-active", !combined);
      el.scoreMaxrow.setAttribute("aria-pressed", combined ? "false" : "true");
    }
  }

  /** @param {"combined" | "maxrow"} mode */
  function setScoreMode(mode) {
    scoreMode = mode === "maxrow" ? "maxrow" : "combined";
    saveScoreMode();
    syncScoreModeInputs();
    render();
  }

  function syncGradeToggle() {
    const map = [
      [el.gradeAll, ""],
      [el.gradeLeg, "Legendary"],
      [el.gradeMyth, "Mythical"],
    ];
    for (const [btn, value] of map) {
      if (!btn) continue;
      const on = gradeFilter === value;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function syncPerkMatchToggle() {
    const andOn = perkMatchMode !== "or";
    if (el.perkMatchAnd) {
      el.perkMatchAnd.classList.toggle("is-active", andOn);
      el.perkMatchAnd.setAttribute("aria-pressed", andOn ? "true" : "false");
    }
    if (el.perkMatchOr) {
      el.perkMatchOr.classList.toggle("is-active", !andOn);
      el.perkMatchOr.setAttribute("aria-pressed", andOn ? "false" : "true");
    }
  }

  function loadHallFilter() {
    try {
      const raw = window.DN ? window.DN.lsGet(HALL_FILTER_KEY) : localStorage.getItem(HALL_FILTER_KEY);
      return raw === "Main" ? "Main" : "War";
    } catch {
      return "War";
    }
  }

  function saveHallFilter() {
    const payload = hallFilter === "Main" ? "Main" : "War";
    if (window.DN) window.DN.lsSet(HALL_FILTER_KEY, payload);
    else localStorage.setItem(HALL_FILTER_KEY, payload);
  }

  function loadGradeFilter() {
    try {
      const raw = window.DN ? window.DN.lsGet(GRADE_FILTER_KEY) : localStorage.getItem(GRADE_FILTER_KEY);
      return raw === "Legendary" || raw === "Mythical" ? raw : "";
    } catch {
      return "";
    }
  }

  function saveGradeFilter() {
    const payload = gradeFilter === "Legendary" || gradeFilter === "Mythical" ? gradeFilter : "";
    if (window.DN) window.DN.lsSet(GRADE_FILTER_KEY, payload);
    else localStorage.setItem(GRADE_FILTER_KEY, payload);
  }

  function loadPerkMatchMode() {
    try {
      const raw = window.DN ? window.DN.lsGet(PERK_MATCH_KEY) : localStorage.getItem(PERK_MATCH_KEY);
      return raw === "or" ? "or" : "and";
    } catch {
      return "and";
    }
  }

  function savePerkMatchMode() {
    const payload = perkMatchMode === "or" ? "or" : "and";
    if (window.DN) window.DN.lsSet(PERK_MATCH_KEY, payload);
    else localStorage.setItem(PERK_MATCH_KEY, payload);
  }

  function setGradeFilter(grade) {
    gradeFilter = grade === "Legendary" || grade === "Mythical" ? grade : "";
    saveGradeFilter();
    syncGradeToggle();
    render();
  }

  function setPerkMatchMode(mode) {
    perkMatchMode = mode === "or" ? "or" : "and";
    savePerkMatchMode();
    syncPerkMatchToggle();
    updatePerkFilterBtn();
    render();
  }

  function artifactKey(row) {
    const id = text(row.artifact_id);
    if (id) return id;
    // Fallback if id missing: name + grade + hall
    return [text(row.name), text(row.grade), text(row.hall)].join("|");
  }

  function loadCollected() {
    try {
      const raw = window.DN ? window.DN.lsGet(COLLECTED_KEY) : localStorage.getItem(COLLECTED_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((x) => text(x)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveCollected() {
    const payload = JSON.stringify([...collected]);
    if (window.DN) window.DN.lsSet(COLLECTED_KEY, payload);
    else localStorage.setItem(COLLECTED_KEY, payload);
  }

  function loadHideCollected() {
    try {
      const raw = window.DN ? window.DN.lsGet(HIDE_COLLECTED_KEY) : localStorage.getItem(HIDE_COLLECTED_KEY);
      return raw === "1";
    } catch {
      return false;
    }
  }

  function saveHideCollected() {
    const payload = hideCollected ? "1" : "0";
    if (window.DN) window.DN.lsSet(HIDE_COLLECTED_KEY, payload);
    else localStorage.setItem(HIDE_COLLECTED_KEY, payload);
  }

  function isCollected(row) {
    return collected.has(artifactKey(row));
  }

  function setCollected(row, owned) {
    const key = artifactKey(row);
    if (!key) return;
    if (owned) collected.add(key);
    else collected.delete(key);
    saveCollected();
  }

  /** Effective rating: user override if set (incl. 0), else factory default. */
  /** @param {"offensive" | "defensive"} axis */
  function ratingOf(name, axis) {
    return strategyContext().ratingOf(name,axis);
  }

  function hasAnyRatings() {
    if (Object.keys(ratings).length > 0) return true;
    return hasFactoryDefaults();
  }

  function hasAnyPrefSortAxis() {
    return !!(prefSortAxes.offensive || prefSortAxes.defensive);
  }

  function polishPerk(name) {
    return name
      .replace(/Hitpoints\s+and\s+Damage/gi, "Hitpoints & Damage")
      .replace(/Damage\s+and\s+Hitpoints/gi, "Hitpoints & Damage");
  }

  function canonPerk(name) {
    const n = text(name);
    if (!n) return "";
    return polishPerk(perkCanon[n] || n);
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
      // Prefer "&" canonical if the same raw appears more than once.
      const prev = map[raw];
      if (!prev || (canon.includes(" & ") && !prev.includes(" & "))) {
        map[raw] = canon;
      }
    }
    return map;
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

  function perkNamesOf(row) {
    const names = [];
    for (let i = 1; i <= 6; i++) {
      const name = canonPerk(row[`perk_${i}_name`]);
      if (name) names.push(name);
    }
    return names;
  }

  /** Existing callers retain their rating/canonicalization state. */
  function perkLinesOf(row) {
    return window.DNArtifactScoring.perkLines(row, { canonPerk, ratingOf });
  }

  function artifactScores(row) {
    return window.DNArtifactScoring.score(row, { canonPerk, ratingOf, scoreMode, prefSortAxes });
  }

  /** @param {"offensive" | "defensive"} axis */
  function axisScore(row, axis) {
    return artifactScores(row)[axis];
  }

  /** Preference sort key: checked axes under current score mode. */
  function preferenceScore(row) {
    return artifactScores(row).preference;
  }

  function formatScore(score) {
    if (!score) return blankSpan(BLANK);
    const cls = score > 0 ? "pref-pos" : "pref-neg";
    const sign = score > 0 ? "+" : "";
    return `<span class="pref-score ${cls}">${sign}${score}</span>`;
  }

  /**
   * Per-line weighted scores (aligned with Stats rows).
   * @param {"offensive" | "defensive"} axis
   */
  function ratingLinesBlock(scores) {
    if (!scores.lines.length) return blankSpan(BLANK);
    const format = (rating) => {
      const cls = rating > 0 ? "pref-pos" : rating < 0 ? "pref-neg" : "blank";
      return '<span class="perk-rating ' + cls + '">' + (rating > 0 ? "+" : "") + rating + '</span>';
    };
    return '<div class="axis-stack">' + scores.lines.map((line, i) => {
      const best = scoreMode === "maxrow" && i === scores.bestIndex ? " is-best" : "";
      return '<div class="axis-line rating-line' + best + '" title="' + esc(line.name) + '">' +
        (prefSortAxes.offensive ? '<span aria-label="Offensive rating">O ' + format(line.offRating) + '</span>' : '') +
        (prefSortAxes.defensive ? '<span aria-label="Defensive rating">D ' + format(line.defRating) + '</span>' : '') + '</div>';
    }).join("") + '</div>';
  }

  function axisLinesBlock(scores, axis) {
    const lines = scores.lines;
    if (!lines.length) return blankSpan(BLANK);
    const parts = lines.map((line, i) => {
      const value = line[axis];
      const isBest = scoreMode === "maxrow" && i === scores.bestIndex;
      const dim = scoreMode === "maxrow" && !isBest ? " is-dim" : "";
      const best = isBest ? " is-best" : "";
      const rating = axis === "offensive" ? line.offRating : line.defRating;
      const title =
        `${axis === "offensive" ? "Off" : "Def"} rating ${rating} × mag ${line.mag}` +
        (line.name ? ` (${line.name})` : "");
      return (
        `<div class="axis-line${dim}${best}" title="${esc(title)}">${formatScore(value)}</div>`
      );
    });
    return `<div class="axis-stack">${parts.join("")}</div>`;
  }

  /**
   * Combined / Best-line total for an axis.
   * @param {"offensive" | "defensive"} axis
   */
  function axisTotalBlock(scores, axis) {
    if (!scores.lines.length) return blankSpan(BLANK);
    const total = scores[axis];
    return (
      `<div class="axis-total-only" title="${
        scoreMode === "maxrow" ? "Showcase" : "Hall"
      }">${formatScore(total)}</div>`
    );
  }

  /** Compact O/D badges for filter checklists. */
  function ratingBadges(name) {
    if (!name) return "";
    const parts = [];
    for (const axis of AXES) {
      if (!prefSortAxes[axis]) continue;
      const rating = ratingOf(name, axis);
      if (!rating) continue;
      const label = axis === "offensive" ? "O" : "D";
      const cls = rating > 0 ? "pref-pos" : "pref-neg";
      const sign = rating > 0 ? "+" : "";
      parts.push(
        `<span class="perk-rating ${cls}" title="${axis}">${label}${sign}${rating}</span>`
      );
    }
    return parts.join("");
  }

  /** Stats column: perk name + base→max range only. */
  function perkBlock(row, scores) {
    const lines = scores ? scores.lines : perkLinesOf(row);
    if (!lines.length) return blankSpan("no perks");
    const parts = lines.map((line, i) => {
      const vals = line.base
        ? `<span class="perk-val-main">${esc(line.base)}</span>` +
          (line.max ? `<span class="perk-val-max"> → ${esc(line.max)}</span>` : "")
        : line.max
          ? `<span class="perk-val-main">${esc(line.max)}</span>`
          : blankSpan(BLANK);
      const highlight = line.name && selectedPerks.has(line.name) ? " perk-match-hit" : "";
      const best =
        scoreMode === "maxrow" && scores && i === scores.bestIndex ? " is-best-line" : "";
      return (
        `<div class="perk-row${highlight}${best}">` +
          `<span class="perk-name">${line.name ? esc(line.name) : blankSpan(BLANK)}</span>` +
          `<span class="perk-vals">${vals}</span></div>`
      );
    });
    return `<div class="perks">${parts.join("")}</div>`;
  }

  function costBlock(row) {
    const bucket = costBucket(row);
    const label = bucket === "unknown" ? "unknown" : bucket;
    return `<span class="cost-tier cost-tier-${esc(bucket)}">${esc(label)}</span>`;
  }

  /** Active preference score ÷ token cost, or null when cost unknown. */
  function prefPerCost(row) {
    const cost = tokenCount(row);
    if (cost == null || cost <= 0) return null;
    return preferenceScore(row) / cost;
  }

  function prefPerCostBlock(row) {
    const v = prefPerCost(row);
    if (v == null) return blankSpan(BLANK);
    const rounded = Math.round(v * 100) / 100;
    const cls = rounded > 0 ? "pref-pos" : rounded < 0 ? "pref-neg" : "";
    const sign = rounded > 0 ? "+" : "";
    return `<span class="pref-score pref-per-cost ${cls}" title="Preference ÷ token cost">${sign}${rounded}</span>`;
  }

  function fillSelect(select, values) {
    const current = select.value;
    const keep = select.querySelector("option[value='']");
    select.innerHTML = "";
    select.appendChild(keep || new Option("All", ""));
    for (const v of values) {
      select.appendChild(new Option(v, v));
    }
    if ([...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  }

  /** Prefer game axis order: Main/War halls, Legendary/Mythical grades. */
  const FIELD_ORDER = {
    hall: ["Main", "War"],
    grade: ["Legendary", "Mythical"],
    status: ["Released", "Uncertain"],
    confidence: ["High", "Medium", "Low"],
  };

  function uniqueSorted(field) {
    const set = new Set();
    for (const r of rows) {
      const v = text(r[field]);
      if (v) set.add(v);
    }
    const preferred = FIELD_ORDER[field];
    if (preferred) {
      const rest = [...set]
        .filter((v) => !preferred.includes(v))
        .sort((a, b) => a.localeCompare(b));
      return [...preferred.filter((v) => set.has(v)), ...rest];
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function collectPerkNames() {
    const set = new Set();
    for (const r of rows) {
      for (const name of perkNamesOf(r)) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function defaultSortKey(row) {
    const hallRank = { Main: 0, War: 1 }[text(row.hall)] ?? 9;
    const gradeRank = { Legendary: 0, Mythical: 1 }[text(row.grade)] ?? 9;
    return [hallRank, gradeRank, text(row.name).toLowerCase()];
  }

  function orderedRank(field, value) {
    const order = FIELD_ORDER[field];
    if (!order) return null;
    const idx = order.indexOf(value);
    return idx === -1 ? order.length : idx;
  }

  /** Numeric Legendary Token (or coin) amount, or null if blank/non-numeric. */
  function tokenCount(row) {
    const raw = text(row.cost).replace(/,/g, "");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /** @returns {"1000" | "300" | "100" | "unknown"} */
  function costBucket(row) {
    const n = tokenCount(row);
    if (n === 1000) return "1000";
    if (n === 300) return "300";
    if (n === 100) return "100";
    return "unknown";
  }

  function syncSelectedCostTiers() {
    selectedCostTiers.clear();
    if (!el.costFilter) return;
    for (const input of el.costFilter.querySelectorAll('input[name="cost-tier"]')) {
      if (input.checked) selectedCostTiers.add(input.value);
    }
  }

  function clearCostFilter() {
    selectedCostTiers.clear();
    if (!el.costFilter) return;
    for (const input of el.costFilter.querySelectorAll('input[name="cost-tier"]')) {
      input.checked = false;
    }
    updateCostFilterBtn();
  }

  function updateCostFilterBtn() {
    if (!el.costFilterBtn) return;
    const label = window.DN
      ? window.DN.formatMultiSummary("Any cost", selectedCostTiers, {
          order: ["1000", "300", "100", "unknown"],
          unit: "cost",
          maxLen: 28,
        })
      : selectedCostTiers.size
        ? `${selectedCostTiers.size} cost${selectedCostTiers.size === 1 ? "" : "s"}`
        : "Any cost";
    el.costFilterBtn.textContent = label;
    el.costFilterBtn.classList.toggle("has-value", selectedCostTiers.size > 0);
    el.costFilterBtn.title = selectedCostTiers.size
      ? [...selectedCostTiers].join(", ")
      : "Any cost";
  }

  function setCostPanelOpen(open) {
    if (!el.costFilterPanel || !el.costFilterBtn) return;
    el.costFilterPanel.hidden = !open;
    el.costFilterBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function sortValue(row, key) {
    if(key.startsWith('strategy:'))return strategyScore(row,key.slice(9));
    switch (key) {
      case "preference":
        return preferenceScore(row);
      case "offensive":
        return axisScore(row, "offensive");
      case "defensive":
        return axisScore(row, "defensive");
      case "collected":
        return Number(isCollected(row));
      case "name":
        return text(row.name).toLowerCase();
      case "hall": {
        const v = text(row.hall);
        return [orderedRank("hall", v) ?? 9, v.toLowerCase()];
      }
      case "grade": {
        const v = text(row.grade);
        return [orderedRank("grade", v) ?? 9, v.toLowerCase()];
      }
      case "status": {
        const v = text(row.release_status);
        return [orderedRank("status", v) ?? 9, v.toLowerCase()];
      }
      case "perks":
        return Number(row.perk_count) || 0;
      case "pref_per_cost":
        return prefPerCost(row);
      case "confidence": {
        const v = text(row.confidence);
        return [orderedRank("confidence", v) ?? 9, v.toLowerCase()];
      }
      case "notes":
        return text(row.notes).toLowerCase();
      default:
        return defaultSortKey(row);
    }
  }

  function cmpValues(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const c = cmpValues(a[i] ?? "", b[i] ?? "");
        if (c) return c;
      }
      return 0;
    }
    if (typeof a === "number" && typeof b === "number") {
      return a === b ? 0 : a < b ? -1 : 1;
    }
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }

  function compareRows(a, b) {
    if (sortState.key === "cost") {
      const ca = tokenCount(a);
      const cb = tokenCount(b);
      const aBlank = ca == null;
      const bBlank = cb == null;
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      if (!aBlank && ca !== cb) return (ca < cb ? -1 : 1) * sortState.dir;
      return cmpValues(defaultSortKey(a), defaultSortKey(b));
    }
    if (sortState.key === "pref_per_cost") {
      const ca = prefPerCost(a);
      const cb = prefPerCost(b);
      const aBlank = ca == null;
      const bBlank = cb == null;
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      if (!aBlank && ca !== cb) return (ca < cb ? -1 : 1) * sortState.dir;
      return cmpValues(defaultSortKey(a), defaultSortKey(b));
    }
    const c = cmpValues(sortValue(a, sortState.key), sortValue(b, sortState.key));
    if (c) return c * sortState.dir;
    if (prefSortAxes.offensive && prefSortAxes.defensive &&
        (sortState.key === "offensive" || sortState.key === "defensive")) {
      const secondary = sortState.key === "offensive" ? "defensive" : "offensive";
      const aSecondary = axisScore(a, secondary);
      const bSecondary = axisScore(b, secondary);
      if (aSecondary !== bSecondary) return (aSecondary < bSecondary ? -1 : 1) * sortState.dir;
    }
    return cmpValues(defaultSortKey(a), defaultSortKey(b));
  }

  function matchesPerkFilter(row) {
    if (!selectedPerks.size) return true;
    const names = new Set(perkNamesOf(row));
    const mode = perkMatchMode === "or" ? "or" : "and";
    if (mode === "and") {
      for (const p of selectedPerks) {
        if (!names.has(p)) return false;
      }
      return true;
    }
    for (const p of selectedPerks) {
      if (names.has(p)) return true;
    }
    return false;
  }

  function matches(row) {
    const q = text(el.q.value).toLowerCase();
    if (q) {
      const hay = `${text(row.name)} ${text(row.alternate_name)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (text(row.hall) !== hallFilter) return false;
    if (gradeFilter && text(row.grade) !== gradeFilter) return false;
    if (selectedCostTiers.size && !selectedCostTiers.has(costBucket(row))) return false;
    if (!matchesPerkFilter(row)) return false;
    if (hideCollected && isCollected(row)) return false;
    return true;
  }

  function updatePerkFilterBtn() {
    const mode = perkMatchMode === "or" ? "OR" : "AND";
    const label = window.DN
      ? window.DN.formatMultiSummary("Any perk", selectedPerks, {
          unit: "perk",
          mode: selectedPerks.size ? mode : null,
          maxLen: 30,
        })
      : selectedPerks.size
        ? `${selectedPerks.size} perk${selectedPerks.size === 1 ? "" : "s"} · ${mode}`
        : "Any perk";
    el.perkFilterBtn.textContent = label;
    el.perkFilterBtn.classList.toggle("has-value", selectedPerks.size > 0);
    el.perkFilterBtn.title = selectedPerks.size
      ? `${[...selectedPerks].join(", ")} (${mode})`
      : "Any perk";
  }

  function renderPerkFilterList() {
    const q = text(el.perkFilterQ.value).toLowerCase();
    const items = allPerkNames.filter((n) => !q || n.toLowerCase().includes(q));
    if (!items.length) {
      el.perkFilterList.innerHTML = `<p class="empty-hint">No perks match.</p>`;
      return;
    }
    el.perkFilterList.innerHTML = items
      .map((name) => {
        const checked = selectedPerks.has(name) ? " checked" : "";
        const rated = ratingBadges(name);
        return (
          `<label class="perk-check"><input type="checkbox" value="${esc(name)}"${checked} />` +
          `<span>${esc(name)}${rated}</span></label>`
        );
      })
      .join("");
  }

  function setPerkPanelOpen(open) {
    el.perkFilterPanel.hidden = !open;
    el.perkFilterBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function statusBadge(status) {
    const s = text(status) || BLANK;
    if (s === "Released") return `<span class="badge badge-released">${esc(s)}</span>`;
    if (s === "Uncertain") return `<span class="badge badge-uncertain">${esc(s)}</span>`;
    return esc(s);
  }

  function render() {
    strategyContexts=new Map();
    const strategies=window.DN.comparisonStrategies();
    el.table.querySelectorAll('th.priority-strategy-heading').forEach(header=>header.remove());
    for(const strategy of strategies){
      const header=document.createElement('th');header.scope='col';header.className='priority-strategy-heading';header.dataset.sort='strategy:'+strategy.id;
      const button=document.createElement('button');button.type='button';button.className='th-sort';button.textContent=strategy.name;header.append(button);
      el.table.querySelector('thead tr').append(header);
    }
    const context=document.getElementById('priority-strategy-context');
    context.textContent='Active strategy: '+window.DN.activeStrategy().name+' · Comparison scores use '+(scoreMode==='maxrow'?'Showcase best line':'Hall sum')+' with the selected Off / Def axes. Each strategy has its own ratings; scores are not added together.';
    document.querySelectorAll("th[data-score-axis]").forEach((header) => {
      header.hidden = !prefSortAxes[header.dataset.scoreAxis];
    });
    const filtered = rows.filter(matches).sort(compareRows);

    updateSortHeaders();
    updateCostFilterBtn();
    updatePerkFilterBtn();
    syncCollectedToggle();

    if (!filtered.length) {
      el.tbody.innerHTML =
        `<tr class="empty-row"><td colspan="${8 + strategies.length + 2 * (Number(prefSortAxes.offensive) + Number(prefSortAxes.defensive))}">No artifacts match these filters.</td></tr>`;
      return;
    }

    el.tbody.innerHTML = filtered
      .map((row) => {
        const status = text(row.release_status);
        const owned = isCollected(row);
        const rowClass = [
          status === "Uncertain" ? "uncertain" : "",
          owned ? "collected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const alt = text(row.alternate_name);
        const key = artifactKey(row);
        const thumb = window.DN
          ? window.DN.thumbHtml(
              artifactImages[key] || "",
              show(row.name),
              "entity-thumb--priority"
            )
          : "";
        const collectedHtml =
          `<label class="owned-check${owned ? " is-owned" : ""}" title="${owned ? "Owned — click to clear" : "Mark as owned"}">` +
          `<input type="checkbox" class="collected-input" data-artifact-id="${esc(key)}"${owned ? " checked" : ""}` +
          ` aria-label="${owned ? "Owned" : "Mark as owned"}: ${esc(show(row.name))}" />` +
          `</label>`;
        const nameHtml =
          `<div class="name-cell">` +
          thumb +
          `<div class="name-body">` +
          `<span class="name-text">${esc(show(row.name))}</span>` +
          (alt ? `<span class="alt">${esc(alt)}</span>` : "") +
          `</div></div>`;
        const scores = artifactScores(row);
        return (
          `<tr class="${rowClass}" data-artifact-id="${esc(key)}">` +
          `<td>${nameHtml}</td>` +
          `<td class="collected-cell">${collectedHtml}</td>` +
          `<td>${esc(show(row.hall))}</td>` +
          `<td>${esc(show(row.grade))}</td>` +
          `<td>${perkBlock(row, scores)}</td>` +
          `<td class="perk-rating-cell">${ratingLinesBlock(scores)}</td>` +
          (prefSortAxes.offensive ? `<td class="pref-cell">${axisLinesBlock(scores, "offensive")}</td>` : "") +
          (prefSortAxes.defensive ? `<td class="pref-cell">${axisLinesBlock(scores, "defensive")}</td>` : "") +
          (prefSortAxes.offensive ? `<td class="pref-cell pref-total-cell">${axisTotalBlock(scores, "offensive")}</td>` : "") +
          (prefSortAxes.defensive ? `<td class="pref-cell pref-total-cell">${axisTotalBlock(scores, "defensive")}</td>` : "") +
          `<td class="cost-cell">${costBlock(row)}</td>` +
          `<td class="pref-cell pref-per-cost-cell">${prefPerCostBlock(row)}</td>` +
          strategies.map(strategy=>`<td class="priority-strategy-score">${Math.round(strategyScore(row,strategy.id)*100)/100}<small>${esc(strategy.name)}</small></td>`).join('')+
          `</tr>`
        );
      })
      .join("");
  }

  function isPrefSortKey(key) {
    return key === "preference" || key === "offensive" || key === "defensive";
  }

  /** Keep the selected score column primary, falling back to the visible axis. */
  function resolvePrefSortKey(requested) {
    const off = !!prefSortAxes.offensive;
    const def = !!prefSortAxes.defensive;
    if (off && def) return requested === "defensive" ? "defensive" : "offensive";
    if (off) return "offensive";
    if (def) return "defensive";
    return requested;
  }

  function setSort(key) {
    const resolved = isPrefSortKey(key) ? resolvePrefSortKey(key) : key;
    if (sortState.key === resolved) {
      sortState.dir = /** @type {1 | -1} */ (sortState.dir === 1 ? -1 : 1);
    } else {
      // Preference axes and Pref/cost default to highest-first; other columns asc.
      const highFirst = isPrefSortKey(resolved) || resolved.startsWith('strategy:') || resolved === "pref_per_cost" || resolved === "collected";
      sortState = { key: resolved, dir: highFirst ? -1 : 1 };
    }
    render();
  }

  function maybeDefaultPreferenceSort() {
    if (hasAnyRatings() && hasAnyPrefSortAxis() && sortState.key === "default") {
      sortState = { key: resolvePrefSortKey("preference"), dir: -1 };
    }
  }

  function togglePrefSortAxis(axis) {
    const next = {
      offensive: !!prefSortAxes.offensive,
      defensive: !!prefSortAxes.defensive,
    };
    if (axis === "offensive") next.offensive = !next.offensive;
    else next.defensive = !next.defensive;
    if (!next.offensive && !next.defensive) {
      syncPrefSortAxisInputs();
      return;
    }
    prefSortAxes = next;
    savePrefSortAxes();
    syncPrefSortAxisInputs();
    if (hasAnyRatings() && hasAnyPrefSortAxis()) {
      if (sortState.key === "default" || isPrefSortKey(sortState.key)) {
        sortState = { key: resolvePrefSortKey(sortState.key), dir: -1 };
      }
    }
    render();
  }

  function updateSortHeaders() {
    const active = sortState.key;
    for (const th of el.table.querySelectorAll("th[data-sort]")) {
      const key = th.getAttribute("data-sort");
      const matched = active === key;
      if (matched) {
        th.setAttribute("aria-sort", sortState.dir === 1 ? "ascending" : "descending");
      } else {
        th.setAttribute("aria-sort", "none");
      }
    }
  }

  function syncHallToggle() {
    if (el.hallMain) {
      el.hallMain.classList.toggle("is-active", hallFilter === "Main");
      el.hallMain.setAttribute("aria-pressed", hallFilter === "Main" ? "true" : "false");
    }
    if (el.hallWar) {
      el.hallWar.classList.toggle("is-active", hallFilter === "War");
      el.hallWar.setAttribute("aria-pressed", hallFilter === "War" ? "true" : "false");
    }
  }

  function syncCollectedToggle() {
    if (el.collectedHide) {
      el.collectedHide.classList.toggle("is-active", hideCollected);
      el.collectedHide.setAttribute("aria-pressed", hideCollected ? "true" : "false");
    }
    if (el.collectedShow) {
      el.collectedShow.classList.toggle("is-active", !hideCollected);
      el.collectedShow.setAttribute("aria-pressed", hideCollected ? "false" : "true");
    }
  }

  /** @param {boolean} hide */
  function setHideCollected(hide) {
    hideCollected = !!hide;
    saveHideCollected();
    syncCollectedToggle();
    render();
  }

  function setHallFilter(hall) {
    hallFilter = hall === "Main" ? "Main" : "War";
    prefSortAxes = loadPrefSortAxes();
    syncPrefSortAxisInputs();
    if (isPrefSortKey(sortState.key)) sortState = { key: resolvePrefSortKey(sortState.key), dir: -1 };
    saveHallFilter();
    syncHallToggle();
    render();
  }

  function bind() {
    // Input covers typing and clearing; change on blur would replace a checkbox mid-click.
    el.q.addEventListener("input", render);

    if (el.hallMain) {
      el.hallMain.addEventListener("click", () => setHallFilter("Main"));
    }
    if (el.hallWar) {
      el.hallWar.addEventListener("click", () => setHallFilter("War"));
    }
    if (el.gradeAll) el.gradeAll.addEventListener("click", () => setGradeFilter(""));
    if (el.gradeLeg) el.gradeLeg.addEventListener("click", () => setGradeFilter("Legendary"));
    if (el.gradeMyth) el.gradeMyth.addEventListener("click", () => setGradeFilter("Mythical"));
    if (el.perkMatchAnd) el.perkMatchAnd.addEventListener("click", () => setPerkMatchMode("and"));
    if (el.perkMatchOr) el.perkMatchOr.addEventListener("click", () => setPerkMatchMode("or"));

    if (el.collectedHide) {
      el.collectedHide.addEventListener("click", () => setHideCollected(true));
    }
    if (el.collectedShow) {
      el.collectedShow.addEventListener("click", () => setHideCollected(false));
    }

    el.tbody.addEventListener("change", async (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("collected-input")) return;
      const id = input.getAttribute("data-artifact-id");
      if (!id) return;
      const on = input.checked;
      const profileId=window.DN.activeProfileId();
      if (!on) {
        const slots = window.DN.artifactSlots(id);
        if (slots.length) {
          input.checked = true;
          const row = rows.find((item) => artifactKey(item) === id);
          if (!await window.DN.confirmUncollect(show(row && row.name), slots)) return;
          if(profileId!==window.DN.activeProfileId())return;
          window.DN.removeArtifactSlots(id);
        }
      }
      collected=loadCollected();
      if (on) collected.add(id);
      else collected.delete(id);
      saveCollected();
      // If hiding collected, row disappears; otherwise restyle in place.
      render();
    });

    el.costFilterBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const opening = el.costFilterPanel.hidden;
      if (opening) setPerkPanelOpen(false);
      setCostPanelOpen(opening);
    });

    el.costFilter.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      syncSelectedCostTiers();
      render();
    });

    el.costFilterClear.addEventListener("click", () => {
      clearCostFilter();
      render();
    });

    el.perkFilterBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const opening = el.perkFilterPanel.hidden;
      if (opening) setCostPanelOpen(false);
      setPerkPanelOpen(opening);
      if (!el.perkFilterPanel.hidden) el.perkFilterQ.focus();
    });

    el.perkFilterQ.addEventListener("input", renderPerkFilterList);

    el.perkFilterList.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      if (input.checked) selectedPerks.add(input.value);
      else selectedPerks.delete(input.value);
      render();
    });

    el.perkFilterClear.addEventListener("click", () => {
      selectedPerks.clear();
      renderPerkFilterList();
      render();
    });

    document.addEventListener("click", (ev) => {
      const target = /** @type {Node} */ (ev.target);
      if (!el.costFilterPanel.hidden && !el.costFilter.contains(target)) {
        setCostPanelOpen(false);
      }
      if (!el.perkFilterPanel.hidden && !el.perkFilter.contains(target)) {
        setPerkPanelOpen(false);
      }
    });

    if (el.sortOff) el.sortOff.addEventListener("click", () => togglePrefSortAxis("offensive"));
    if (el.sortDef) el.sortDef.addEventListener("click", () => togglePrefSortAxis("defensive"));
    if (el.scoreCombined) el.scoreCombined.addEventListener("click", () => setScoreMode("combined"));
    if (el.scoreMaxrow) el.scoreMaxrow.addEventListener("click", () => setScoreMode("maxrow"));

    el.table.querySelector("thead").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button.th-sort");
      if (!btn) return;
      const th = btn.closest("th[data-sort]");
      if (!th) return;
      setSort(th.getAttribute("data-sort"));
    });
  }

  async function load() {
    try {
      const [artRes, mapRes, defRes, imgRes] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(MAPPING_URL, { cache: "no-store" }),
        fetch(DEFAULTS_URL, { cache: "no-store" }),
        fetch(IMAGES_URL, { cache: "no-store" }),
      ]);
      if (!artRes.ok) throw new Error(`HTTP ${artRes.status} loading ${DATA_URL}`);
      const data = await artRes.json();
      if (!Array.isArray(data)) throw new Error("artifacts.json is not an array");
      catalogRows = data.filter((row) => row.artifact_id !== "leftwich-trophy-legendary");
      const linked=await window.DNStoredArtifacts.reconcileCatalog(catalogRows);
      rows=window.DNStoredArtifacts.catalogRows(catalogRows,linked.collection);

      if (mapRes.ok) {
        perkCanon = parseMappingCsv(await mapRes.text());
      } else {
        perkCanon = {};
      }

      artifactImages =
        imgRes.ok && window.DN ? window.DN.imageUrlMap(await imgRes.json()) : {};

      if (!defRes.ok) {
        throw new Error(`HTTP ${defRes.status} loading ${DEFAULTS_URL}`);
      }
      /** @type {Record<string, { offensive: number, defensive: number }>} */
      const defaults = {};
      const rawDefaults = await defRes.json();
      if (!rawDefaults || typeof rawDefaults !== "object") {
        throw new Error("perk_rating_defaults.json is not an object");
      }
      for (const [k, v] of Object.entries(rawDefaults)) {
        const canon = canonPerk(k) || polishPerk(text(k));
        const entry = normalizeDefaultEntry(v);
        if (!canon || !entry) continue;
        defaults[canon] = entry;
      }
      if (!Object.keys(defaults).length) {
        throw new Error("perk_rating_defaults.json contained no usable defaults");
      }
      defaultRatings = defaults;
      refreshArmyLastApplied();

      // Effective bag: profile overrides over global (factory fills gaps in ratingOf).
      ratings = loadEffectiveRatings();
      prefSortAxes = loadPrefSortAxes();
      syncPrefSortAxisInputs();
      scoreMode = loadScoreMode();
      syncScoreModeInputs();
      collected = loadCollected();
      hideCollected = loadHideCollected();
      syncCollectedToggle();

      allPerkNames = collectPerkNames();
      hallFilter = loadHallFilter();
      gradeFilter = loadGradeFilter();
      perkMatchMode = loadPerkMatchMode();
      syncHallToggle();
      syncGradeToggle();
      syncPerkMatchToggle();
      renderPerkFilterList();
      maybeDefaultPreferenceSort();
      el.error.hidden = true;
      render();
    } catch (err) {
      el.error.hidden = false;
      el.error.innerHTML =
        `<strong>Could not load data.</strong> ${esc(err.message)}<br>` +
        `Serve the <code>ui</code> folder over HTTP (file:// blocks fetch), e.g.<br>` +
        `<code>cd "c:\\Projects\\Dominations Artifacts\\ui" && python -m http.server 8765</code><br>` +
        `then open <code>http://127.0.0.1:8765/</code>`;
    }
  }

  bind();
  const refreshStrategies=async()=>{
    if(!rows.length)return;
    const sequence=++inventoryRefresh,key=window.DNStoredArtifacts.collectionKey();
    try {
      const scans=await window.DNStoredArtifacts.read(key);
      if(sequence!==inventoryRefresh || key!==window.DNStoredArtifacts.collectionKey())return;
      rows=window.DNStoredArtifacts.catalogRows(catalogRows,scans);
    } catch {return;}
    strategyContexts=new Map();collected=loadCollected();ratings=loadEffectiveRatings();
    renderPerkFilterList();render();
  };
  window.addEventListener('focus',refreshStrategies);
  window.addEventListener('storage',refreshStrategies);
  window.addEventListener('dn-strategies-changed',refreshStrategies);
  window.addEventListener('dn-artifacts-changed',refreshStrategies);
  load();
})();
