(() => {
  "use strict";

  const C = window.DNCouncil;
  if (!C) {
    console.error("council-shared.js must load before council-ratings.js");
    return;
  }

  const DATA_URL = "./data/councilors.json";
  const DEFAULTS_URL = "./data/council_stat_rating_defaults.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";

  const el = {
    q: document.getElementById("ratings-q"),
    grid: document.getElementById("ratings-grid"),
    error: document.getElementById("error"),
    reset: document.getElementById("ratings-reset"),
  };

  /** @type {Record<string, { offensive: number, defensive: number }>} */
  let defaultRatings = {};
  /** @type {string[]} */
  let allStatNames = [];
  /** @type {Record<string, { offensive?: number, defensive?: number }>} */
  let ratings = {};
  /** @type {{ key: string, dir: 1 | -1 }} */
  let sortState = { key: "name", dir: 1 };

  function showError(msg) {
    el.error.hidden = !msg;
    el.error.textContent = msg || "";
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

  function isOverridden(name, axis) {
    const entry = ratings[name];
    return !!(entry && Object.prototype.hasOwnProperty.call(entry, axis));
  }

  /** @param {"offensive" | "defensive"} axis */
  function setRating(name, axis, value) {
    const n = C.clampRating(value);
    const def = defaultRatings[name] ? defaultRatings[name][axis] : 0;
    let entry = ratings[name];
    if (!entry) entry = {};
    if (n === def) {
      delete entry[axis];
      if (
        !Object.prototype.hasOwnProperty.call(entry, "offensive") &&
        !Object.prototype.hasOwnProperty.call(entry, "defensive")
      ) {
        delete ratings[name];
      } else {
        ratings[name] = entry;
      }
    } else {
      entry[axis] = n;
      ratings[name] = entry;
    }
    C.saveRatings(ratings);
  }

  function collectStatNames(councilors) {
    const set = new Set();
    for (const r of councilors) {
      for (const mode of ["war", "main"]) {
        for (const rarity of C.RARITIES) {
          for (const name of C.statsOf(r, mode, rarity)) set.add(name);
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function sortValue(name, key) {
    if (key === "offensive") return ratingOf(name, "offensive");
    if (key === "defensive") return ratingOf(name, "defensive");
    return name.toLowerCase();
  }

  function sortedNames(filterQ) {
    const q = C.text(filterQ).toLowerCase();
    const items = allStatNames.filter((n) => !q || n.toLowerCase().includes(q));
    const dir = sortState.dir;
    const key = sortState.key;
    items.sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (typeof va === "number" && typeof vb === "number") {
        if (va !== vb) return (va - vb) * dir;
      } else {
        const cmp = String(va).localeCompare(String(vb));
        if (cmp) return cmp * dir;
      }
      return a.localeCompare(b);
    });
    return items;
  }

  function sortAria(key) {
    if (sortState.key !== key) return "none";
    return sortState.dir === 1 ? "ascending" : "descending";
  }

  function sortBtn(label, key) {
    return (
      `<button type="button" class="th-sort ratings-sort-btn" data-sort-key="${C.esc(key)}" ` +
      `aria-sort="${sortAria(key)}">${C.esc(label)}</button>`
    );
  }

  function render() {
    const names = sortedNames(el.q ? el.q.value : "");
    if (!names.length) {
      el.grid.innerHTML = `<p class="empty-hint">No stats match.</p>`;
      return;
    }

    const head =
      `<div class="ratings-page-head" role="row">` +
      `<div class="ratings-page-corner" role="columnheader">${sortBtn("Stat", "name")}</div>` +
      `<div class="ratings-page-group ratings-page-group-global" role="group" aria-label="Ratings">` +
      `<div class="ratings-page-group-title">This profile</div>` +
      `<div class="ratings-page-group-axes">` +
      `<div role="columnheader">${sortBtn("Off", "offensive")}</div>` +
      `<div role="columnheader">${sortBtn("Def", "defensive")}</div>` +
      `</div></div></div>`;

    const body = names
      .map((name) => {
        const off = ratingOf(name, "offensive");
        const def = ratingOf(name, "defensive");
        const offCls = isOverridden(name, "offensive") ? "is-override" : "is-default";
        const defCls = isOverridden(name, "defensive") ? "is-override" : "is-default";
        return (
          `<div class="ratings-page-row" role="row" data-stat="${C.esc(name)}">` +
          `<span class="rating-name">${C.esc(name)}</span>` +
          `<div class="ratings-page-pair">` +
          `<label class="rating-axis ${offCls}"><span class="visually-hidden">Offensive</span>` +
          `<input type="number" class="rating-input" data-stat="${C.esc(name)}" data-axis="offensive" ` +
          `min="${C.RATING_MIN}" max="${C.RATING_MAX}" step="1" value="${off}" /></label>` +
          `<label class="rating-axis ${defCls}"><span class="visually-hidden">Defensive</span>` +
          `<input type="number" class="rating-input" data-stat="${C.esc(name)}" data-axis="defensive" ` +
          `min="${C.RATING_MIN}" max="${C.RATING_MAX}" step="1" value="${def}" /></label>` +
          `</div></div>`
        );
      })
      .join("");

    el.grid.innerHTML = head + body;
  }

  function bind() {
    if (el.q) el.q.addEventListener("input", render);

    el.grid.addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-sort-key]");
      if (!btn || !el.grid.contains(btn)) return;
      const key = btn.getAttribute("data-sort-key") || "name";
      if (sortState.key === key) {
        sortState.dir = /** @type {1 | -1} */ (sortState.dir === 1 ? -1 : 1);
      } else {
        sortState = { key, dir: key === "name" ? 1 : -1 };
      }
      render();
    });

    el.grid.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("rating-input")) return;
      const stat = input.getAttribute("data-stat");
      const axis = input.getAttribute("data-axis");
      if (!stat || (axis !== "offensive" && axis !== "defensive")) return;
      const n = C.clampRating(Number(input.value) || 0);
      input.value = String(n);
      setRating(stat, axis, n);
      render();
    });

    if (el.reset) {
      el.reset.addEventListener("click", () => {
        if (!confirm("Reset all council stat ratings to seeded defaults for this profile?")) return;
        ratings = {};
        C.saveRatings(ratings);
        render();
      });
    }
  }

  async function load() {
    try {
      const [dataRes, defRes, mapRes] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(DEFAULTS_URL, { cache: "no-store" }),
        fetch(MAPPING_URL, { cache: "no-store" }),
      ]);
      if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status} loading ${DATA_URL}`);
      if (!defRes.ok) throw new Error(`HTTP ${defRes.status} loading ${DEFAULTS_URL}`);
      const data = await dataRes.json();
      if (!data || !Array.isArray(data.councilors)) {
        throw new Error("councilors.json missing councilors array");
      }

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
      allStatNames = collectStatNames(data.councilors);
      ratings = C.remapOverrides(
        C.sanitizeOverrides(C.migrateRatings(C.loadRatingsRaw())),
        canonStat
      );
      C.saveRatings(ratings);

      bind();
      render();
      showError("");
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  load();
})();
