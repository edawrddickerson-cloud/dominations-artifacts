(() => {
  "use strict";

  const C = window.DNCouncil;
  if (!C) {
    console.error("council-shared.js must load before council-collection.js");
    return;
  }

  const DATA_URL = "./data/councilors.json";
  const IMAGES_URL = "./data/councilor_images.json";

  const el = {
    error: document.getElementById("error"),
    modeMain: document.getElementById("mode-main"),
    modeWar: document.getElementById("mode-war"),
    slotChips: document.getElementById("slot-chips"),
    hint: document.getElementById("collection-hint"),
    ownedCount: document.getElementById("owned-count"),
    activeCount: document.getElementById("active-count"),
    list: document.getElementById("collection-list"),
    activeList: document.getElementById("active-list"),
    totalsSub: document.getElementById("totals-sub"),
    totalsList: document.getElementById("totals-list"),
    q: document.getElementById("q"),
    type: document.getElementById("type"),
  };

  /** @type {object[]} */
  let rows = [];
  /** @type {Record<string, object>} */
  let byId = {};
  /** @type {Record<string, { rarity: string, main: boolean, war: boolean }>} */
  let owned = {};
  /** @type {string[]} */
  let active = [];
  let ui = C.loadUi();
  /** @type {Record<string, string>} */
  let councilorImages = {};

  function showError(msg) {
    if (!el.error) return;
    el.error.hidden = !msg;
    el.error.textContent = msg || "";
  }

  function isOwnedHere(id) {
    return C.isOwnedForMode(owned[id], ui.mode);
  }

  function isActive(id) {
    return active.includes(id);
  }

  function rarityOf(id) {
    return isOwnedHere(id) ? C.normalizeRarity(owned[id].rarity) : "Legendary";
  }

  function setOwnedHere(id, on) {
    const hall = C.modeToHall(ui.mode);
    const stillAnywhere = C.setOwnedHall(owned, id, hall, on, ui.rarity);
    if (!isOwnedHere(id)) {
      active = active.filter((x) => x !== id);
      C.saveActive(active);
    }
    if (!stillAnywhere) {
      // fully cleared
    }
    C.saveOwned(owned);
  }

  function setRarity(id, rarity) {
    if (!isOwnedHere(id)) return;
    owned[id] = {
      rarity: C.normalizeRarity(rarity),
      main: !!owned[id].main,
      war: !!owned[id].war,
    };
    C.saveOwned(owned);
  }

  function setActive(id, on) {
    if (on) {
      if (!isOwnedHere(id)) {
        showError("Own a councilor for this Hall before putting them in the active Council.");
        return;
      }
      if (isActive(id)) return;
      if (active.length >= C.ACTIVE_CAP) {
        showError(`Active Council is full (${C.ACTIVE_CAP}/${C.ACTIVE_CAP}).`);
        return;
      }
      active.push(id);
      showError("");
    } else {
      active = active.filter((x) => x !== id);
      showError("");
    }
    C.saveActive(active);
  }

  function setMode(mode) {
    ui.mode = C.normalizeMode(mode);
    C.saveUi(ui);
    render();
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

  function fillTypeSelect() {
    const set = new Set();
    for (const r of rows) {
      const t = C.text(r.type);
      if (t) set.add(t);
    }
    const current = el.type.value;
    el.type.innerHTML = "";
    el.type.appendChild(new Option("All", ""));
    for (const v of [...set].sort((a, b) => a.localeCompare(b))) {
      el.type.appendChild(new Option(v, v));
    }
    if ([...el.type.options].some((o) => o.value === current)) el.type.value = current;
  }

  function filteredRows() {
    const q = C.text(el.q.value).toLowerCase();
    const type = el.type.value;
    return rows
      .filter((row) => {
        const id = C.text(row.id);
        if (!isOwnedHere(id)) return false;
        if (type && C.text(row.type) !== type) return false;
        if (q && !C.text(row.name).toLowerCase().includes(q)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const idA = C.text(a.id);
        const idB = C.text(b.id);
        const act = (isActive(idB) ? 1 : 0) - (isActive(idA) ? 1 : 0);
        if (act) return act;
        return C.text(a.name).localeCompare(C.text(b.name), undefined, { sensitivity: "base" });
      });
  }

  /** @returns {{ name: string, value: number, sources: string[] }[]} */
  function computeTotals() {
    /** @type {Record<string, { value: number, sources: string[] }>} */
    const map = {};
    for (const id of active) {
      const row = byId[id];
      if (!row || !isOwnedHere(id)) continue;
      const rarity = rarityOf(id);
      const label = `${C.show(row.name)} (${rarity})`;
      for (const b of C.bonusesOf(row, ui.mode, rarity)) {
        const name = C.text(b.stat);
        const value = C.parsePercent(b.value);
        if (!name || value == null) continue;
        if (!map[name]) map[name] = { value: 0, sources: [] };
        map[name].value += value;
        map[name].sources.push(label);
      }
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, value: v.value, sources: v.sources }))
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
  }

  function raritySelect(id) {
    const current = rarityOf(id);
    return (
      `<select data-action="rarity" data-id="${C.esc(id)}" aria-label="Owned rarity">` +
      C.RARITIES.map(
        (r) =>
          `<option value="${C.esc(r)}"${r === current ? " selected" : ""}>${C.esc(r)}</option>`
      ).join("") +
      `</select>`
    );
  }

  function renderCard(row) {
    const id = C.text(row.id);
    const on = isOwnedHere(id);
    const act = isActive(id);
    const rarity = on ? rarityOf(id) : null;
    const hall = C.modeToHall(ui.mode);
    const bonuses = C.bonusesOf(row, ui.mode, rarity || ui.rarity);

    const actions =
      `<div class="council-card-actions">` +
      `<label class="owned-check${on ? " is-owned" : ""}" title="${
        on ? `Owned for ${hall} — click to clear` : `Mark as owned for ${hall}`
      }">` +
      `<input type="checkbox" data-action="owned" data-id="${C.esc(id)}"${on ? " checked" : ""}` +
      ` aria-label="${on ? "Owned" : "Mark as owned"} (${C.esc(hall)})" />` +
      `</label>` +
      raritySelect(id) +
      `<button type="button" class="mode-btn${act ? " is-active" : ""}" data-action="active" data-id="${C.esc(id)}">${
        act ? "In council" : "Add to council"
      }</button>` +
      `</div>`;

    const stats =
      bonuses.length === 0
        ? `<p class="card-empty">${C.blankSpan("no stats")}</p>`
        : `<ul class="card-perks">` +
          bonuses
            .map(
              (b) =>
                `<li class="${act ? "is-active-perk" : "is-dim"}">` +
                `<span class="perk-name">${C.esc(C.show(b.stat))}</span>` +
                `<span class="perk-vals">${C.esc(C.show(b.value))}</span>` +
                `</li>`
            )
            .join("") +
          `</ul>`;

    const thumb = window.DN
      ? window.DN.thumbHtml(
          councilorImages[id] || "",
          C.show(row.name),
          "entity-thumb--collection"
        )
      : "";

    return (
      `<article class="artifact-card council-card is-owned${act ? " is-active" : ""}" data-id="${C.esc(id)}">` +
      `<div class="card-thumb">${thumb}</div>` +
      `<div class="card-body">` +
      `<header class="card-head">` +
      `<div class="card-title">` +
      `<span class="card-name">${C.esc(C.show(row.name))}</span>` +
      `<span class="card-meta">${C.esc(C.show(row.type))}${
        rarity ? ` · ${C.esc(rarity)}` : ""
      } · ${C.esc(hall)}</span>` +
      `</div>${actions}</header>${stats}</div></article>`
    );
  }

  function renderActiveList() {
    const activeHere = active.filter((id) => isOwnedHere(id) && byId[id]);
    if (!activeHere.length) {
      el.activeList.innerHTML = `<p class="collection-empty">No active councilors for ${C.esc(
        C.modeLabel(ui.mode)
      )} yet.</p>`;
      return;
    }
    el.activeList.innerHTML = activeHere
      .map((id) => {
        const row = byId[id];
        if (!row) return "";
        const thumb = window.DN
          ? window.DN.thumbHtml(
              councilorImages[id] || "",
              C.show(row.name),
              "entity-thumb--priority"
            )
          : "";
        return (
          `<div class="active-chip">` +
          thumb +
          `<span class="active-chip-text"><strong>${C.esc(C.show(row.name))}</strong> · ${C.esc(rarityOf(id))}</span>` +
          `<button type="button" data-action="active-off" data-id="${C.esc(id)}">Remove</button>` +
          `</div>`
        );
      })
      .join("");
  }

  function renderTotals() {
    const totals = computeTotals();
    const modeLabel = C.modeLabel(ui.mode);
    const activeHere = active.filter((id) => isOwnedHere(id) && byId[id]);
    el.totalsSub.textContent = `${modeLabel} bonuses from the active ${activeHere.length} · values summed as % points`;
    if (!totals.length) {
      el.totalsList.innerHTML = `<p class="totals-empty">Activate owned councilors to see combined bonuses.</p>`;
      return;
    }
    el.totalsList.innerHTML = totals
      .map((t) => {
        const sign = t.value > 0 ? "+" : "";
        const cls = t.value > 0 ? "pref-pos" : t.value < 0 ? "pref-neg" : "";
        return (
          `<div class="total-row" title="${C.esc(t.sources.join(" · "))}">` +
          `<span class="total-name">${C.esc(t.name)}</span>` +
          `<span class="total-val ${cls}">${sign}${C.esc(String(t.value))}%</span>` +
          `</div>`
        );
      })
      .join("");
  }

  function render() {
    // Drop active ids that are unknown; keep ids owned for other hall so switching halls restores them.
    active = active.filter((id) => byId[id] && C.isOwnedEntry(owned[id]));
    C.saveActive(active);

    syncModeButtons();
    const ownedN = rows.filter((r) => isOwnedHere(C.text(r.id))).length;
    const activeHere = active.filter((id) => isOwnedHere(id));
    const modeLabel = C.modeLabel(ui.mode);
    el.ownedCount.textContent = `(${ownedN} owned · ${modeLabel})`;
    el.activeCount.textContent = `(${activeHere.length}/${C.ACTIVE_CAP})`;
    el.slotChips.innerHTML =
      `<span class="chip">Owned ${ownedN}</span>` +
      `<span class="chip">Active ${activeHere.length}/${C.ACTIVE_CAP}</span>` +
      `<span class="chip">${C.esc(modeLabel)}</span>`;

    const list = filteredRows();
    if (!ownedN) {
      el.list.innerHTML =
        `<p class="collection-empty">No owned councilors for ${C.esc(modeLabel)}</p>`;
    } else if (!list.length) {
      el.list.innerHTML = `<p class="collection-empty">No owned councilors match these filters.</p>`;
    } else {
      el.list.innerHTML = list.map(renderCard).join("");
    }
    renderActiveList();
    renderTotals();
  }

  function bind() {
    if (el.modeMain) el.modeMain.addEventListener("click", () => setMode("main"));
    if (el.modeWar) el.modeWar.addEventListener("click", () => setMode("war"));
    el.q.addEventListener("input", render);
    el.type.addEventListener("change", render);

    el.list.addEventListener("change", async (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
      const id = target.getAttribute("data-id");
      const action = target.getAttribute("data-action");
      if (!id || !action) return;
      if (action === "owned" && target instanceof HTMLInputElement) {
        const on = target.checked;
        if (!on && isActive(id)) {
          target.checked = true;
          const row = byId[id];
          if (!await window.DN.confirmUncollect(C.show(row && row.name), ["the active Council"])) return;
        }
        setOwnedHere(id, on);
        render();
        return;
      }
      if (action === "rarity" && target instanceof HTMLSelectElement) {
        setRarity(id, target.value);
        render();
      }
    });

    el.list.addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-action='active']");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (!id) return;
      setActive(id, !isActive(id));
      render();
    });

    el.activeList.addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-action='active-off']");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (!id) return;
      setActive(id, false);
      render();
    });
  }

  async function load() {
    try {
      const [res, imgRes] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(IMAGES_URL, { cache: "no-store" }),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${DATA_URL}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.councilors)) {
        throw new Error("councilors.json missing councilors array");
      }
      rows = data.councilors.slice();
      byId = {};
      for (const r of rows) byId[C.text(r.id)] = r;

      councilorImages =
        imgRes.ok && window.DN ? window.DN.imageUrlMap(await imgRes.json()) : {};

      owned = C.loadOwned();
      active = C.loadActive();
      ui = C.loadUi();

      fillTypeSelect();
      bind();
      render();
      showError("");
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  load();
})();
