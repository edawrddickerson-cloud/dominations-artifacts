(() => {
  "use strict";

  const DN = window.DN;
  if (!DN) {
    console.error("shared.js must load before collection.js");
    return;
  }

  const DATA_URL = "./data/artifacts.json";
  const IMAGES_URL = "./data/artifact_images.json";
  const MAPPING_URL = "./data/perk_name_mapping.csv";
  const HALL_CAP = 3;

  /** @type {{ key: string, label: string, count: number }[]} */
  const MAIN_TYPE_EXHIBITS = [
    { key: "weapon", label: "Weapon Exhibit", count: 2 },
    { key: "armor", label: "Armor Exhibit", count: 2 },
    { key: "jewelry", label: "Jewelry Exhibit", count: 2 },
    { key: "pottery", label: "Pottery Exhibit", count: 2 },
  ];
  /** @type {{ key: string, label: string, count: number }[]} */
  const WAR_TYPE_EXHIBITS = [
    { key: "war-weapon", label: "War Weapon Exhibit", count: 2 },
    { key: "war-armor", label: "War Armor Exhibit", count: 2 },
    { key: "war-equipment", label: "War Equipment Exhibit", count: 4 },
  ];

  const el = {
    error: document.getElementById("error"),
    hallMain: document.getElementById("hall-main"),
    hallWar: document.getElementById("hall-war"),
    viewList: document.getElementById("view-list"),
    viewStructured: document.getElementById("view-structured"),
    modeActual: document.getElementById("mode-actual"),
    modeMax: document.getElementById("mode-max"),
    hint: document.getElementById("collection-hint"),
    list: document.getElementById("collection-list"),
    board: document.getElementById("museum-board"),
    totalsSub: document.getElementById("totals-sub"),
    totalsList: document.getElementById("totals-list"),
    picker: document.getElementById("slot-picker"),
    pickerTitle: document.getElementById("slot-picker-title"),
    pickerList: document.getElementById("slot-picker-list"),
  };

  /** @type {object[]} */
  let rows = [];
  /** @type {Record<string, object>} */
  let byId = {};
  /** @type {Set<string>} */
  let collected = new Set();
  /** @type {Record<string, string>} artifact_id → image URL */
  let artifactImages = {};
  /** @type {(name: string) => string} */
  let canonPerk = (n) => DN.polishPerk(n);
  let loadout = DN.loadLoadout();
  let levels = DN.loadLevels();
  let ui = DN.loadCollectionUi();

  /** @type {{ kind: "hall" | "hermitage", grade?: string } | null} */
  let pickerTarget = null;

  function showError(msg) {
    if (!el.error) return;
    el.error.hidden = !msg;
    el.error.textContent = msg || "";
  }

  function hallState() {
    return loadout[ui.hall] || DN.emptyHallLoadout();
  }

  /** @returns {"hall" | "showcase" | "hermitage"} */
  function modeOf(id) {
    const h = hallState();
    if (h.hermitage === id) return "hermitage";
    if (h.mains.includes(id)) return "hall";
    return "showcase";
  }

  function slotLabel(id) {
    const mode = modeOf(id);
    if (mode === "hermitage") return "Hermitage";
    if (mode === "hall") {
      const row = byId[id];
      const grade = row ? DN.text(row.grade) : "";
      if (grade === "Mythical") return "Mythical Hall";
      if (grade === "Legendary") return "Legendary Hall";
      return "Hall";
    }
    return "Showcase";
  }

  function persistLoadout() {
    DN.saveLoadout(loadout);
  }

  /** Owned non-Hall / non-Hermitage artifacts always contribute one perk (default first). */
  function ensureSinglesDefaults() {
    let changed = false;
    for (const hall of ["Main", "War"]) {
      const h = loadout[hall];
      const mainSet = new Set(h.mains);
      const herm = h.hermitage || null;
      for (const row of rows) {
        const id = DN.artifactKey(row);
        if (!collected.has(id) || DN.text(row.hall) !== hall) continue;
        if (mainSet.has(id) || id === herm) {
          if (Object.prototype.hasOwnProperty.call(h.singles, id)) {
            delete h.singles[id];
            changed = true;
          }
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(h.singles, id)) continue;
        const perks = DN.perksOf(row, canonPerk);
        if (!perks.length) continue;
        h.singles[id] = perks[0].index;
        changed = true;
      }
    }
    if (changed) persistLoadout();
  }

  /** Keep first HALL_CAP per grade; demote extras to Showcase. */
  function enforceHallCaps() {
    let changed = false;
    for (const hall of ["Main", "War"]) {
      const h = loadout[hall];
      const kept = [];
      const counts = { Legendary: 0, Mythical: 0 };
      for (const id of h.mains) {
        const row = byId[id];
        if (!row || !collected.has(id)) {
          changed = true;
          continue;
        }
        const grade = DN.text(row.grade);
        if (grade !== "Legendary" && grade !== "Mythical") {
          changed = true;
          continue;
        }
        if (counts[grade] >= HALL_CAP) {
          const perks = DN.perksOf(row, canonPerk);
          if (perks.length) h.singles[id] = perks[0].index;
          changed = true;
          continue;
        }
        counts[grade] += 1;
        kept.push(id);
      }
      if (kept.length !== h.mains.length) {
        h.mains = kept;
        changed = true;
      }
      if (h.hermitage) {
        const row = byId[h.hermitage];
        if (!row || !collected.has(h.hermitage) || DN.text(row.grade) !== "Legendary") {
          if (row && collected.has(h.hermitage)) {
            const perks = DN.perksOf(row, canonPerk);
            if (perks.length) h.singles[h.hermitage] = perks[0].index;
          }
          h.hermitage = null;
          changed = true;
        }
      }
    }
    if (changed) persistLoadout();
  }

  function mainsOfGrade(grade) {
    const h = hallState();
    return h.mains.filter((id) => {
      const row = byId[id];
      return row && DN.text(row.grade) === grade;
    });
  }

  function actualPerkValue(id, perk) {
    const range = DN.effectivePerkRange(perk);
    if (range.base == null || range.max == null) return perk.base;
    const stored = levels[id] && levels[id][String(perk.index)];
    const current = stored != null ? Number(stored) : range.base;
    return DN.clampPerkLevel(range.base, range.max, current);
  }

  function displayPerkValue(id, perk) {
    const range = DN.effectivePerkRange(perk);
    if (ui.valueMode === "max") return range.max != null ? range.max : perk.base;
    return actualPerkValue(id, perk);
  }

  function canStepPerk(perk) {
    if (ui.valueMode !== "actual") return false;
    const range = DN.effectivePerkRange(perk);
    return range.base != null && range.max != null && range.base !== range.max;
  }

  function formatNum(n) {
    if (n == null || !Number.isFinite(n)) return DN.BLANK;
    return String(n);
  }

  function clearFromLoadout(h, id) {
    h.mains = h.mains.filter((x) => x !== id);
    delete h.singles[id];
    if (h.hermitage === id) h.hermitage = null;
  }

  function demoteToShowcase(h, id) {
    const row = byId[id];
    if (!row) return;
    clearFromLoadout(h, id);
    const perks = DN.perksOf(row, canonPerk);
    if (perks.length) h.singles[id] = perks[0].index;
  }

  /**
   * @param {string} id
   * @param {"hall" | "showcase" | "hermitage"} mode
   * @param {number} [perkIndex]
   */
  function setMode(id, mode, perkIndex) {
    const row = byId[id];
    if (!row) return;
    if (mode !== "hall" && mode !== "showcase" && mode !== "hermitage") return;
    const h = hallState();
    const grade = DN.text(row.grade);

    if (mode === "hall") {
      if (grade !== "Legendary" && grade !== "Mythical") {
        showError("Only Legendary or Mythical artifacts can be Hall.");
        return;
      }
      if (!h.mains.includes(id)) {
        const used = mainsOfGrade(grade).length;
        if (used >= HALL_CAP) {
          showError(`${grade} Hall slots full (${HALL_CAP}/${HALL_CAP}) for ${ui.hall}.`);
          return;
        }
      }
    } else if (mode === "hermitage") {
      if (grade !== "Legendary") {
        showError("Hermitage accepts Legendary only (not Mythical).");
        return;
      }
    } else {
      const perks = DN.perksOf(row, canonPerk);
      if (!perks.length) {
        showError("This artifact has no perks to select.");
        return;
      }
    }

    if (mode === "hermitage" && h.hermitage && h.hermitage !== id) {
      demoteToShowcase(h, h.hermitage);
    }

    clearFromLoadout(h, id);

    if (mode === "hall") {
      h.mains.push(id);
      showError("");
    } else if (mode === "hermitage") {
      h.hermitage = id;
      showError("");
    } else {
      const perks = DN.perksOf(row, canonPerk);
      const idx =
        perkIndex && perks.some((p) => p.index === perkIndex)
          ? perkIndex
          : perks[0].index;
      h.singles[id] = idx;
      showError("");
    }

    loadout[ui.hall] = h;
    persistLoadout();
    render();
  }

  function setSinglePerk(id, perkIndex) {
    const h = hallState();
    if (!Object.prototype.hasOwnProperty.call(h.singles, id)) return;
    h.singles[id] = perkIndex;
    loadout[ui.hall] = h;
    persistLoadout();
    render();
  }

  function bumpLevel(id, perkIndex, dir) {
    const row = byId[id];
    if (!row) return;
    const perk = DN.perksOf(row, canonPerk).find((p) => p.index === perkIndex);
    if (!perk) return;
    const range = DN.effectivePerkRange(perk);
    if (range.base == null || range.max == null || range.base === range.max) return;
    const current = actualPerkValue(id, perk);
    if (current == null) return;
    const next = DN.stepPerkLevel(range.base, range.max, current, dir);
    if (!levels[id]) levels[id] = {};
    if (next === range.base) delete levels[id][String(perkIndex)];
    else levels[id][String(perkIndex)] = next;
    if (levels[id] && !Object.keys(levels[id]).length) delete levels[id];
    DN.saveLevels(levels);
    render();
  }

  function ownedForHall() {
    const gradeRank = (row) => {
      const g = DN.text(row.grade);
      if (g === "Mythical") return 0;
      if (g === "Legendary") return 1;
      return 9;
    };
    const modeRank = (id) => {
      const m = modeOf(id);
      if (m === "hermitage") return 0;
      if (m === "hall") return 1;
      return 2;
    };

    return rows
      .filter((row) => collected.has(DN.artifactKey(row)) && DN.text(row.hall) === ui.hall)
      .slice()
      .sort((a, b) => {
        const idA = DN.artifactKey(a);
        const idB = DN.artifactKey(b);
        const mode = modeRank(idA) - modeRank(idB);
        if (mode) return mode;
        const grade = gradeRank(a) - gradeRank(b);
        if (grade) return grade;
        return DN.text(a.name).localeCompare(DN.text(b.name), undefined, { sensitivity: "base" });
      });
  }

  /** Eligible owned artifacts for a Structured slot picker. */
  function pickerCandidates(kind, grade) {
    return ownedForHall().filter((row) => {
      const id = DN.artifactKey(row);
      const g = DN.text(row.grade);
      if (kind === "hermitage") return g === "Legendary";
      if (kind === "hall") return g === grade;
      return false;
    });
  }

  function openPicker(kind, grade) {
    pickerTarget = kind === "hermitage" ? { kind: "hermitage" } : { kind: "hall", grade };
    const title =
      kind === "hermitage"
        ? "Hermitage — Legendary"
        : `${grade} Hall slot`;
    el.pickerTitle.textContent = title;
    const candidates = pickerCandidates(kind, grade);
    if (!candidates.length) {
      el.pickerList.innerHTML = `<p class="collection-empty">No eligible owned artifacts.</p>`;
    } else {
      el.pickerList.innerHTML = candidates
        .map((row) => {
          const id = DN.artifactKey(row);
          const slot = slotLabel(id);
          const thumb = DN.thumbHtml(
            artifactImages[id] || "",
            DN.show(row.name),
            "entity-thumb--collection"
          );
          return (
            `<button type="button" class="slot-picker-item" data-action="picker-pick" data-id="${DN.esc(id)}">` +
            `<span class="slot-picker-thumb">${thumb}</span>` +
            `<span class="slot-picker-meta">` +
            `<span class="slot-picker-name">${DN.esc(DN.show(row.name))}</span>` +
            `<span class="slot-picker-slot">${DN.esc(slot)}</span>` +
            `</span></button>`
          );
        })
        .join("");
    }
    el.picker.hidden = false;
  }

  function closePicker() {
    pickerTarget = null;
    el.picker.hidden = true;
    el.pickerList.innerHTML = "";
  }

  /** @returns {{ name: string, value: number, sources: string[] }[]} */
  function computeTotals() {
    /** @type {Record<string, { value: number, sources: string[] }>} */
    const map = {};
    const h = hallState();

    function add(name, value, source) {
      if (!name || value == null || !Number.isFinite(value)) return;
      if (!map[name]) map[name] = { value: 0, sources: [] };
      map[name].value += value;
      map[name].sources.push(source);
    }

    function addAllPerks(id, tag) {
      const row = byId[id];
      if (!row) return;
      const label = `${DN.show(row.name)} (${tag})`;
      for (const perk of DN.perksOf(row, canonPerk)) {
        add(perk.name, displayPerkValue(id, perk), label);
      }
    }

    for (const id of h.mains) addAllPerks(id, "Hall");
    if (h.hermitage) addAllPerks(h.hermitage, "Hermitage");

    for (const [id, idx] of Object.entries(h.singles)) {
      const row = byId[id];
      if (!row) continue;
      const perk = DN.perksOf(row, canonPerk).find((p) => p.index === idx);
      if (!perk) continue;
      const label = `${DN.show(row.name)} · Showcase perk ${idx}`;
      add(perk.name, displayPerkValue(id, perk), label);
    }

    return Object.entries(map)
      .map(([name, v]) => ({ name, value: v.value, sources: v.sources }))
      .sort((a, b) => {
        const absA = Math.abs(a.value);
        const absB = Math.abs(b.value);
        if (absB !== absA) return absB - absA;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
  }

  function syncControls() {
    el.hallMain.classList.toggle("is-active", ui.hall === "Main");
    el.hallWar.classList.toggle("is-active", ui.hall === "War");
    el.viewList.classList.toggle("is-active", ui.viewMode === "list");
    el.viewStructured.classList.toggle("is-active", ui.viewMode === "structured");
    el.modeActual.classList.toggle("is-active", ui.valueMode === "actual");
    el.modeMax.classList.toggle("is-active", ui.valueMode === "max");
    el.hallMain.setAttribute("aria-pressed", ui.hall === "Main" ? "true" : "false");
    el.hallWar.setAttribute("aria-pressed", ui.hall === "War" ? "true" : "false");
    el.viewList.setAttribute("aria-pressed", ui.viewMode === "list" ? "true" : "false");
    el.viewStructured.setAttribute("aria-pressed", ui.viewMode === "structured" ? "true" : "false");
    el.modeActual.setAttribute("aria-pressed", ui.valueMode === "actual" ? "true" : "false");
    el.modeMax.setAttribute("aria-pressed", ui.valueMode === "max" ? "true" : "false");

    el.hint.textContent =
      ui.viewMode === "structured"
        ? "Structured board: click empty Hall/Hermitage slots to assign; click a filled tile to move to Showcase. Type exhibits are placeholders."
        : ui.valueMode === "max"
          ? "Showing fully upgraded (max) values. Mythical max uses the listed value when the data has no separate max."
          : "Actual starts at the low end; use + / − toward max. Mythical (single listed value) stays fixed.";
  }

  function renderArtifactCard(row) {
    const id = DN.artifactKey(row);
    const mode = modeOf(id);
    const perks = DN.perksOf(row, canonPerk);
    const singleIdx = hallState().singles[id];
    const grade = DN.text(row.grade);
    const slot = slotLabel(id);
    const canHermitage = grade === "Legendary";

    const modeBtns =
      `<div class="mode-seg" role="group" aria-label="Contribution mode">` +
      `<button type="button" class="mode-btn${mode === "hall" ? " is-active" : ""}" data-action="mode" data-id="${DN.esc(id)}" data-mode="hall" title="All perks count (max ${HALL_CAP} ${DN.esc(grade)} Hall)">Hall</button>` +
      `<button type="button" class="mode-btn${mode === "showcase" ? " is-active" : ""}" data-action="mode" data-id="${DN.esc(id)}" data-mode="showcase" title="One perk counts">Showcase</button>` +
      (canHermitage
        ? `<button type="button" class="mode-btn${mode === "hermitage" ? " is-active" : ""}" data-action="mode" data-id="${DN.esc(id)}" data-mode="hermitage" title="Hermitage: all perks (1 slot)">Hermitage</button>`
        : "") +
      `</div>`;

    let perkHtml = "";
    if (!perks.length) {
      perkHtml = `<p class="card-empty">${DN.blankSpan("no perks")}</p>`;
    } else if (mode === "hall" || mode === "hermitage") {
      perkHtml =
        `<ul class="card-perks">` +
        perks
          .map((p) => {
            const v = displayPerkValue(id, p);
            const steppers = canStepPerk(p)
              ? `<span class="lvl-btns">` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="-1" aria-label="Lower ${DN.esc(p.name)}">−</button>` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="1" aria-label="Raise ${DN.esc(p.name)}">+</button>` +
                `</span>`
              : "";
            return (
              `<li class="is-active-perk">` +
              `<span class="perk-name">${DN.esc(p.name || DN.BLANK)}</span>` +
              `<span class="perk-vals">${DN.esc(formatNum(v))}${steppers}</span>` +
              `</li>`
            );
          })
          .join("") +
        `</ul>`;
    } else {
      perkHtml =
        `<ul class="card-perks">` +
        perks
          .map((p) => {
            const selected = p.index === singleIdx;
            const v = displayPerkValue(id, p);
            const steppers = selected && canStepPerk(p)
              ? `<span class="lvl-btns">` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="-1" aria-label="Lower ${DN.esc(p.name)}">−</button>` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="1" aria-label="Raise ${DN.esc(p.name)}">+</button>` +
                `</span>`
              : "";
            return (
              `<li class="${selected ? "is-active-perk" : "is-dim"}">` +
              `<label class="single-pick">` +
              `<input type="radio" name="single-${DN.esc(id)}" data-action="single-perk" data-id="${DN.esc(id)}" data-perk="${p.index}"${selected ? " checked" : ""} />` +
              `<span class="perk-name">${DN.esc(p.name || DN.BLANK)}</span>` +
              `</label>` +
              `<span class="perk-vals">${DN.esc(formatNum(v))}${steppers}</span>` +
              `</li>`
            );
          })
          .join("") +
        `</ul>`;
    }

    const thumb = DN.thumbHtml(
      artifactImages[id] || "",
      DN.show(row.name),
      "entity-thumb--collection"
    );
    return (
      `<article class="artifact-card mode-${mode}" data-artifact-id="${DN.esc(id)}">` +
      `<div class="card-thumb">${thumb}</div>` +
      `<div class="card-body">` +
      `<header class="card-head">` +
      `<div class="card-title">` +
      `<span class="card-name">${DN.esc(DN.show(row.name))}</span>` +
      `<span class="card-meta">${DN.esc(grade)} · ${DN.esc(DN.show(row.hall))} · <span class="slot-badge slot-badge--${mode}">${DN.esc(slot)}</span></span>` +
      `</div>${modeBtns}</header>${perkHtml}</div></article>`
    );
  }

  function tileHtml(opts) {
    const {
      filled,
      id,
      label,
      emptyAction,
      emptyGrade,
      placeholder,
    } = opts;
    if (placeholder) {
      return (
        `<div class="museum-tile is-placeholder" title="Placeholder — common artifacts not in Priority data">` +
        `<span class="museum-tile-label">${DN.esc(label)}</span>` +
        `<span class="museum-tile-empty">—</span>` +
        `</div>`
      );
    }
    if (filled && id) {
      const row = byId[id];
      const name = row ? DN.show(row.name) : id;
      const thumb = DN.thumbHtml(
        artifactImages[id] || "",
        name,
        "entity-thumb--museum"
      );
      return (
        `<button type="button" class="museum-tile is-filled" data-action="tile-clear" data-id="${DN.esc(id)}" title="Move to Showcase">` +
        `<span class="museum-tile-label">${DN.esc(label)}</span>` +
        `<span class="museum-tile-thumb">${thumb}</span>` +
        `<span class="museum-tile-name">${DN.esc(name)}</span>` +
        `</button>`
      );
    }
    const gradeAttr = emptyGrade ? ` data-grade="${DN.esc(emptyGrade)}"` : "";
    return (
      `<button type="button" class="museum-tile is-empty" data-action="${DN.esc(emptyAction)}"${gradeAttr} title="Assign">` +
      `<span class="museum-tile-label">${DN.esc(label)}</span>` +
      `<span class="museum-tile-empty">+</span>` +
      `</button>`
    );
  }

  function renderShowcaseTile(row) {
    const id = DN.artifactKey(row);
    const perks = DN.perksOf(row, canonPerk);
    const singleIdx = hallState().singles[id];
    const thumb = DN.thumbHtml(
      artifactImages[id] || "",
      DN.show(row.name),
      "entity-thumb--museum"
    );
    const perkOpts = perks
      .map((p) => {
        const selected = p.index === singleIdx ? " selected" : "";
        const v = displayPerkValue(id, p);
        const valLabel =
          v == null || !Number.isFinite(v)
            ? ""
            : ` (${v > 0 ? "+" : ""}${v}%)`;
        const name = p.name || "Perk " + p.index;
        return `<option value="${p.index}"${selected}>${DN.esc(name + valLabel)}</option>`;
      })
      .join("");
    return (
      `<div class="museum-tile is-showcase" data-artifact-id="${DN.esc(id)}">` +
      `<span class="museum-tile-thumb">${thumb}</span>` +
      `<span class="museum-tile-name">${DN.esc(DN.show(row.name))}</span>` +
      (perks.length
        ? `<select class="museum-showcase-perk" data-action="showcase-perk" data-id="${DN.esc(id)}" aria-label="Showcase perk for ${DN.esc(DN.show(row.name))}">${perkOpts}</select>`
        : "") +
      `</div>`
    );
  }

  function renderBoard() {
    const h = hallState();
    const mythIds = mainsOfGrade("Mythical");
    const legIds = mainsOfGrade("Legendary");
    const typeExhibits = ui.hall === "War" ? WAR_TYPE_EXHIBITS : MAIN_TYPE_EXHIBITS;

    let mythTiles = "";
    for (let i = 0; i < HALL_CAP; i++) {
      const id = mythIds[i] || null;
      mythTiles += tileHtml({
        filled: !!id,
        id,
        label: `Mythical ${i + 1}`,
        emptyAction: "slot-hall",
        emptyGrade: "Mythical",
      });
    }

    let legTiles = "";
    for (let i = 0; i < HALL_CAP; i++) {
      const id = legIds[i] || null;
      legTiles += tileHtml({
        filled: !!id,
        id,
        label: `Legendary ${i + 1}`,
        emptyAction: "slot-hall",
        emptyGrade: "Legendary",
      });
    }

    const hermId = h.hermitage || null;
    const hermTile = tileHtml({
      filled: !!hermId,
      id: hermId,
      label: "Hermitage",
      emptyAction: "slot-hermitage",
    });

    const typeGroups = typeExhibits
      .map((ex) => {
        let tiles = "";
        for (let i = 0; i < ex.count; i++) {
          tiles += tileHtml({
            placeholder: true,
            label: `${ex.label} ${i + 1}`,
          });
        }
        return (
          `<div class="museum-section">` +
          `<h3 class="museum-section-title">${DN.esc(ex.label)}</h3>` +
          `<div class="museum-row museum-row--4">${tiles}</div>` +
          `</div>`
        );
      })
      .join("");

    const showcaseRows = ownedForHall().filter((row) => modeOf(DN.artifactKey(row)) === "showcase");
    const showcaseHtml = showcaseRows.length
      ? `<div class="museum-showcase-grid">${showcaseRows.map(renderShowcaseTile).join("")}</div>`
      : `<p class="collection-empty">No Showcase artifacts.</p>`;

    el.board.innerHTML =
      `<div class="museum-section">` +
      `<h3 class="museum-section-title">Hermitage · Mythical Hall</h3>` +
      `<div class="museum-row museum-row--4">${hermTile}${mythTiles}</div>` +
      `</div>` +
      `<div class="museum-section">` +
      `<h3 class="museum-section-title">Legendary Hall</h3>` +
      `<div class="museum-row museum-row--4">${legTiles}</div>` +
      `</div>` +
      `<div class="museum-type-exhibits">${typeGroups}</div>` +
      `<div class="museum-section">` +
      `<h3 class="museum-section-title">Showcase</h3>` +
      showcaseHtml +
      `</div>`;
  }

  function renderTotals() {
    const totals = computeTotals();
    const modeLabel = ui.valueMode === "max" ? "max" : "actual";
    el.totalsSub.textContent = totals.length
      ? `${totals.length} perks · ${ui.hall} · ${modeLabel}`
      : `No active contributions · ${ui.hall}`;

    if (!totals.length) {
      el.totalsList.innerHTML =
        `<p class="totals-empty">Set an owned artifact to Hall, Hermitage, or Showcase to build totals.</p>`;
      return;
    }

    el.totalsList.innerHTML = totals
      .map((t) => {
        const cls = t.value > 0 ? "pref-pos" : t.value < 0 ? "pref-neg" : "";
        const sign = t.value > 0 ? "+" : "";
        const tip = DN.esc(t.sources.join(" · "));
        return (
          `<div class="total-row" title="${tip}">` +
          `<span class="total-name">${DN.esc(t.name)}</span>` +
          `<span class="total-val ${cls}">${sign}${t.value}</span>` +
          `</div>`
        );
      })
      .join("");
  }

  function render() {
    syncControls();
    const owned = ownedForHall();
    const structured = ui.viewMode === "structured";
    el.list.hidden = structured;
    el.board.hidden = !structured;

    if (!structured) {
      if (!collected.size) {
        el.list.innerHTML =
          `<p class="collection-empty">No owned artifacts yet. Mark them on the <a href="artifacts.html">Artifacts Priority</a> page.</p>`;
      } else if (!owned.length) {
        el.list.innerHTML = `<p class="collection-empty">Nothing owned in ${DN.esc(ui.hall)} hall.</p>`;
      } else {
        el.list.innerHTML = owned.map(renderArtifactCard).join("");
      }
    } else {
      renderBoard();
    }

    renderTotals();
  }

  function bind() {
    el.hallMain.addEventListener("click", () => {
      ui.hall = "Main";
      DN.saveCollectionUi(ui);
      showError("");
      closePicker();
      render();
    });
    el.hallWar.addEventListener("click", () => {
      ui.hall = "War";
      DN.saveCollectionUi(ui);
      showError("");
      closePicker();
      render();
    });
    el.viewList.addEventListener("click", () => {
      ui.viewMode = "list";
      DN.saveCollectionUi(ui);
      closePicker();
      render();
    });
    el.viewStructured.addEventListener("click", () => {
      ui.viewMode = "structured";
      DN.saveCollectionUi(ui);
      closePicker();
      render();
    });
    el.modeActual.addEventListener("click", () => {
      ui.valueMode = "actual";
      DN.saveCollectionUi(ui);
      render();
    });
    el.modeMax.addEventListener("click", () => {
      ui.valueMode = "max";
      DN.saveCollectionUi(ui);
      render();
    });

    el.list.addEventListener("click", (ev) => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const btn = t.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (action === "mode") {
        const mode = btn.getAttribute("data-mode");
        if (mode === "hall" || mode === "showcase" || mode === "hermitage") setMode(id, mode);
        return;
      }
      if (action === "lvl") {
        const perk = Number(btn.getAttribute("data-perk"));
        const dir = Number(btn.getAttribute("data-dir"));
        if (!Number.isFinite(perk) || !Number.isFinite(dir)) return;
        bumpLevel(id, perk, dir);
      }
    });

    el.list.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.getAttribute("data-action") !== "single-perk") return;
      const id = input.getAttribute("data-id");
      const perk = Number(input.getAttribute("data-perk"));
      if (!id || !Number.isFinite(perk)) return;
      setSinglePerk(id, perk);
    });

    el.board.addEventListener("click", (ev) => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const btn = t.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "slot-hall") {
        const grade = btn.getAttribute("data-grade");
        if (grade !== "Mythical" && grade !== "Legendary") return;
        if (mainsOfGrade(grade).length >= HALL_CAP) {
          showError(`${grade} Hall slots full (${HALL_CAP}/${HALL_CAP}). Clear a tile first.`);
          return;
        }
        openPicker("hall", grade);
        return;
      }
      if (action === "slot-hermitage") {
        openPicker("hermitage");
        return;
      }
      if (action === "tile-clear") {
        const id = btn.getAttribute("data-id");
        if (id) setMode(id, "showcase");
      }
    });

    el.board.addEventListener("change", (ev) => {
      const sel = ev.target;
      if (!(sel instanceof HTMLSelectElement)) return;
      if (sel.getAttribute("data-action") !== "showcase-perk") return;
      const id = sel.getAttribute("data-id");
      const perk = Number(sel.value);
      if (!id || !Number.isFinite(perk)) return;
      setSinglePerk(id, perk);
    });

    el.picker.addEventListener("click", (ev) => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const btn = t.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "picker-close") {
        closePicker();
        return;
      }
      if (action === "picker-pick") {
        const id = btn.getAttribute("data-id");
        if (!id || !pickerTarget) return;
        if (pickerTarget.kind === "hermitage") setMode(id, "hermitage");
        else setMode(id, "hall");
        closePicker();
      }
    });
  }

  async function load() {
    try {
      const [artRes, mapRes, imgRes] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(MAPPING_URL, { cache: "no-store" }),
        fetch(IMAGES_URL, { cache: "no-store" }),
      ]);
      if (!artRes.ok) throw new Error(`HTTP ${artRes.status} loading ${DATA_URL}`);
      const data = await artRes.json();
      if (!Array.isArray(data)) throw new Error("artifacts.json is not an array");
      rows = data.filter((row) => row.artifact_id !== "leftwich-trophy-legendary");
      byId = {};
      for (const row of rows) {
        byId[DN.artifactKey(row)] = row;
      }

      let perkCanon = {};
      if (mapRes.ok) perkCanon = DN.parseMappingCsv(await mapRes.text());
      canonPerk = DN.makeCanonPerk(perkCanon);
      artifactImages = imgRes.ok ? DN.imageUrlMap(await imgRes.json()) : {};

      collected = DN.loadCollected();
      loadout = DN.loadLoadout();
      levels = DN.loadLevels();
      ui = DN.loadCollectionUi();
      if (!ui.viewMode) ui.viewMode = "list";

      for (const hall of ["Main", "War"]) {
        const h = loadout[hall];
        h.mains = h.mains.filter((id) => collected.has(id) && byId[id]);
        for (const id of Object.keys(h.singles)) {
          if (!collected.has(id) || !byId[id]) delete h.singles[id];
        }
        if (h.hermitage && (!collected.has(h.hermitage) || !byId[h.hermitage])) {
          h.hermitage = null;
        }
      }
      enforceHallCaps();
      ensureSinglesDefaults();
      persistLoadout();

      bind();
      render();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  load();
})();
