(() => {
  "use strict";

  const DN = window.DN;
  if (!DN) return;

  const DEFAULTS_URL = "./data/perk_rating_defaults.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";
  const AXES = DN.RATING_AXES;

  const el = {
    q: document.getElementById("ratings-q"),
    grid: document.getElementById("ratings-grid"),
    error: document.getElementById("error"),
    hint: document.getElementById("ratings-hint"),
    resetGlobal: document.getElementById("ratings-reset-global"),
    clearOverrides: document.getElementById("ratings-clear-overrides"),
  };

  /** @type {Record<string, { offensive: number, defensive: number }>} */
  let factoryDefaults = {};
  /** @type {string[]} */
  let allPerkNames = [];
  /** @type {Record<string, { offensive?: number, defensive?: number }>} */
  let globalBag = {};
  /** @type {Record<string, Record<string, { offensive?: number, defensive?: number }>>} */
  let profileBags = {};
  /** @type {{ id: string, name: string }[]} */
  let profiles = [];

  /** @type {{ key: string, dir: 1 | -1 }} */
  let sortState = { key: "name", dir: 1 };

  function showError(msg) {
    el.error.hidden = !msg;
    el.error.textContent = msg || "";
  }

  function factoryOf(name, axis) {
    const entry = factoryDefaults[name];
    if (!entry) return 0;
    return entry[axis] || 0;
  }

  function showOverrides() {
    return profiles.length >= 2;
  }

  function globalValue(name, axis) {
    const v = DN.perkRatingAxisOrNull(globalBag, name, axis);
    return v != null ? v : factoryOf(name, axis);
  }

  function profileHas(profileId, name, axis) {
    return DN.perkRatingAxisOrNull(profileBags[profileId] || {}, name, axis) != null;
  }

  function profileDisplay(profileId, name, axis) {
    const v = DN.perkRatingAxisOrNull(profileBags[profileId] || {}, name, axis);
    if (v != null) return v;
    return null;
  }

  function persistGlobal() {
    DN.saveGlobalPerkRatings(globalBag);
  }

  function persistProfile(profileId) {
    DN.saveProfilePerkOverrides(profileId, profileBags[profileId] || {});
  }

  /**
   * @param {string} name
   * @param {"offensive" | "defensive"} axis
   * @param {number} value
   */
  function setGlobalAxis(name, axis, value) {
    const clamped = DN.clampPerkRating(value);
    const factory = factoryOf(name, axis);
    let entry = globalBag[name];
    if (clamped === factory) {
      if (!entry) return;
      delete entry[axis];
      if (
        !Object.prototype.hasOwnProperty.call(entry, "offensive") &&
        !Object.prototype.hasOwnProperty.call(entry, "defensive")
      ) {
        delete globalBag[name];
      }
      persistGlobal();
      return;
    }
    if (!entry) {
      entry = {};
      globalBag[name] = entry;
    }
    entry[axis] = clamped;
    persistGlobal();
  }

  /**
   * @param {string} profileId
   * @param {string} name
   * @param {"offensive" | "defensive"} axis
   * @param {number | null} value null clears override
   */
  function setProfileAxis(profileId, name, axis, value) {
    if (!profileBags[profileId]) profileBags[profileId] = {};
    const bag = profileBags[profileId];
    let entry = bag[name];

    if (value == null || Number.isNaN(value)) {
      if (!entry) return;
      delete entry[axis];
      if (
        !Object.prototype.hasOwnProperty.call(entry, "offensive") &&
        !Object.prototype.hasOwnProperty.call(entry, "defensive")
      ) {
        delete bag[name];
      }
      persistProfile(profileId);
      return;
    }

    const clamped = DN.clampPerkRating(value);
    const inherit = globalValue(name, axis);
    if (clamped === inherit) {
      if (!entry) return;
      delete entry[axis];
      if (
        !Object.prototype.hasOwnProperty.call(entry, "offensive") &&
        !Object.prototype.hasOwnProperty.call(entry, "defensive")
      ) {
        delete bag[name];
      }
      persistProfile(profileId);
      return;
    }
    if (!entry) {
      entry = {};
      bag[name] = entry;
    }
    entry[axis] = clamped;
    persistProfile(profileId);
  }

  function sortValue(name, key) {
    if (key === "name") return name.toLowerCase();
    if (key === "global:offensive") return globalValue(name, "offensive");
    if (key === "global:defensive") return globalValue(name, "defensive");
    const m = /^profile:([^:]+):(offensive|defensive)$/.exec(key);
    if (m) {
      const v = profileDisplay(m[1], name, /** @type {"offensive"|"defensive"} */ (m[2]));
      return v != null ? v : globalValue(name, /** @type {"offensive"|"defensive"} */ (m[2]));
    }
    return name.toLowerCase();
  }

  function sortedNames(filterQ) {
    const q = DN.text(filterQ).toLowerCase();
    const items = allPerkNames.filter((n) => !q || n.toLowerCase().includes(q));
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
      `<button type="button" class="th-sort ratings-sort-btn" data-sort-key="${DN.esc(key)}" ` +
      `aria-sort="${sortAria(key)}">${DN.esc(label)}</button>`
    );
  }

  function groupCount() {
    return 1 + (showOverrides() ? profiles.length : 0);
  }

  function render() {
    const showProf = showOverrides();
    el.grid.style.setProperty("--ratings-groups", String(groupCount()));
    if (el.clearOverrides) el.clearOverrides.hidden = !showProf;

    const names = sortedNames(el.q ? el.q.value : "");
    if (!names.length) {
      el.grid.innerHTML = `<p class="empty-hint">No perks match.</p>`;
      return;
    }

    let head =
      `<div class="ratings-page-head" role="row">` +
      `<div class="ratings-page-corner" role="columnheader">${sortBtn("Perk", "name")}</div>` +
      `<div class="ratings-page-group ratings-page-group-global" role="group" aria-label="Global">` +
      `<div class="ratings-page-group-title">Global</div>` +
      `<div class="ratings-page-group-axes">` +
      `<div role="columnheader">${sortBtn("Off", "global:offensive")}</div>` +
      `<div role="columnheader">${sortBtn("Def", "global:defensive")}</div>` +
      `</div></div>`;

    if (showProf) {
      for (const p of profiles) {
        head +=
          `<div class="ratings-page-group" role="group" aria-label="${DN.esc(p.name)} overrides">` +
          `<div class="ratings-page-group-title">${DN.esc(p.name)}</div>` +
          `<div class="ratings-page-group-axes">` +
          `<div role="columnheader">${sortBtn("Off", `profile:${p.id}:offensive`)}</div>` +
          `<div role="columnheader">${sortBtn("Def", `profile:${p.id}:defensive`)}</div>` +
          `</div></div>`;
      }
    }
    head += `</div>`;

    function axisInput(opts) {
      const {
        layer,
        axis,
        value,
        placeholder,
        overrideCls,
        profileId,
        label,
      } = opts;
      const profileAttr = profileId ? ` data-profile-id="${DN.esc(profileId)}"` : "";
      const valAttr =
        value == null
          ? `value="" placeholder="${placeholder != null ? DN.esc(String(placeholder)) : ""}"`
          : `value="${value}"`;
      return (
        `<label class="rating-axis ${overrideCls}">` +
        `<span class="visually-hidden">${DN.esc(label)}</span>` +
        `<input type="number" class="rating-input" data-layer="${DN.esc(layer)}"${profileAttr} ` +
        `data-axis="${axis}" min="${DN.RATING_MIN}" max="${DN.RATING_MAX}" step="1" ${valAttr} /></label>`
      );
    }

    const rows = names
      .map((name) => {
        const gOff = globalValue(name, "offensive");
        const gDef = globalValue(name, "defensive");
        const gOffOv = DN.perkRatingAxisOrNull(globalBag, name, "offensive") != null;
        const gDefOv = DN.perkRatingAxisOrNull(globalBag, name, "defensive") != null;
        let html =
          `<div class="ratings-page-row" role="row" data-perk="${DN.esc(name)}">` +
          `<span class="rating-name">${DN.esc(name)}</span>` +
          `<div class="ratings-page-pair">` +
          axisInput({
            layer: "global",
            axis: "offensive",
            value: gOff,
            overrideCls: gOffOv ? "is-override" : "is-default",
            label: "Global offensive",
          }) +
          axisInput({
            layer: "global",
            axis: "defensive",
            value: gDef,
            overrideCls: gDefOv ? "is-override" : "is-default",
            label: "Global defensive",
          }) +
          `</div>`;

        if (showProf) {
          for (const p of profiles) {
            html += `<div class="ratings-page-pair">`;
            for (const axis of AXES) {
              const has = profileHas(p.id, name, axis);
              const val = profileDisplay(p.id, name, axis);
              const ph = globalValue(name, axis);
              html += axisInput({
                layer: "profile",
                profileId: p.id,
                axis,
                value: has ? val : null,
                placeholder: ph,
                overrideCls: has ? "is-override" : "is-inherit",
                label: `${p.name} ${axis}`,
              });
            }
            html += `</div>`;
          }
        }
        html += `</div>`;
        return html;
      })
      .join("");

    el.grid.innerHTML = head + rows;
  }

  function setSort(key) {
    if (sortState.key === key) sortState.dir = /** @type {1 | -1} */ (-sortState.dir);
    else {
      sortState.key = key;
      sortState.dir = key === "name" ? 1 : -1;
    }
    render();
  }

  function bind() {
    if (el.q) {
      el.q.addEventListener("input", render);
      el.q.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") ev.preventDefault();
      });
    }

    el.grid.addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-sort-key]");
      if (!btn) return;
      const key = btn.getAttribute("data-sort-key");
      if (key) setSort(key);
    });

    el.grid.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("rating-input")) return;
      const row = input.closest("[data-perk]");
      const perk = row && row.getAttribute("data-perk");
      const axis = input.getAttribute("data-axis");
      const layer = input.getAttribute("data-layer");
      if (!perk || (axis !== "offensive" && axis !== "defensive")) return;

      if (layer === "global") {
        const n = DN.clampPerkRating(Number(input.value) || 0);
        setGlobalAxis(perk, axis, n);
        render();
        return;
      }

      if (layer === "profile") {
        const profileId = input.getAttribute("data-profile-id");
        if (!profileId) return;
        if (input.value === "") {
          setProfileAxis(profileId, perk, axis, null);
        } else {
          setProfileAxis(profileId, perk, axis, Number(input.value));
        }
        render();
      }
    });

    if (el.resetGlobal) {
      el.resetGlobal.addEventListener("click", () => {
        if (!confirm("Reset all global perk ratings to factory defaults? Profile overrides are kept.")) return;
        globalBag = {};
        persistGlobal();
        render();
      });
    }

    if (el.clearOverrides) {
      el.clearOverrides.addEventListener("click", () => {
        if (!confirm("Clear perk-rating overrides for every profile?")) return;
        for (const p of profiles) {
          profileBags[p.id] = {};
          persistProfile(p.id);
        }
        render();
      });
    }
  }

  async function load() {
    try {
      DN.ensurePerkRatingsMigrated();
      const state = DN.ensureProfiles();
      profiles = state.profiles.slice();
      globalBag = DN.loadGlobalPerkRatings();
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
