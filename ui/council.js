(() => {
  "use strict";

  const C = window.DNCouncil;
  if (!C) {
    console.error("council-shared.js must load before council.js");
    return;
  }

  const DATA_URL = "./data/councilors.json";
  const DEFAULTS_URL = "./data/council_stat_rating_defaults.json";
  const IMAGES_URL = "./data/councilor_images.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";

  const el = {
    q: document.getElementById("q"),
    type: document.getElementById("type"),
    modeMain: document.getElementById("mode-main"),
    modeWar: document.getElementById("mode-war"),
    raritySeg: document.getElementById("rarity-seg"),
    collectedHide: document.getElementById("collected-hide"),
    collectedShow: document.getElementById("collected-show"),
    tbody: document.getElementById("tbody"),
    stats: document.getElementById("stats"),
    error: document.getElementById("error"),
    table: document.getElementById("table"),
    statFilter: document.getElementById("stat-filter"),
    statFilterBtn: document.getElementById("stat-filter-btn"),
    statFilterPanel: document.getElementById("stat-filter-panel"),
    statFilterQ: document.getElementById("stat-filter-q"),
    statFilterList: document.getElementById("stat-filter-list"),
    statFilterClear: document.getElementById("stat-filter-clear"),
    statMatchAnd: document.getElementById("stat-match-and"),
    statMatchOr: document.getElementById("stat-match-or"),
    sortOff: document.getElementById("sort-off"),
    sortDef: document.getElementById("sort-def"),
    scoreCombined: document.getElementById("score-combined"),
    scoreMaxrow: document.getElementById("score-maxrow"),
  };

  /** @type {object[]} */
  let rows = [];
  /** @type {string[]} */
  let allStatNames = [];
  /** @type {Set<string>} */
  let selectedStats = new Set();
  /** @type {Record<string, { offensive: number, defensive: number }>} */
  let defaultRatings = {};
  /** @type {Record<string, { offensive?: number, defensive?: number }>} */
  let ratings = {};
  let prefSortAxes = { offensive: true, defensive: true };
  /** @type {"combined" | "maxrow"} */
  let scoreMode = "combined";
  /** @type {Record<string, { rarity: string, main: boolean, war: boolean }>} */
  let owned = {};
  let hideOwned = false;
  let ui = C.loadUi();
  let statMatchMode = ui.statMatch === "or" ? "or" : "and";
  /** @type {{ key: string, dir: 1 | -1 }} */
  let sortState = { key: "default", dir: 1 };
  /** @type {Record<string, string>} */
  let councilorImages = {};

  function showError(msg) {
    el.error.hidden = !msg;
    el.error.textContent = msg || "";
  }

  function isOwnedHere(id) {
    return C.isOwnedForMode(owned[id], ui.mode);
  }

  function ownedRarity(id) {
    return isOwnedHere(id) ? C.normalizeRarity(owned[id].rarity) : null;
  }

  function setOwnedHere(id, on) {
    const hall = C.modeToHall(ui.mode);
    const still = C.setOwnedHall(owned, id, hall, on, ui.rarity);
    if (!still) {
      const active = C.loadActive().filter((x) => x !== id);
      C.saveActive(active);
    }
    C.saveOwned(owned);
  }

  /** @param {"offensive" | "defensive"} axis */
  function ratingOf(name, axis) {
    const entry = ratings[name];
    if (entry && Object.prototype.hasOwnProperty.call(entry, axis) && typeof entry[axis] === "number") {
      return entry[axis];
    }
    const def = defaultRatings[name];
    return def ? def[axis] : 0;
  }

  function hasAnyRatings() {
    if (Object.keys(ratings).length > 0) return true;
    return Object.values(defaultRatings).some((v) => v.offensive || v.defensive);
  }

  function hasAnyPrefSortAxis() {
    return !!(prefSortAxes.offensive || prefSortAxes.defensive);
  }

  function currentBonuses(row) {
    return C.bonusesOf(row, ui.mode, ui.rarity);
  }

  function currentStats(row) {
    return C.statsOf(row, ui.mode, ui.rarity);
  }

  /**
   * @typedef {{
   *   index: number,
   *   name: string,
   *   value: string,
   *   mag: number,
   *   offRating: number,
   *   defRating: number,
   *   offensive: number,
   *   defensive: number
   * }} StatLineScore
   */

  /** @returns {StatLineScore[]} */
  function statLinesOf(row) {
    const bonuses = currentBonuses(row);
    /** @type {StatLineScore[]} */
    const lines = [];
    for (let i = 0; i < bonuses.length; i++) {
      const name = C.text(bonuses[i].stat);
      const value = C.text(bonuses[i].value);
      const mag = C.bonusMagnitude(value);
      const offRating = name ? ratingOf(name, "offensive") : 0;
      const defRating = name ? ratingOf(name, "defensive") : 0;
      lines.push({
        index: i,
        name,
        value,
        mag,
        offRating,
        defRating,
        offensive: offRating * mag,
        defensive: defRating * mag,
      });
    }
    return lines;
  }

  function lineActiveScore(line) {
    let sum = 0;
    if (prefSortAxes.offensive) sum += line.offensive;
    if (prefSortAxes.defensive) sum += line.defensive;
    return sum;
  }

  /**
   * @returns {{
   *   lines: StatLineScore[],
   *   bestIndex: number,
   *   offensive: number,
   *   defensive: number,
   *   preference: number
   * }}
   */
  function councilorScores(row) {
    const lines = statLinesOf(row);
    if (!lines.length) {
      return { lines, bestIndex: -1, offensive: 0, defensive: 0, preference: 0 };
    }
    if (scoreMode === "maxrow") {
      let bestIndex = 0;
      let bestActive = lineActiveScore(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        const active = lineActiveScore(lines[i]);
        if (active > bestActive) {
          bestActive = active;
          bestIndex = i;
        }
      }
      const best = lines[bestIndex];
      return {
        lines,
        bestIndex,
        offensive: best.offensive,
        defensive: best.defensive,
        preference: bestActive,
      };
    }
    let offensive = 0;
    let defensive = 0;
    for (const line of lines) {
      offensive += line.offensive;
      defensive += line.defensive;
    }
    let preference = 0;
    if (prefSortAxes.offensive) preference += offensive;
    if (prefSortAxes.defensive) preference += defensive;
    return { lines, bestIndex: -1, offensive, defensive, preference };
  }

  /** @param {"offensive" | "defensive"} axis */
  function axisScore(row, axis) {
    return councilorScores(row)[axis];
  }

  function preferenceScore(row) {
    return councilorScores(row).preference;
  }

  function formatScore(score) {
    if (!score) return C.blankSpan(C.BLANK);
    const cls = score > 0 ? "pref-pos" : "pref-neg";
    const sign = score > 0 ? "+" : "";
    return `<span class="pref-score ${cls}">${sign}${score}</span>`;
  }

  /** @param {"offensive" | "defensive"} axis */
  function axisLinesBlock(scores, axis) {
    const lines = scores.lines;
    if (!lines.length) return C.blankSpan(C.BLANK);
    const parts = lines.map((line, i) => {
      const value = line[axis];
      const isBest = scoreMode === "maxrow" && i === scores.bestIndex;
      const dim = scoreMode === "maxrow" && !isBest ? " is-dim" : "";
      const best = isBest ? " is-best" : "";
      const rating = axis === "offensive" ? line.offRating : line.defRating;
      const title =
        `${axis === "offensive" ? "Off" : "Def"} rating ${rating} × mag ${line.mag}` +
        (line.name ? ` (${line.name})` : "");
      return `<div class="axis-line${dim}${best}" title="${C.esc(title)}">${formatScore(value)}</div>`;
    });
    return `<div class="axis-stack">${parts.join("")}</div>`;
  }

  /** @param {"offensive" | "defensive"} axis */
  function axisTotalBlock(scores, axis) {
    if (!scores.lines.length) return C.blankSpan(C.BLANK);
    return (
      `<div class="axis-total-only" title="${
        scoreMode === "maxrow" ? "Best line" : "Combined"
      }">${formatScore(scores[axis])}</div>`
    );
  }

  function ratingBadges(name) {
    if (!name) return "";
    const parts = [];
    for (const axis of C.AXES) {
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

  function statsBlock(row, scores) {
    const lines = scores ? scores.lines : statLinesOf(row);
    if (!lines.length) return C.blankSpan("no stats");
    const parts = lines.map((line, i) => {
      const highlight = line.name && selectedStats.has(line.name) ? " perk-match-hit" : "";
      const best =
        scoreMode === "maxrow" && scores && i === scores.bestIndex ? " is-best-line" : "";
      return (
        `<div class="perk-row${highlight}${best}">` +
        `<span class="perk-name">${line.name ? C.esc(line.name) : C.blankSpan(C.BLANK)}</span>` +
        `<span class="perk-vals"><span class="perk-val-main">${
          line.value ? C.esc(line.value) : C.blankSpan(C.BLANK)
        }</span></span>` +
        `</div>`
      );
    });
    return `<div class="perks">${parts.join("")}</div>`;
  }

  function fillTypeSelect() {
    const set = new Set();
    for (const r of rows) {
      const t = C.text(r.type);
      if (t) set.add(t);
    }
    const current = el.type.value;
    const keep = el.type.querySelector("option[value='']");
    el.type.innerHTML = "";
    el.type.appendChild(keep || new Option("All", ""));
    for (const v of [...set].sort((a, b) => a.localeCompare(b))) {
      el.type.appendChild(new Option(v, v));
    }
    if ([...el.type.options].some((o) => o.value === current)) el.type.value = current;
  }

  function syncModeButtons() {
    const mode = C.normalizeMode(ui.mode);
    if (el.modeMain) {
      el.modeMain.classList.toggle("is-active", mode === "main");
      el.modeMain.setAttribute("aria-pressed", mode === "main" ? "true" : "false");
    }
    if (el.modeWar) {
      el.modeWar.classList.toggle("is-active", mode === "war");
      el.modeWar.setAttribute("aria-pressed", mode === "war" ? "true" : "false");
    }
  }

  function syncRarityButtons() {
    if (!el.raritySeg) return;
    for (const btn of el.raritySeg.querySelectorAll("[data-rarity]")) {
      const r = btn.getAttribute("data-rarity");
      const on = r === ui.rarity;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function syncCollectedButtons() {
    if (el.collectedHide) {
      el.collectedHide.classList.toggle("is-active", hideOwned);
      el.collectedHide.setAttribute("aria-pressed", hideOwned ? "true" : "false");
    }
    if (el.collectedShow) {
      el.collectedShow.classList.toggle("is-active", !hideOwned);
      el.collectedShow.setAttribute("aria-pressed", hideOwned ? "false" : "true");
    }
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

  function syncScoreModeButtons() {
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

  function setScoreMode(mode) {
    scoreMode = mode === "maxrow" ? "maxrow" : "combined";
    C.saveScoreMode(scoreMode);
    syncScoreModeButtons();
    render();
  }

  function syncStatMatchToggle() {
    const andOn = statMatchMode !== "or";
    if (el.statMatchAnd) {
      el.statMatchAnd.classList.toggle("is-active", andOn);
      el.statMatchAnd.setAttribute("aria-pressed", andOn ? "true" : "false");
    }
    if (el.statMatchOr) {
      el.statMatchOr.classList.toggle("is-active", !andOn);
      el.statMatchOr.setAttribute("aria-pressed", andOn ? "false" : "true");
    }
  }

  function setStatMatchMode(mode) {
    statMatchMode = mode === "or" ? "or" : "and";
    ui.statMatch = statMatchMode;
    C.saveUi(ui);
    syncStatMatchToggle();
    updateStatFilterBtn();
    render();
  }

  function collectStatNames() {
    const set = new Set();
    for (const r of rows) {
      for (const mode of ["war", "main"]) {
        for (const rarity of C.RARITIES) {
          for (const name of C.statsOf(r, mode, rarity)) set.add(name);
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function matchesStatFilter(row) {
    if (!selectedStats.size) return true;
    const have = new Set(currentStats(row));
    if (statMatchMode === "or") {
      for (const s of selectedStats) if (have.has(s)) return true;
      return false;
    }
    for (const s of selectedStats) if (!have.has(s)) return false;
    return true;
  }

  function matches(row) {
    const q = C.text(el.q.value).toLowerCase();
    if (q && !C.text(row.name).toLowerCase().includes(q)) return false;
    if (el.type.value && C.text(row.type) !== el.type.value) return false;
    if (!matchesStatFilter(row)) return false;
    if (hideOwned && isOwnedHere(C.text(row.id))) return false;
    return true;
  }

  function defaultSortKey(row) {
    return [C.text(row.type).toLowerCase(), C.text(row.name).toLowerCase()];
  }

  function compareRows(a, b) {
    const dir = sortState.dir;
    const key = sortState.key;
    let av;
    let bv;
    switch (key) {
      case "offensive":
        av = axisScore(a, "offensive");
        bv = axisScore(b, "offensive");
        break;
      case "defensive":
        av = axisScore(a, "defensive");
        bv = axisScore(b, "defensive");
        break;
      case "preference":
        av = preferenceScore(a);
        bv = preferenceScore(b);
        break;
      case "name":
        av = C.text(a.name).toLowerCase();
        bv = C.text(b.name).toLowerCase();
        break;
      case "type":
        av = C.text(a.type).toLowerCase();
        bv = C.text(b.type).toLowerCase();
        break;
      case "stats":
        av = currentStats(a).length;
        bv = currentStats(b).length;
        break;
      default: {
        const ka = defaultSortKey(a);
        const kb = defaultSortKey(b);
        for (let i = 0; i < ka.length; i++) {
          if (ka[i] < kb[i]) return -1;
          if (ka[i] > kb[i]) return 1;
        }
        return 0;
      }
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    const ka = defaultSortKey(a);
    const kb = defaultSortKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  }

  function updateStatFilterBtn() {
    const mode = statMatchMode === "or" ? "OR" : "AND";
    const label = window.DN
      ? window.DN.formatMultiSummary("Any stat", selectedStats, {
          unit: "stat",
          mode: selectedStats.size ? mode : null,
          maxLen: 30,
        })
      : selectedStats.size
        ? `${selectedStats.size} stat${selectedStats.size === 1 ? "" : "s"} · ${mode}`
        : "Any stat";
    el.statFilterBtn.textContent = label;
    el.statFilterBtn.classList.toggle("has-value", selectedStats.size > 0);
    el.statFilterBtn.title = selectedStats.size
      ? `${[...selectedStats].join(", ")} (${mode})`
      : "Any stat";
  }

  function renderStatFilterList() {
    const q = C.text(el.statFilterQ.value).toLowerCase();
    const items = allStatNames.filter((n) => !q || n.toLowerCase().includes(q));
    if (!items.length) {
      el.statFilterList.innerHTML = `<p class="empty-hint">No stats match.</p>`;
      return;
    }
    el.statFilterList.innerHTML = items
      .map((name) => {
        const checked = selectedStats.has(name) ? " checked" : "";
        return (
          `<label class="perk-check"><input type="checkbox" value="${C.esc(name)}"${checked} />` +
          `<span>${C.esc(name)}${ratingBadges(name)}</span></label>`
        );
      })
      .join("");
  }

  function setStatPanelOpen(open) {
    el.statFilterPanel.hidden = !open;
    el.statFilterBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function isPrefSortKey(key) {
    return key === "preference" || key === "offensive" || key === "defensive";
  }

  function resolvePrefSortKey(requested) {
    const off = !!prefSortAxes.offensive;
    const def = !!prefSortAxes.defensive;
    if (off && def) return "preference";
    if (off) return "offensive";
    if (def) return "defensive";
    return requested;
  }

  function setSort(key) {
    const resolved = isPrefSortKey(key) ? resolvePrefSortKey(key) : key;
    if (sortState.key === resolved) {
      sortState.dir = /** @type {1 | -1} */ (sortState.dir === 1 ? -1 : 1);
    } else {
      sortState = { key: resolved, dir: isPrefSortKey(resolved) ? -1 : 1 };
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
    C.savePrefSortAxes(prefSortAxes);
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
      let matched = active === key;
      if (active === "preference" && (key === "offensive" || key === "defensive")) matched = true;
      th.setAttribute("aria-sort", matched ? (sortState.dir === 1 ? "ascending" : "descending") : "none");
    }
  }

  function setMode(mode) {
    ui.mode = C.normalizeMode(mode);
    C.saveUi(ui);
    syncModeButtons();
    render();
  }

  function setRarity(rarity) {
    ui.rarity = C.normalizeRarity(rarity);
    C.saveUi(ui);
    syncRarityButtons();
    render();
  }

  function setHideOwned(hide) {
    hideOwned = !!hide;
    C.saveHideOwned(hideOwned);
    syncCollectedButtons();
    render();
  }

  function render() {
    const filtered = rows.filter(matches).sort(compareRows);
    const ownedCount = rows.filter((r) => isOwnedHere(C.text(r.id))).length;
    const modeLabel = C.modeLabel(ui.mode);
    const scoreLabel = scoreMode === "maxrow" ? "Best" : "Sum";

    el.stats.innerHTML =
      `<span class="chip">${filtered.length} / ${rows.length} shown</span>` +
      `<span class="chip">Owned ${ownedCount}</span>` +
      `<span class="chip">${C.esc(modeLabel)}</span>` +
      `<span class="chip">${C.esc(ui.rarity)}</span>` +
      `<span class="chip">${scoreLabel}</span>` +
      (Object.keys(ratings).length
        ? `<span class="chip">Overrides ${Object.keys(ratings).length}</span>`
        : "");

    updateSortHeaders();
    updateStatFilterBtn();
    syncModeButtons();
    syncRarityButtons();
    syncCollectedButtons();
    syncScoreModeButtons();

    if (!filtered.length) {
      el.tbody.innerHTML =
        `<tr class="empty-row"><td colspan="7">No councilors match these filters.</td></tr>`;
      return;
    }

    el.tbody.innerHTML = filtered
      .map((row) => {
        const id = C.text(row.id);
        const on = isOwnedHere(id);
        const rarity = ownedRarity(id);
        const hall = C.modeToHall(ui.mode);
        const rowClass = on ? "collected" : "";
        const thumb = window.DN
          ? window.DN.thumbHtml(
              councilorImages[id] || "",
              C.show(row.name),
              "entity-thumb--priority"
            )
          : "";
        const nameHtml =
          `<div class="name-cell">` +
          thumb +
          `<label class="owned-check${on ? " is-owned" : ""}" title="${
            on ? `Owned for ${hall} — click to clear` : `Mark as owned for ${hall}`
          }">` +
          `<input type="checkbox" class="owned-input" data-id="${C.esc(id)}"${on ? " checked" : ""}` +
          ` aria-label="${on ? "Owned" : "Mark as owned"} (${C.esc(hall)}): ${C.esc(C.show(row.name))}" />` +
          `</label>` +
          `<div class="name-body">` +
          `<span class="name-text">${C.esc(C.show(row.name))}</span>` +
          (rarity ? `<span class="owned-rarity-badge">${C.esc(rarity)}</span>` : "") +
          `</div></div>`;
        const scores = councilorScores(row);
        return (
          `<tr class="${rowClass}" data-id="${C.esc(id)}">` +
          `<td>${nameHtml}</td>` +
          `<td>${C.esc(C.show(row.type))}</td>` +
          `<td>${statsBlock(row, scores)}</td>` +
          `<td class="pref-cell">${axisLinesBlock(scores, "offensive")}</td>` +
          `<td class="pref-cell">${axisLinesBlock(scores, "defensive")}</td>` +
          `<td class="pref-cell pref-total-cell">${axisTotalBlock(scores, "offensive")}</td>` +
          `<td class="pref-cell pref-total-cell">${axisTotalBlock(scores, "defensive")}</td>` +
          `</tr>`
        );
      })
      .join("");
  }

  function bind() {
    el.q.addEventListener("input", render);
    el.type.addEventListener("change", render);

    if (el.modeMain) el.modeMain.addEventListener("click", () => setMode("main"));
    if (el.modeWar) el.modeWar.addEventListener("click", () => setMode("war"));
    if (el.statMatchAnd) el.statMatchAnd.addEventListener("click", () => setStatMatchMode("and"));
    if (el.statMatchOr) el.statMatchOr.addEventListener("click", () => setStatMatchMode("or"));

    if (el.raritySeg) {
      el.raritySeg.addEventListener("click", (ev) => {
        const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-rarity]");
        if (!btn || !el.raritySeg.contains(btn)) return;
        setRarity(btn.getAttribute("data-rarity") || "Legendary");
      });
    }

    if (el.collectedHide) el.collectedHide.addEventListener("click", () => setHideOwned(true));
    if (el.collectedShow) el.collectedShow.addEventListener("click", () => setHideOwned(false));
    if (el.scoreCombined) el.scoreCombined.addEventListener("click", () => setScoreMode("combined"));
    if (el.scoreMaxrow) el.scoreMaxrow.addEventListener("click", () => setScoreMode("maxrow"));

    el.tbody.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("owned-input")) return;
      const id = input.getAttribute("data-id");
      if (!id) return;
      setOwnedHere(id, input.checked);
      render();
    });

    el.statFilterBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setStatPanelOpen(el.statFilterPanel.hidden);
      if (!el.statFilterPanel.hidden) el.statFilterQ.focus();
    });

    el.statFilterQ.addEventListener("input", renderStatFilterList);

    el.statFilterList.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      if (input.checked) selectedStats.add(input.value);
      else selectedStats.delete(input.value);
      render();
    });

    el.statFilterClear.addEventListener("click", () => {
      selectedStats.clear();
      renderStatFilterList();
      render();
    });

    document.addEventListener("click", (ev) => {
      const target = /** @type {Node} */ (ev.target);
      if (!el.statFilterPanel.hidden && !el.statFilter.contains(target)) {
        setStatPanelOpen(false);
      }
    });

    if (el.sortOff) el.sortOff.addEventListener("click", () => togglePrefSortAxis("offensive"));
    if (el.sortDef) el.sortDef.addEventListener("click", () => togglePrefSortAxis("defensive"));

    el.table.querySelector("thead").addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("button.th-sort");
      if (!btn) return;
      const th = btn.closest("th[data-sort]");
      if (!th) return;
      setSort(th.getAttribute("data-sort"));
    });
  }

  async function load() {
    try {
      const [dataRes, defRes, imgRes, mapRes] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(DEFAULTS_URL, { cache: "no-store" }),
        fetch(IMAGES_URL, { cache: "no-store" }),
        fetch(MAPPING_URL, { cache: "no-store" }),
      ]);
      if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status} loading ${DATA_URL}`);
      if (!defRes.ok) throw new Error(`HTTP ${defRes.status} loading ${DEFAULTS_URL}`);
      const data = await dataRes.json();
      if (!data || !Array.isArray(data.councilors)) {
        throw new Error("councilors.json missing councilors array");
      }
      rows = data.councilors.slice();

      const canonStat =
        window.DN && mapRes.ok
          ? window.DN.makeCanonPerk(window.DN.parseMappingCsv(await mapRes.text()))
          : (n) => C.text(n);

      const rawDefaults = await defRes.json();
      /** @type {Record<string, { offensive: number, defensive: number }>} */
      const defaults = {};
      for (const [k, v] of Object.entries(rawDefaults || {})) {
        const entry = C.normalizeDefaultEntry(v);
        const name = C.text(k);
        if (!name || !entry) continue;
        defaults[name] = entry;
      }
      defaultRatings = C.remapDefaults(defaults, canonStat);

      councilorImages =
        imgRes.ok && window.DN ? window.DN.imageUrlMap(await imgRes.json()) : {};

      ratings = C.remapOverrides(
        C.sanitizeOverrides(C.migrateRatings(C.loadRatingsRaw())),
        canonStat
      );
      C.saveRatings(ratings);
      prefSortAxes = C.loadPrefSortAxes();
      scoreMode = C.loadScoreMode();
      syncPrefSortAxisInputs();
      syncScoreModeButtons();
      owned = C.loadOwned();
      hideOwned = C.loadHideOwned();
      ui = C.loadUi();
      statMatchMode = ui.statMatch === "or" ? "or" : "and";

      allStatNames = collectStatNames();
      fillTypeSelect();
      syncModeButtons();
      syncRarityButtons();
      syncCollectedButtons();
      syncStatMatchToggle();
      renderStatFilterList();
      maybeDefaultPreferenceSort();
      bind();
      render();
      showError("");
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  load();
})();
