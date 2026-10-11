(() => {
  "use strict";

  const DN = window.DN;
  const DEFAULTS_URL = "./data/perk_rating_defaults.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";
  const IMAGES_URL = "./data/army_unit_images.json";
  const RATING_MIN = DN.RATING_MIN;
  const RATING_MAX = DN.RATING_MAX;
  const AXES = DN.RATING_AXES;

  const el = {
    strip: document.getElementById("preset-strip"),
    add: document.getElementById("preset-add"),
    remove: document.getElementById("preset-remove"),
    name: document.getElementById("preset-name"),
    save: document.getElementById("army-save"),
    grid: document.getElementById("unit-grid"),
    error: document.getElementById("error"),
    hint: document.getElementById("army-hint"),
    confirmDialog: /** @type {HTMLDialogElement} */ (document.getElementById("army-confirm-dialog")),
    confirmTitle: document.getElementById("army-confirm-title"),
    confirmHint: document.getElementById("army-confirm-hint"),
    confirmList: document.getElementById("army-confirm-list"),
    confirmOk: /** @type {HTMLButtonElement | null} */ (document.getElementById("army-confirm-ok")),
    ratingLayer: document.getElementById("army-rating-layer"),
    simpleDialog: /** @type {HTMLDialogElement} */ (document.getElementById("army-simple-dialog")),
    simpleTitle: document.getElementById("army-simple-title"),
    simpleHint: document.getElementById("army-simple-hint"),
  };

  /** @type {ReturnType<typeof DN.loadArmyPresets>} */
  let state = DN.loadArmyPresets();
  /** @type {Set<string>} draft units for the active preset */
  let draftUnits = new Set();
  /** @type {Record<string, { offensive: number, defensive: number }>} */
  let factoryDefaults = {};
  /** @type {string[]} */
  let allPerkNames = [];
  /** @type {Record<string, string>} unit family → image URL */
  let unitImages = {};

  function showError(msg) {
    el.error.hidden = !msg;
    el.error.textContent = msg || "";
  }

  function clampRating(n) {
    const i = Math.round(n);
    return Math.max(RATING_MIN, Math.min(RATING_MAX, i));
  }

  function activePreset() {
    return state.presets.find((p) => p.id === state.activeId) || state.presets[0];
  }

  function loadDraftFromActive() {
    const p = activePreset();
    draftUnits = new Set(p ? p.units : []);
  }

  function draftSorted() {
    return DN.normalizeArmyUnits([...draftUnits]);
  }

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

  function loadLayers() {
    DN.ensurePerkRatingsMigrated();
    return {
      global: DN.loadGlobalPerkRatings(),
      profile: DN.loadProfilePerkOverrides(DN.activeProfileId()),
    };
  }

  /**
   * @param {Record<string, { offensive?: number, defensive?: number }>} bag
   * @param {string} name
   * @param {"offensive" | "defensive"} axis
   * @param {number} value
   * @param {number} clearWhenEquals clear axis when value matches this
   */
  function setBagAxis(bag, name, axis, value, clearWhenEquals) {
    const clamped = clampRating(value);
    let entry = bag[name];
    if (clamped === clearWhenEquals) {
      if (!entry) return;
      delete entry[axis];
      if (
        !Object.prototype.hasOwnProperty.call(entry, "offensive") &&
        !Object.prototype.hasOwnProperty.call(entry, "defensive")
      ) {
        delete bag[name];
      }
      return;
    }
    if (!entry) {
      entry = {};
      bag[name] = entry;
    }
    entry[axis] = clamped;
  }

  /**
   * @param {string[]} families
   * @param {number | "factory"} target
   * @param {Set<string>} lastApplied
   * @param {"global" | "profile"} layer
   */
  function applyFamilies(families, target, lastApplied, layer) {
    const layers = loadLayers();
    const globalBag = layers.global;
    const profileBag = layers.profile;
    const bag = layer === "profile" ? profileBag : globalBag;

    for (const fam of families) {
      for (const perk of DN.perksForFamily(fam, allPerkNames)) {
        for (const axis of AXES) {
          const value =
            target === "factory"
              ? DN.armyAwareDefault(factoryDefaults, lastApplied, perk, axis)
              : target;
          if (layer === "global") {
            const factory = DN.armyAwareDefault(factoryDefaults, lastApplied, perk, axis);
            setBagAxis(bag, perk, axis, value, factory);
          } else {
            const inherit =
              DN.perkRatingAxisOrNull(globalBag, perk, axis) != null
                ? DN.perkRatingAxisOrNull(globalBag, perk, axis)
                : DN.armyAwareDefault(factoryDefaults, lastApplied, perk, axis);
            setBagAxis(bag, perk, axis, value, inherit);
          }
        }
      }
    }

    if (layer === "profile") DN.saveProfilePerkOverrides(DN.activeProfileId(), profileBag);
    else DN.saveGlobalPerkRatings(globalBag);
  }

  function diffUnits(before, after) {
    const b = new Set(before);
    const a = new Set(after);
    const removed = [...b].filter((u) => !a.has(u)).sort((x, y) => x.localeCompare(y));
    const added = [...a].filter((u) => !b.has(u)).sort((x, y) => x.localeCompare(y));
    return { removed, added };
  }

  function fmtAxisPair(off, def) {
    if (def) return `O${off} / D${def}`;
    return `O${off}`;
  }

  function factoryAxis(name, axis) {
    const entry = factoryDefaults[name];
    if (!entry) return 0;
    return entry[axis] || 0;
  }

  function armyConfigured() {
    try {
      return DN.lsHas(DN.ARMY_PRESETS_KEY);
    } catch {
      return false;
    }
  }

  /**
   * Effective rating: profile override → global → army-aware factory.
   * @param {Record<string, { offensive?: number, defensive?: number }>} globalBag
   * @param {Record<string, { offensive?: number, defensive?: number }>} profileBag
   * @param {Set<string>} applied
   * @param {string} name
   * @param {"offensive" | "defensive"} axis
   */
  function effectiveRating(globalBag, profileBag, applied, name, axis) {
    const stored = DN.storedPerkRating(globalBag, profileBag, name, axis);
    if (stored != null) return stored;
    if (!armyConfigured()) return factoryAxis(name, axis);
    return DN.armyAwareDefault(factoryDefaults, applied, name, axis);
  }

  /**
   * @param {string[]} families
   * @param {Set<string>} currentApplied
   * @param {Set<string>} nextApplied
   * @param {number | "factory"} target
   */
  function buildChangeRows(families, currentApplied, nextApplied, target) {
    const layers = loadLayers();
    /** @type {{ family: string, perk: string, curOff: number, curDef: number, newOff: number, newDef: number }[]} */
    const rows = [];
    for (const fam of families) {
      for (const perk of DN.perksForFamily(fam, allPerkNames)) {
        const curOff = effectiveRating(layers.global, layers.profile, currentApplied, perk, "offensive");
        const curDef = effectiveRating(layers.global, layers.profile, currentApplied, perk, "defensive");
        const newOff =
          target === "factory"
            ? DN.armyAwareDefault(factoryDefaults, nextApplied, perk, "offensive")
            : target;
        const newDef =
          target === "factory"
            ? DN.armyAwareDefault(factoryDefaults, nextApplied, perk, "defensive")
            : target;
        if (curOff === newOff && curDef === newDef) continue;
        rows.push({ family: fam, perk, curOff, curDef, newOff, newDef });
      }
    }
    return rows;
  }

  function renderChangeList(rows) {
    let html = "";
    let lastFam = "";
    for (const row of rows) {
      if (row.family !== lastFam) {
        lastFam = row.family;
        html += `<div class="army-confirm-family">${DN.esc(row.family)}</div>`;
      }
      const short = row.perk.startsWith(row.family + " ")
        ? row.perk.slice(row.family.length + 1)
        : row.perk;
      html +=
        `<div class="army-confirm-row">` +
        `<span class="army-confirm-perk">${DN.esc(short)}</span>` +
        `<span class="army-confirm-cur">${DN.esc(fmtAxisPair(row.curOff, row.curDef))}</span>` +
        `<span class="army-confirm-new">${DN.esc(fmtAxisPair(row.newOff, row.newDef))}</span>` +
        `</div>`;
    }
    el.confirmList.innerHTML = html || `<p class="army-hint">No rating changes needed.</p>`;
  }

  function selectedRatingLayer() {
    const checked = el.ratingLayer && el.ratingLayer.querySelector('input[name="army-rating-layer"]:checked');
    if (!(checked instanceof HTMLInputElement)) return null;
    return checked.value === "profile" || checked.value === "global" ? checked.value : null;
  }

  function syncConfirmApplyEnabled() {
    if (el.confirmOk) el.confirmOk.disabled = !selectedRatingLayer();
  }

  /**
   * @param {{ title: string, hint: string, rows: ReturnType<typeof buildChangeRows> }} opts
   * @returns {Promise<"global" | "profile" | null>}
   */
  function showRatingConfirm(opts) {
    return new Promise((resolve) => {
      el.confirmTitle.textContent = opts.title;
      el.confirmHint.textContent = opts.hint;
      renderChangeList(opts.rows);
      if (el.ratingLayer) {
        for (const input of el.ratingLayer.querySelectorAll('input[name="army-rating-layer"]')) {
          if (input instanceof HTMLInputElement) input.checked = false;
        }
      }
      syncConfirmApplyEnabled();
      const dialog = el.confirmDialog;
      const onChange = () => syncConfirmApplyEnabled();
      if (el.ratingLayer) el.ratingLayer.addEventListener("change", onChange);
      const onClose = () => {
        dialog.removeEventListener("close", onClose);
        if (el.ratingLayer) el.ratingLayer.removeEventListener("change", onChange);
        if (dialog.returnValue !== "ok") {
          resolve(null);
          return;
        }
        resolve(selectedRatingLayer());
      };
      dialog.addEventListener("close", onClose);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else resolve(null);
    });
  }

  /**
   * @param {{ title: string, hint: string, okLabel?: string }} opts
   * @returns {Promise<boolean>}
   */
  function showSimpleConfirm(opts) {
    return new Promise((resolve) => {
      el.simpleTitle.textContent = opts.title;
      el.simpleHint.textContent = opts.hint;
      const okBtn = el.simpleDialog.querySelector('button[value="ok"]');
      if (okBtn) okBtn.textContent = opts.okLabel || "OK";
      const dialog = el.simpleDialog;
      const onClose = () => {
        dialog.removeEventListener("close", onClose);
        resolve(dialog.returnValue === "ok");
      };
      dialog.addEventListener("close", onClose);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else resolve(false);
    });
  }

  /**
   * @param {string[]} nextUnits
   */
  async function promptAndApplyDelta(nextUnits) {
    const prev = DN.normalizeArmyUnits(state.lastApplied);
    const next = DN.normalizeArmyUnits(nextUnits);
    const { removed, added } = diffUnits(prev, next);
    const prevEffective = DN.armyEffectiveAppliedSet(prev);
    const nextEffective = DN.armyEffectiveAppliedSet(next);

    if (removed.length) {
      // APC off ⇒ also offer zeroing Heavy Infantry unless HI stays explicitly selected.
      const ratingRemoved = DN.armyRatingFamilies(removed, next);
      const rows = buildChangeRows(ratingRemoved, prevEffective, nextEffective, 0);
      if (rows.length) {
        const layer = await showRatingConfirm({
          title: "Zero removed units",
          hint: "Set these removed units’ perk ratings to 0? Choose Global or This profile (required). Includes linked stats such as Heavy Infantry when APC is removed.",
          rows,
        });
        if (layer) applyFamilies(ratingRemoved, 0, nextEffective, layer);
      }
    }

    if (added.length) {
      // APC on ⇒ also offer factory defaults for Heavy Infantry in the background.
      const ratingAdded = DN.armyRatingFamilies(added, next);
      const rows = buildChangeRows(ratingAdded, prevEffective, nextEffective, "factory");
      if (rows.length) {
        const layer = await showRatingConfirm({
          title: "Restore added units",
          hint: "Set these units’ perk ratings to factory defaults? Choose Global or This profile (required). APC also updates Heavy Infantry ratings.",
          rows,
        });
        if (layer) applyFamilies(ratingAdded, "factory", nextEffective, layer);
      }
    }

    state.lastApplied = next;
  }

  function persistState() {
    DN.saveArmyPresets(state);
    state = DN.loadArmyPresets();
  }

  function renderPresets() {
    el.strip.innerHTML = state.presets
      .map((p) => {
        const cur = p.id === state.activeId ? " is-active" : "";
        return (
          `<button type="button" class="seg-btn army-preset-btn${cur}" data-preset-id="${DN.esc(p.id)}" aria-pressed="${
            cur ? "true" : "false"
          }">` +
          `${DN.esc(p.name)}</button>`
        );
      })
      .join("");
    const active = activePreset();
    el.name.value = active ? active.name : "";
    el.add.disabled = state.presets.length >= DN.ARMY_PRESET_MAX;
    el.remove.disabled = state.presets.length <= 1;
  }

  function linkNote(fam) {
    const includes = DN.armyIncludes(fam);
    if (!includes.length) return "";
    return (
      `<span class="army-unit-link" title="Save can also update ${includes.join(", ")} ratings">` +
      `ratings + ${DN.esc(includes.join(", "))}</span>`
    );
  }

  function renderUnits() {
    el.grid.innerHTML = DN.ARMY_UNIT_GROUPS.map((group) => {
      const checks = group.units
        .map((fam) => {
          const checked = draftUnits.has(fam) ? " checked" : "";
          const note = linkNote(fam);
          const thumb = DN.thumbHtml(
            unitImages[fam] || "",
            fam,
            "entity-thumb--army"
          );
          return (
            `<label class="army-unit-check${note ? " is-linked" : ""}">` +
            thumb +
            `<input type="checkbox" data-unit="${DN.esc(fam)}"${checked} />` +
            `<span class="army-unit-label"><span>${DN.esc(fam)}</span>${note}</span>` +
            `</label>`
          );
        })
        .join("");
      return (
        `<section class="army-unit-group" data-group="${DN.esc(group.id)}" aria-label="${DN.esc(group.label)}">` +
        `<h3 class="army-unit-group-title">${DN.esc(group.label)}</h3>` +
        `<div class="army-unit-grid">${checks}</div>` +
        `</section>`
      );
    }).join("");
  }

  function render() {
    renderPresets();
    renderUnits();
  }

  function saveActiveDraftIntoPreset() {
    const p = activePreset();
    if (!p) return;
    p.units = draftSorted();
    const name = DN.text(el.name.value) || p.name;
    p.name = name;
  }

  async function activatePreset(id, { applyRatings }) {
    if (!state.presets.some((p) => p.id === id)) return;
    if (id === state.activeId && !applyRatings) {
      loadDraftFromActive();
      render();
      return;
    }
    state.activeId = id;
    loadDraftFromActive();
    if (applyRatings) {
      await promptAndApplyDelta(draftSorted());
    }
    persistState();
    loadDraftFromActive();
    render();
  }

  function bind() {
    el.strip.addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-preset-id]");
      if (!btn) return;
      const id = btn.getAttribute("data-preset-id");
      if (!id || id === state.activeId) return;
      void activatePreset(id, { applyRatings: true });
    });

    el.grid.addEventListener("change", (ev) => {
      const input = /** @type {HTMLInputElement} */ (ev.target);
      if (!input.matches("input[data-unit]")) return;
      const unit = input.getAttribute("data-unit");
      if (!unit) return;
      if (input.checked) draftUnits.add(unit);
      else draftUnits.delete(unit);
    });

    el.name.addEventListener("change", () => {
      const p = activePreset();
      if (!p) return;
      p.name = DN.text(el.name.value) || p.name;
      persistState();
      renderPresets();
    });

    el.add.addEventListener("click", () => {
      if (state.presets.length >= DN.ARMY_PRESET_MAX) return;
      saveActiveDraftIntoPreset();
      const id = DN.newArmyPresetId();
      state.presets.push({
        id,
        name: `Preset ${state.presets.length + 1}`,
        units: [],
      });
      state.activeId = id;
      loadDraftFromActive();
      persistState();
      render();
    });

    el.remove.addEventListener("click", async () => {
      if (state.presets.length <= 1) return;
      const dying = activePreset();
      if (!dying) return;
      const ok = await showSimpleConfirm({
        title: "Remove preset",
        hint: `Remove “${dying.name}”? This cannot be undone.`,
        okLabel: "Remove",
      });
      if (!ok) return;
      state.presets = state.presets.filter((p) => p.id !== dying.id);
      state.activeId = state.presets[0].id;
      loadDraftFromActive();
      await promptAndApplyDelta(draftSorted());
      persistState();
      render();
    });

    el.save.addEventListener("click", async () => {
      saveActiveDraftIntoPreset();
      await promptAndApplyDelta(draftSorted());
      persistState();
      loadDraftFromActive();
      render();
      if (el.hint) {
        el.hint.textContent =
          `Saved “${activePreset().name}” · ${draftSorted().length} troops · ` +
          `applied army drives Priority perk defaults.`;
      }
    });
  }

  async function load() {
    try {
      const [mapRes, defRes, imgRes] = await Promise.all([
        fetch(MAPPING_URL),
        fetch(DEFAULTS_URL),
        fetch(IMAGES_URL, { cache: "no-store" }),
      ]);
      if (!mapRes.ok) throw new Error(`Failed to load ${MAPPING_URL} (${mapRes.status})`);
      if (!defRes.ok) throw new Error(`Failed to load ${DEFAULTS_URL} (${defRes.status})`);
      const canonPerk = DN.makeCanonPerk(DN.parseMappingCsv(await mapRes.text()));
      const rawDefaults = await defRes.json();
      unitImages = imgRes.ok ? DN.imageUrlMap(await imgRes.json()) : {};
      /** @type {Record<string, { offensive: number, defensive: number }>} */
      const defaults = {};
      for (const [k, v] of Object.entries(rawDefaults || {})) {
        const canon = canonPerk(k) || DN.polishPerk(DN.text(k));
        const entry = normalizeDefaultEntry(v);
        if (!canon || !entry) continue;
        defaults[canon] = entry;
      }
      factoryDefaults = defaults;
      allPerkNames = Object.keys(defaults).sort((a, b) => a.localeCompare(b));
      state = DN.loadArmyPresets();
      loadDraftFromActive();
      showError("");
      render();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  bind();
  load();
})();
