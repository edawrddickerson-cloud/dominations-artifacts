(() => {
  "use strict";

  const COLLECTED_KEY = "dn-artifact-collected";
  const LOADOUT_KEY = "dn-artifact-loadout";
  // Diagnostic logs grow much larger than settings. Keep them in the same
  // IndexedDB as scanned artifacts, freeing localStorage only after commit.
  const SCANNER_LOG_KEY = 'dn-crafting-scanner-log-v2';
  const SCANNER_LOG_RECORD = 'crafting-log';
  let logDatabase;
  function scannerLogTransaction(mode, operation) {
    if (!logDatabase) logDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('dn-stored-artifacts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('inventory', {keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return logDatabase.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', mode);
      const request = operation(transaction.objectStore('inventory'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    }));
  }
  const scannerLogReady = (async () => {
    const legacy = localStorage.getItem(SCANNER_LOG_KEY);
    if (legacy == null) return;
    await scannerLogTransaction('readwrite', store => store.put({id:SCANNER_LOG_RECORD, value:legacy}));
    // Another tab may have updated the legacy log while the transaction ran.
    if (localStorage.getItem(SCANNER_LOG_KEY) === legacy) localStorage.removeItem(SCANNER_LOG_KEY);
  })();
  scannerLogReady.catch(() => {}); // Callers report migration failures; retain the original log.
  const scannerLog = {
    ready: scannerLogReady,
    async read() {
      await scannerLogReady;
      return (await scannerLogTransaction('readonly', store => store.get(SCANNER_LOG_RECORD)))?.value ?? null;
    },
    async write(value) {
      await scannerLogReady;
      await scannerLogTransaction('readwrite', store => store.put({id:SCANNER_LOG_RECORD, value}));
    },
    async remove() {
      await scannerLogReady;
      await scannerLogTransaction('readwrite', store => store.delete(SCANNER_LOG_RECORD));
    },
  };
  const LEVELS_KEY = "dn-artifact-perk-levels";
  const COLLECTION_UI_KEY = "dn-artifact-collection-ui";
  const ARTIFACT_TYPE_EXHIBITS = {
    Main:[{key:'weapon',label:'Weapon Exhibit',count:2},{key:'armor',label:'Armor Exhibit',count:2},{key:'jewelry',label:'Jewelry Exhibit',count:2},{key:'pottery',label:'Pottery Exhibit',count:2}],
    War:[{key:'war-weapon',label:'War Weapon Exhibit',count:2},{key:'war-armor',label:'War Armor Exhibit',count:2},{key:'war-equipment',label:'War Equipment Exhibit',count:4}]
  };
  function artifactSlotCapacity(grade,hall) {
    if(grade==='Legendary' || grade==='Mythical')return 3;
    return (ARTIFACT_TYPE_EXHIBITS[hall] || []).find(exhibit=>exhibit.key.replace(/^war-/,'')===String(grade).toLowerCase())?.count || 0;
  }
  function loadScannerArtifactType(hall) {
    return lsGet('dn-scanner-artifact-type:'+activeProfileId()+':'+String(hall).toLowerCase()) || '';
  }
  function saveScannerArtifactType(type,hall) {
    const grade=String(type || '').replace(/^war[ -]/i,'');
    if(['Legendary','Mythical'].includes(grade) || !artifactSlotCapacity(grade,String(hall).toLowerCase()==='war'?'War':'Main'))return;
    lsSet('dn-scanner-artifact-type:'+activeProfileId()+':'+String(hall).toLowerCase(),grade.toLowerCase());
  }
  const ARMY_PRESETS_KEY = "dn-army-presets";
  const ARMY_PRESET_MAX = 5;
  const STRATEGIES_KEY = "dn-strategies";
  const STRATEGY_MIGRATION_BACKUP_KEY = "dn-strategies-migration-backup";
  const STRATEGY_MAX = 20;
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
    "dn-artifact-perk-edits",
    "dn-artifact-collection-ui",
    "dn-army-presets",
    STRATEGIES_KEY,
    STRATEGY_MIGRATION_BACKUP_KEY,
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
    // Preserve the raw pre-layer-migration values too. Strategy migration can
    // happen much later, after this older migration has moved profile ratings.
    for (const profile of state.profiles) preserveStrategyMigrationBackup(profile.id);
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

  /* Authority: Existing factory ratings and user-confirmed Multiplayer names.
   * Ownership: Rating sections and group inheritance, not hall availability.
   * Invariants: Enemy/Invading identities stay distinct; existing weights persist.
   * History: Added 23 confirmed and 9 approved Multiplayer stats on 2026-10-11. */
  const PERK_GROUPS = [
    { id: "single", label: "Single units", perks: [
      {"name":"APC Damage","kind":"damage"},
      {"name":"APC Hitpoints","kind":"hp"},
      {"name":"Armored Car Damage","kind":"damage"},
      {"name":"Assault Vehicle Damage","kind":"damage"},
      {"name":"Assault Vehicle Hitpoints","kind":"hp"},
      {"name":"Attack Helicopter Damage","kind":"damage"},
      {"name":"Attack Helicopter Hitpoints","kind":"hp"},
      {"name":"Bazooka Damage","kind":"damage"},
      {"name":"Bazooka Hitpoints","kind":"hp"},
      {"name":"Bomber Damage","kind":"damage"},
      {"name":"Bomber Hitpoints","kind":"hp"},
      {"name":"Commando Damage","kind":"damage"},
      {"name":"Commando Hitpoints","kind":"hp"},
      {"name":"Fighter Damage","kind":"damage"},
      {"name":"Fighter Hitpoints","kind":"hp"},
      {"name":"Fighter Hitpoints & Damage","kind":"combined"},
      {"name":"Guerrilla Damage","kind":"damage"},
      {"name":"Guerrilla Hitpoints","kind":"hp"},
      {"name":"Heavy Cavalry Damage","kind":"damage"},
      {"name":"Heavy Cavalry Hitpoints","kind":"hp"},
      {"name":"Heavy Infantry Damage","kind":"damage"},
      {"name":"Heavy Infantry Hitpoints","kind":"hp"},
      {"name":"Heavy Tank Damage","kind":"damage"},
      {"name":"Heavy Tank Hitpoints","kind":"hp"},
      {"name":"MRL Damage","kind":"damage"},
      {"name":"Machine Gun Infantry Damage","kind":"damage"},
      {"name":"Machine Gun Infantry Hitpoints","kind":"hp"},
      {"name":"Mortar Troop Damage","kind":"damage"},
      {"name":"Mortar Troop Hitpoints","kind":"hp"},
      {"name":"Paratrooper Damage","kind":"damage"},
      {"name":"Paratrooper Hitpoints","kind":"hp"},
      {"name":"Raider Damage","kind":"damage"},
      {"name":"Raider Hitpoints","kind":"hp"},
      {"name":"Ranged Infantry Damage","kind":"damage"},
      {"name":"Ranged Infantry Hitpoints","kind":"hp"},
      {"name":"Ranged Siege Damage","kind":"damage"},
      {"name":"Ranged Siege Hitpoints","kind":"hp"},
      {"name":"Wall Miner Damage","kind":"damage"},
      {"name":"Wall Sapper Damage","kind":"damage"},
      {"name":"Wall Sapper Hitpoints","kind":"hp"},
      {"name":"Wall Miner Hitpoints","kind":"hp"},
      {"name":"Armored Car Hitpoints","kind":"hp"},
      {"name":"MRL Hitpoints","kind":"hp"},
      {"name":"Supply Vehicle Hitpoints","kind":"hp"},
      {"name":"Tactical Helicopter Hitpoints","kind":"hp"}
    ] },
    { id: "multi", label: "Multiple units", perks: [
      {"name":"Airstrip Troop Damage","kind":"damage"},
      {"name":"Airstrip Troop Hitpoints","kind":"hp"},
      {"name":"Barracks Troop Damage","kind":"damage"},
      {"name":"Barracks Troop Hitpoints","kind":"hp"},
      {"name":"Coalition Troop Damage","kind":"damage"},
      {"name":"Factory Troop Damage","kind":"damage"},
      {"name":"Factory Troop Hitpoints","kind":"hp"}
    ] },
    { id: "generals", label: "Generals", perks: [
      {"name":"Generals' Attack Speed","kind":"speed"},
      {"name":"Generals' Damage","kind":"damage"},
      {"name":"Generals' Hitpoints","kind":"hp"},
      {"name":"Generals' Hitpoints & Damage","kind":"combined"},
      {"name":"Generals' Movement Speed","kind":"movement"}
    ] },
    { id: "buildings", label: "Defensive buildings", perks: [
      {"name":"Air Defense Attack Speed","kind":"speed"},
      {"name":"Air Defense Damage","kind":"damage"},
      {"name":"Air Defense Hitpoints","kind":"hp"},
      {"name":"Anti-Tank Gun Damage","kind":"damage"},
      {"name":"Anti-Tank Gun Hitpoints","kind":"hp"},
      {"name":"Catapult Damage","kind":"damage"},
      {"name":"Catapult Hitpoints","kind":"hp"},
      {"name":"Missile Silo Damage","kind":"damage"},
      {"name":"Missile Silo Hitpoints","kind":"hp"},
      {"name":"Missile Silo and Big Red Button Damage","kind":"damage"},
      {"name":"Redoubt Damage","kind":"damage"},
      {"name":"Redoubt Hitpoints","kind":"hp"},
      {"name":"Sniper Tower Damage","kind":"damage"},
      {"name":"Sniper Tower Hitpoints","kind":"hp"},
      {"name":"Tower Damage","kind":"damage"},
      {"name":"Tower Hitpoints","kind":"hp"}
    ] },
    { id: "all-towers", label: "All defensive towers", perks: [
      {"name":"All Defensive Towers Damage","kind":"damage"},
      {"name":"All Defensive Towers Hitpoints","kind":"hp"},
      {"name":"All Defensive Towers Hitpoints & Damage","kind":"combined"}
    ] },
    { id: "defenders", label: "Defenders", perks: [
      {"name":"Defender Damage","kind":"damage"},
      {"name":"Defender Hitpoints","kind":"hp"},
      {"name":"Defender Movement Speed","kind":"movement"},
      {"name":"Defender Spawn Time","kind":"spawn"}
    ] },
    { id: "enemy-buildings", label: "Enemy defensive buildings", perks: [
      {"name":"Enemy Air Defense Damage","kind":"damage"},
      {"name":"Enemy Air Defense Hitpoints","kind":"hp"},
      {"name":"Enemy Anti-Tank Gun Damage","kind":"damage"},
      {"name":"Enemy Anti-Tank Gun Hitpoints","kind":"hp"},
      {"name":"Enemy Catapult Damage","kind":"damage"},
      {"name":"Enemy Catapult Hitpoints","kind":"hp"},
      {"name":"Enemy Missile Silo Damage","kind":"damage"},
      {"name":"Enemy Missile Silo Hitpoints","kind":"hp"},
      {"name":"Enemy Redoubt Damage","kind":"damage"},
      {"name":"Enemy Redoubt Hitpoints","kind":"hp"},
      {"name":"Enemy Sniper Tower Damage","kind":"damage"},
      {"name":"Enemy Sniper Tower Hitpoints","kind":"hp"},
      {"name":"Enemy Tower Damage","kind":"damage"},
      {"name":"Enemy Tower Hitpoints","kind":"hp"}
    ] },
    { id: "enemy-all", label: "All enemy defensive towers", perks: [
      {"name":"All Enemy Defensive Towers Damage","kind":"damage"},
      {"name":"All Enemy Defensive Towers Hitpoints","kind":"hp"}
    ] },
    { id: "enemy-defenders", label: "Enemy defenders", perks: [
      {"name":"Enemy Defender Hitpoints","kind":"hp"},
      {"name":"Enemy Defender Spawn Time","kind":"spawn"}
    ] },
    { id: "invading-single", label: "Invading single units", perks: [
      {"name":"Invading APC Damage","kind":"damage"},
      {"name":"Invading APC Hitpoints","kind":"hp"},
      {"name":"Invading Armored Car Damage","kind":"damage"},
      {"name":"Invading Armored Car Hitpoints","kind":"hp"},
      {"name":"Invading Assault Vehicle Damage","kind":"damage"},
      {"name":"Invading Assault Vehicle Hitpoints","kind":"hp"},
      {"name":"Invading Attack Helicopter Damage","kind":"damage"},
      {"name":"Invading Attack Helicopter Hitpoints","kind":"hp"},
      {"name":"Invading Bazooka Damage","kind":"damage"},
      {"name":"Invading Bazooka Hitpoints","kind":"hp"},
      {"name":"Invading Bomber Damage","kind":"damage"},
      {"name":"Invading Bomber Hitpoints","kind":"hp"},
      {"name":"Invading Fighter Damage","kind":"damage"},
      {"name":"Invading Fighter Hitpoints","kind":"hp"},
      {"name":"Invading Guerrilla Damage","kind":"damage"},
      {"name":"Invading Guerrilla Hitpoints","kind":"hp"},
      {"name":"Invading Heavy Cavalry Damage","kind":"damage"},
      {"name":"Invading Heavy Cavalry Hitpoints","kind":"hp"},
      {"name":"Invading Heavy Infantry Damage","kind":"damage"},
      {"name":"Invading Heavy Infantry Hitpoints","kind":"hp"},
      {"name":"Invading Heavy Tank Damage","kind":"damage"},
      {"name":"Invading Heavy Tank Hitpoints","kind":"hp"},
      {"name":"Invading Machine Gun Infantry Damage","kind":"damage"},
      {"name":"Invading Machine Gun Infantry Hitpoints","kind":"hp"},
      {"name":"Invading Mortar Troop Damage","kind":"damage"},
      {"name":"Invading Mortar Troop Hitpoints","kind":"hp"},
      {"name":"Invading MRL Damage","kind":"damage"},
      {"name":"Invading MRL Hitpoints","kind":"hp"},
      {"name":"Invading Paratrooper Damage","kind":"damage"},
      {"name":"Invading Paratrooper Hitpoints","kind":"hp"},
      {"name":"Invading Raider Damage","kind":"damage"},
      {"name":"Invading Raider Hitpoints","kind":"hp"},
      {"name":"Invading Ranged Infantry Damage","kind":"damage"},
      {"name":"Invading Ranged Infantry Hitpoints","kind":"hp"},
      {"name":"Invading Ranged Siege Damage","kind":"damage"},
      {"name":"Invading Ranged Siege Hitpoints","kind":"hp"},
      {"name":"Invading Supply Vehicle Hitpoints","kind":"hp"},
      {"name":"Invading Tactical Helicopter Hitpoints","kind":"hp"},
      {"name":"Invading Transport Hitpoints","kind":"hp"}
    ] },
    { id: "invading-multi", label: "Invading multiple units", perks: [
      {"name":"Invading Airstrip Troop Damage","kind":"damage"},
      {"name":"Invading Airstrip Unit Hitpoints","kind":"hp"},
      {"name":"Invading Barracks Troop Damage","kind":"damage"},
      {"name":"Invading Barracks Troop Hitpoints","kind":"hp"},
      {"name":"Invading Factory Troop Damage","kind":"damage"},
      {"name":"Invading Factory Troop Hitpoints","kind":"hp"}
    ] },
    { id: "invading-generals", label: "Invading generals", perks: [
      {"name":"Invading Generals' Damage","kind":"damage"},
      {"name":"Invading Generals' Hitpoints","kind":"hp"}
    ] },
    { id: "utility", label: "Unit utility", perks: [
      {"name":"APC Deploy Time","kind":"cooldown"},
      {"name":"Bazooka Attack Speed","kind":"speed"},
      {"name":"Bazooka Cooldown","kind":"cooldown"},
      {"name":"Guerrilla Movement Speed","kind":"movement"},
      {"name":"Heavy Infantry Attack Speed","kind":"speed"},
      {"name":"Heavy Infantry Movement Speed","kind":"movement"},
      {"name":"Heavy Tank Attack Speed","kind":"speed"},
      {"name":"Mortar Troop Attack Speed","kind":"speed"},
      {"name":"Supply Vehicle Healing","kind":"healing"},
      {"name":"Transport Cooldown","kind":"cooldown"},
      {"name":"Transport Movement Speed","kind":"movement"}
    ] },
    { id: "battle", label: "Tactics and battle utility", perks: [
      {"name":"Decoy Tactic Hitpoints","kind":"tactics"},
      {"name":"First Aid Duration","kind":"tactics"},
      {"name":"Increase Rally Duration","kind":"rally"},
      {"name":"Quick Victory Time","kind":"victory"},
      {"name":"Rally Cooldown","kind":"rally"},
      {"name":"Recon Bonus Duration","kind":"recon"},
      {"name":"Recon Scan Duration","kind":"recon"},
      {"name":"Tactical Helicopter Healing","kind":"tactics"}
    ] },
    { id: "enemy-utility", label: "Enemy tactics and recon", perks: [
      {"name":"Enemy Recon Plane Scan Duration","kind":"other"},
      {"name":"Enemy Sabotage Duration","kind":"other"},
      {"name":"Invading Recon Scan Duration","kind":"other"},
      {"name":"Invading Sabotage Duration","kind":"other"},
      {"name":"Invading Tactical Helicopter Healing","kind":"healing"},
      {"name":"Invading Supply Vehicle Healing","kind":"healing"}
    ] },
    { id: "loot", label: "Loot", perks: [
      {"name":"All Resources Looted","kind":"resources"},
      {"name":"Food Looted","kind":"resources"},
      {"name":"Gold Looted","kind":"resources"},
      {"name":"Looted Resource Refund","kind":"refund"},
      {"name":"National Trade Good Loot Chance","kind":"chance"},
      {"name":"Oil Looted","kind":"resources"}
    ] },
    { id: "production", label: "Resource production and storage", perks: [
      {"name":"Food from Farms","kind":"production"},
      {"name":"Food from Fruit Trees","kind":"production"},
      {"name":"All Resources from Hunting","kind":"production"},
      {"name":"Gold from Caravans","kind":"production"},
      {"name":"Gold from Gold Mines","kind":"production"},
      {"name":"Oil From Oil Wells","kind":"production"},
      {"name":"Vault Capacity","kind":"capacity"},
      {"name":"Vault Interest","kind":"interest"}
    ] },
    { id: "research", label: "Research", perks: [
      {"name":"Library Research Time","kind":"time"},
      {"name":"Library Tech Food Cost","kind":"cost"},
      {"name":"Library Tech Gold Cost","kind":"cost"},
      {"name":"Library Tech Oil Cost","kind":"cost"},
      {"name":"Library Tech Resource Cost","kind":"cost"},
      {"name":"University Research Time","kind":"time"}
    ] },
    { id: "costs", label: "Training and expansion costs", perks: [
      {"name":"Barracks Troop Training Cost","kind":"training"},
      {"name":"Factory Troop Training Cost","kind":"training"},
      {"name":"Forest Expansion Cost Refund","kind":"expansion"}
    ] },
    { id: "special", label: "Special effects", perks: [
      {"name":"APC Deploys Marines On Death","kind":"APC Deploys Marines On Death"},
      {"name":"Castle spawns Sword Saints when Destroyed","kind":"Castle spawns Sword Saints when Destroyed"},
      {"name":"Mercenary Camp Deploys Spartans when Destroyed","kind":"Mercenary Camp Deploys Spartans when Destroyed"},
      {"name":"Raiders Spawn from Forest When Attacking","kind":"Raiders Spawn from Forest When Attacking"},
      {"name":"Supply Vehicle","kind":"Supply Vehicle"}
    ] }
  ];
  const PERK_GROUP_DEFAULTS_KEY = "dn_perk_group_defaults_v1";
  function loadPerkGroupDefaults() {
    return parsePerkRatingsPayload(lsGetRaw(PERK_GROUP_DEFAULTS_KEY));
  }
  function savePerkGroupDefaults(bag) {
    lsSetRaw(PERK_GROUP_DEFAULTS_KEY, serializePerkRatingsPayload(bag || {}));
    emitStrategyChange("ratings");
  }
  function groupPerkRating(name, axis, groups = loadPerkGroupDefaults()) {
    for (const section of PERK_GROUPS) {
      const perk = section.perks.find(p => p.name === name);
      if (!perk) continue;
      if (perk.kind === "combined") {
        const hp = perkRatingAxisOrNull(groups, section.id + ":hp", axis);
        const damage = perkRatingAxisOrNull(groups, section.id + ":damage", axis);
        if (hp == null && damage == null) return null;
        return Math.max(hp == null ? damage : hp, damage == null ? hp : damage);
      }
      return perkRatingAxisOrNull(groups, section.id + ":" + perk.kind, axis);
    }
    return null;
  }
  function loadStoredGlobalPerkRatings() {
    ensurePerkRatingsMigrated();
    const stored = parsePerkRatingsPayload(lsGetRaw(PERK_RATINGS_GLOBAL_KEY));
    // Apply the requested global General ratings once; later user edits and
    // resets remain authoritative, and profile overrides stay separate.
    const updateKey = 'dn-general-ratings-2026-10-16';
    if (lsGetRaw(updateKey) !== '1') {
      for (const [name, value] of [["Generals' Damage", 3], ["Generals' Hitpoints", 2], ["Generals' Movement Speed", 2]]) {
        stored[name] = { offensive: value, defensive: value };
      }
      lsSetRaw(PERK_RATINGS_GLOBAL_KEY, serializePerkRatingsPayload(stored));
      lsSetRaw(updateKey, '1');
    }
    return stored;
  }
  function loadGlobalPerkRatings() {
    const stored = loadStoredGlobalPerkRatings();
    const groups = loadPerkGroupDefaults();
    const result = {};
    for (const section of PERK_GROUPS) for (const perk of section.perks) {
      const entry = {};
      for (const axis of RATING_AXES) {
        const value = groupPerkRating(perk.name, axis, groups);
        if (value != null) entry[axis] = value;
      }
      if (Object.keys(entry).length) result[perk.name] = entry;
    }
    return mergePerkRatingLayers(result, stored);
  }

  /**
   * @param {Record<string, { offensive?: number, defensive?: number }>} overrides
   */
  function saveGlobalPerkRatings(overrides) {
    ensurePerkRatingsMigrated();
    lsSetRaw(PERK_RATINGS_GLOBAL_KEY, serializePerkRatingsPayload(overrides || {}));
    emitStrategyChange("ratings");
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
    emitStrategyChange("ratings");
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
    emitStrategyChange("profile");
    return true;
  }

  function addProfile(name) {
    const state = ensureProfiles();
    if (state.profiles.length >= PROFILE_MAX) return null;
    const id = newProfileId();
    const label = ptext(name) || `Profile ${state.profiles.length + 1}`;
    state.profiles.push({ id, name: label });
    saveProfilesState(state);
    // New profiles inherit the current shared defaults and have no old army
    // state to migrate, even when another profile has historical ratings.
    localStorage.setItem(profileStorageKey(STRATEGIES_KEY, id), JSON.stringify(freshStrategyState()));
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

  // User rule: one fixed polarity per stat, with every Invading effect negative.
  function expectedPerkSign(perkName) {
    const name = polishPerk(perkName);
    const canonical = ARMY_CATALOG.perk_aliases[name] || name;
    if (/^invading\b/i.test(canonical)) return -1;
    const sign = ARMY_CATALOG.perk_signs?.[canonical];
    return sign === -1 || sign === 1 ? sign : null;
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
    const edits=row.scanned?null:artifactPerkEdits()[artifactKey(row)];
    for (let i = 1; i <= 6; i++) {
      const edit=edits?.[i-1];
      const rawName = text(edit?edit.name:row[`perk_${i}_name`]);
      const baseRaw = text(edit?edit.base:row[`perk_${i}_base`]);
      const maxRaw = text(edit?edit.max:row[`perk_${i}_max`]);
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
  let perkEditsRaw=null,perkEditsCache={};
  function artifactPerkEdits() {
    const raw=lsGet('dn-artifact-perk-edits');
    if(raw!==perkEditsRaw){
      perkEditsRaw=raw;
      try{const parsed=JSON.parse(raw || '{}');perkEditsCache=parsed && typeof parsed==='object' && !Array.isArray(parsed)?parsed:{};}catch{perkEditsCache={};}
    }
    return perkEditsCache;
  }
  function saveArtifactPerkEdits(id,perks) {
    lsSet('dn-artifact-perk-edits',JSON.stringify({...artifactPerkEdits(),[id]:perks}));
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
      scannedPlaced: /** @type {string[]} */ ([]),
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
      const scannedPlaced=Array.isArray(src.scannedPlaced)?src.scannedPlaced.map(text).filter(Boolean):[];
      out[hall] = { mains, singles, hermitage: hermitage || null, scannedPlaced };
    }
    return out;
  }

  function loadLegacyLoadout() {
    try {
      const raw = lsGet(LOADOUT_KEY);
      if (!raw) return normalizeLoadout(null);
      return normalizeLoadout(JSON.parse(raw));
    } catch {
      return normalizeLoadout(null);
    }
  }

  function loadLoadout(strategyId) {
    const state = loadStrategies();
    const strategy = state.strategies.find(item => item.id === (strategyId || state.activeId));
    return normalizeLoadout(strategy && strategy.loadout);
  }

  function saveLoadout(loadout, strategyId) {
    const state = loadStrategies();
    const strategy = state.strategies.find(item => item.id === (strategyId || state.activeId));
    if (!strategy) return false;
    strategy.loadout = normalizeLoadout(loadout);
    saveStrategies(state);
    return true;
  }

  function artifactSlots(id) {
    const slots = [];
    const state = loadStrategies();
    for (const strategy of state.strategies) for (const hall of ["Main", "War"]) {
      const entry = strategy.loadout[hall];
      const label = state.strategies.length > 1 ? `${strategy.name}: ${hall}` : hall;
      if (entry.mains.includes(id)) slots.push(`${label} Hall`);
      if (entry.hermitage === id) slots.push(`${label} Hermitage`);
      if (Object.prototype.hasOwnProperty.call(entry.singles, id)) slots.push(`${label} Showcase`);
    }
    return slots;
  }

  function removeArtifactSlots(id) {
    const state = loadStrategies();
    const clear = loadout => { for (const hall of ["Main", "War"]) {
      const entry = loadout[hall];
      entry.mains = entry.mains.filter((key) => key !== id);
      if (entry.hermitage === id) entry.hermitage = null;
      delete entry.singles[id];
      entry.scannedPlaced = entry.scannedPlaced.filter(key => key !== id);
    } };
    for (const strategy of state.strategies) clear(strategy.loadout);
    // Keep the original compatibility layout clear as well, so older clients
    // cannot restore a removed ownership reference.
    const original = loadLegacyLoadout();
    clear(original);
    saveStrategies(state);
    lsSet(LOADOUT_KEY, JSON.stringify(original));
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
        `${name} is currently in ${slots.join(", ")}. Are you sure? Removing ownership will also clear its slots from every strategy.`;
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
      if (!raw) return { hall: "Main", valueMode: "actual", viewMode: "structured", compareRows: "all" };
      const parsed = JSON.parse(raw);
      const hall = parsed && parsed.hall === "War" ? "War" : "Main";
      const valueMode = parsed && parsed.valueMode === "max" ? "max" : "actual";
      const viewMode = parsed && parsed.viewMode === "list" ? "list" : "structured";
      const compareRows = parsed && parsed.compareRows === "unlocked" ? "unlocked" : "all";
      return { hall, valueMode, viewMode, compareRows };
    } catch {
      return { hall: "Main", valueMode: "actual", viewMode: "structured", compareRows: "all" };
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

  // Strategies share ownership and perk levels through the profile, while each
  // owns its army, rating overrides and museum placement references.
  function newStrategyId() {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
  }

  function cleanRatingBag(bag) {
    return parsePerkRatingsPayload(serializePerkRatingsPayload(bag));
  }

  function freshStrategyState() {
    const id = newStrategyId();
    return { v: 1, activeId: id, comparisonIds: [id], comparisonAll: true, defaultInheritRatings: true, revision: 0, strategies: [{
      id, name: "Main strategy", units: [], overrides: {}, archived: false,
      favorite: false, inheritRatings: true, configured: false, loadout: normalizeLoadout(null),
    }] };
  }

  function normalizeStrategies(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.strategies)) return freshStrategyState();
    const strategies = [], seen = new Set();
    // The creation limit is deliberately not an import limit. A backup from a
    // future client must retain every strategy, including archived strategies.
    for (const src of raw.strategies) {
      if (!src || typeof src !== "object") continue;
      let id = ptext(src.id);
      if (!id || seen.has(id)) id = newStrategyId();
      seen.add(id);
      const strategy = {
        id, name: ptext(src.name) || `Strategy ${strategies.length + 1}`,
        units: normalizeArmyUnits(src.units), overrides: cleanRatingBag(src.overrides || {}),
        archived: src.archived === true, favorite: src.favorite === true,
        inheritRatings: src.inheritRatings !== false, configured: src.configured !== false,
        loadout: normalizeLoadout(src.loadout),
      };
      if (src.legacy && typeof src.legacy === "object") strategy.legacy = {
        configured: src.legacy.configured === true,
        ratings: cleanRatingBag(src.legacy.ratings || {}),
        groupDefaults: cleanRatingBag(src.legacy.groupDefaults || {}),
      };
      strategies.push(strategy);
    }
    if (!strategies.length) return freshStrategyState();
    if (strategies.every(strategy => strategy.archived)) strategies[0].archived = false;
    let activeId = ptext(raw.activeId);
    if (!strategies.some(strategy => strategy.id === activeId && !strategy.archived)) {
      activeId = strategies.find(strategy => !strategy.archived).id;
    }
    const available = new Set(strategies.filter(strategy => !strategy.archived).map(strategy => strategy.id));
    const comparisonAll = raw.comparisonAll !== false;
    let comparisonIds = comparisonAll ? [...available] : (Array.isArray(raw.comparisonIds)
      ? [...new Set(raw.comparisonIds.map(ptext))].filter(id => available.has(id)) : [activeId]);
    if (!comparisonIds.length) comparisonIds = [activeId];
    const defaultInheritRatings = typeof raw.defaultInheritRatings === "boolean"
      ? raw.defaultInheritRatings : !strategies.some(strategy => strategy.legacy);
    return { v: 1, activeId, comparisonIds, comparisonAll, defaultInheritRatings, strategies,
      revision: Math.max(0, Math.floor(Number(raw.revision) || 0)) };
  }

  function preserveStrategyMigrationBackup(profileId = activeProfileId()) {
    const key = profileStorageKey(STRATEGY_MIGRATION_BACKUP_KEY, profileId);
    const existing = localStorage.getItem(key);
    if (existing != null) return existing;
    const raw = {
      army: localStorage.getItem(profileStorageKey(ARMY_PRESETS_KEY, profileId)),
      loadout: localStorage.getItem(profileStorageKey(LOADOUT_KEY, profileId)),
      profileRatings: localStorage.getItem(profileStorageKey(PERK_RATINGS_KEY, profileId)),
      globalRatings: localStorage.getItem(PERK_RATINGS_GLOBAL_KEY),
      groupDefaults: localStorage.getItem(PERK_GROUP_DEFAULTS_KEY),
      strategies: localStorage.getItem(profileStorageKey(STRATEGIES_KEY, profileId)),
    };
    const backup = JSON.stringify({ v: 1, profileId, raw });
    // Do not publish a migrated strategy state until its raw backup is durable.
    localStorage.setItem(key, backup);
    return backup;
  }

  function migrateStrategies() {
    const backup = JSON.parse(preserveStrategyMigrationBackup());
    const armyRaw = lsGet(ARMY_PRESETS_KEY);
    let armyParsed;
    try { armyParsed = JSON.parse(armyRaw || "null"); } catch { armyParsed = null; }
    // Preserve all imported old presets as well, rather than normalizing through
    // the historical five-preset UI limit.
    const presetList = Array.isArray(armyParsed?.presets) ? armyParsed.presets.filter(p => p && typeof p === "object") : [];
    const layers = loadActivePerkRatingLayers();
    const groupDefaults = loadPerkGroupDefaults();
    const rawGlobal = cleanRatingBag(layers.global);
    for (const [name, value] of [["Generals' Damage", 3], ["Generals' Hitpoints", 2], ["Generals' Movement Speed", 2]]) {
      const entry = rawGlobal[name];
      if (entry && entry.offensive === value && entry.defensive === value) delete rawGlobal[name];
    }
    const dirty = armyRaw != null || Object.keys(layers.profile).length > 0 ||
      Object.keys(parsePerkRatingsPayload(backup.raw?.profileRatings)).length > 0 ||
      Object.keys(rawGlobal).length > 0 || Object.keys(groupDefaults).length > 0;
    if (!dirty) {
      const fresh = freshStrategyState();
      fresh.strategies[0].loadout = loadLegacyLoadout();
      return saveStrategies(fresh);
    }
    const initialLayout = loadLegacyLoadout();
    const strategies = presetList.map((preset, index) => ({
      id: ptext(preset.id) || newStrategyId(), name: ptext(preset.name) || `Strategy ${index + 1}`,
      units: normalizeArmyUnits(preset.units), overrides: {}, archived: false,
      favorite: false, inheritRatings: false, configured: true, loadout: normalizeLoadout(initialLayout),
    }));
    const oldApplied = normalizeArmyUnits(armyParsed?.lastApplied);
    const selected = presetList.find(p => p.id === armyParsed?.activeId);
    const sameArmy = selected && JSON.stringify(normalizeArmyUnits(selected.units)) === JSON.stringify(oldApplied);
    const legacy = {
      id: newStrategyId(), name: sameArmy ? `${ptext(selected.name) || "Current army"} (Legacy)` : "Legacy current army",
      units: oldApplied, overrides: {}, archived: false, favorite: false,
      inheritRatings: false, configured: armyRaw != null, loadout: normalizeLoadout(initialLayout),
      legacy: { configured: armyRaw != null,
        ratings: mergePerkRatingLayers(layers.global, layers.profile), groupDefaults },
    };
    strategies.unshift(legacy);
    return saveStrategies({ v: 1, activeId: legacy.id, comparisonIds: strategies.map(item => item.id), comparisonAll: true,
      defaultInheritRatings: false, strategies, revision: 0 });
  }

  function loadStrategies() {
    const raw = lsGet(STRATEGIES_KEY);
    if (raw != null) {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { /* Back up corrupt input before recovering from legacy state. */ }
      if (parsed && Array.isArray(parsed.strategies) && parsed.strategies.some(item => item && typeof item === "object")) {
        const normalized = normalizeStrategies(parsed);
        // Repair imported IDs and schema defaults once, so an imported
        // strategy without an ID does not receive a different ID per read.
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) return saveStrategies(normalized);
        return normalized;
      }
    }
    return migrateStrategies();
  }

  let lastStrategySignature = null, lastStrategyRevision = "";
  function strategyRevision() {
    const id = activeProfileId();
    const signature = JSON.stringify([id, lsGet(STRATEGIES_KEY),
      lsGetRaw(PERK_RATINGS_GLOBAL_KEY), lsGet(PERK_RATINGS_KEY), lsGetRaw(PERK_GROUP_DEFAULTS_KEY)]);
    if (signature === lastStrategySignature) return lastStrategyRevision;
    let hash = 2166136261;
    for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
    lastStrategySignature = signature;
    lastStrategyRevision = `${id}:${(hash >>> 0).toString(36)}`;
    return lastStrategyRevision;
  }

  function emitStrategyChange(reason) {
    if (typeof window.dispatchEvent !== "function") return;
    const EventClass = window.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!EventClass) return;
    window.dispatchEvent(new EventClass("dn-strategies-changed", {
      detail: { reason, profileId: activeProfileId(), revision: strategyRevision() },
    }));
  }

  function saveStrategies(state) {
    const next = normalizeStrategies(state);
    let previousRevision = 0;
    try { previousRevision = Number(JSON.parse(lsGet(STRATEGIES_KEY) || "null")?.revision) || 0; } catch { /* first write */ }
    next.revision = Math.max(previousRevision, next.revision) + 1;
    lsSet(STRATEGIES_KEY, JSON.stringify(next));
    emitStrategyChange("strategies");
    return next;
  }

  function activeStrategyId() { return loadStrategies().activeId; }
  function activeStrategy() {
    const state = loadStrategies();
    return state.strategies.find(strategy => strategy.id === state.activeId);
  }
  function setActiveStrategy(id) {
    const state = loadStrategies();
    if (state.activeId === id || !state.strategies.some(strategy => strategy.id === id && !strategy.archived)) return false;
    state.activeId = id;
    saveStrategies(state);
    return true;
  }
  function comparisonStrategies() {
    const state = loadStrategies();
    return state.comparisonIds.map(id => state.strategies.find(strategy => strategy.id === id)).filter(strategy => strategy && !strategy.archived);
  }
  function setComparisonStrategyIds(ids) {
    const state = loadStrategies();
    state.comparisonIds = Array.isArray(ids) ? ids : [];
    const selected = new Set(state.comparisonIds);
    state.comparisonAll = state.strategies.filter(strategy => !strategy.archived).every(strategy => selected.has(strategy.id));
    return saveStrategies(state).comparisonIds;
  }
  function updateStrategy(id, patch = {}) {
    const state = loadStrategies(), strategy = state.strategies.find(item => item.id === id);
    if (!strategy) return false;
    const unitsChanged = Object.prototype.hasOwnProperty.call(patch, "units") &&
      JSON.stringify(normalizeArmyUnits(patch.units)) !== JSON.stringify(strategy.units);
    const next = { ...strategy, ...patch, id: strategy.id };
    if (Object.prototype.hasOwnProperty.call(patch, "units")) next.configured = true;
    if (unitsChanged || Object.prototype.hasOwnProperty.call(patch, "inheritRatings")) delete next.legacy;
    if (patch.legacy === null) delete next.legacy;
    if (next.archived && state.strategies.every(item => item.id === id || item.archived)) return false;
    state.strategies[state.strategies.indexOf(strategy)] = next;
    saveStrategies(state);
    return true;
  }
  function saveStrategyOverrides(id, bag) { return updateStrategy(id, { overrides: cleanRatingBag(bag || {}) }); }
  function addStrategy(name, options = {}) {
    const state = loadStrategies();
    if (state.strategies.length >= STRATEGY_MAX) return null;
    const duplicate = options.duplicateId && state.strategies.find(strategy => strategy.id === options.duplicateId);
    if (options.duplicateId && !duplicate) return null;
    const id = newStrategyId();
    const strategy = duplicate ? { ...duplicate, id, name: ptext(name) || `${duplicate.name} copy`, archived: false } : {
      id, name: ptext(name) || `Strategy ${state.strategies.length + 1}`, units: normalizeArmyUnits(options.units),
      overrides: {}, archived: false, favorite: false,
      inheritRatings: state.defaultInheritRatings,
      configured: Object.prototype.hasOwnProperty.call(options, "units"), loadout: normalizeLoadout(null),
    };
    if (duplicate && Object.prototype.hasOwnProperty.call(options, "units")) {
      strategy.units = normalizeArmyUnits(options.units);
      strategy.configured = true;
      delete strategy.legacy;
    }
    state.strategies.push(strategy);
    saveStrategies(state);
    return id;
  }
  function removeStrategy(id) {
    const state = loadStrategies();
    if (state.strategies.length <= 1 || !state.strategies.some(strategy => strategy.id === id)) return false;
    if (!state.strategies.some(strategy => strategy.id !== id && !strategy.archived)) return false;
    state.strategies = state.strategies.filter(strategy => strategy.id !== id);
    saveStrategies(state);
    return true;
  }
  function archiveStrategy(id) { return updateStrategy(id, { archived: true }); }

  function createStrategyRatingContext(factoryDefaults, options = {}) {
    const state = loadStrategies();
    const strategy = state.strategies.find(item => item.id === (options.strategyId || state.activeId));
    if (!strategy) throw new Error(`Unknown strategy: ${options.strategyId}`);
    const canon = typeof options.canonPerk === "function" ? options.canonPerk : name => name;
    const canonicalBag = bag => {
      const result = {};
      for (const [name, entry] of Object.entries(bag || {})) result[canon(name)] = { ...(result[canon(name)] || {}), ...entry };
      return result;
    };
    const overrides = canonicalBag(strategy.overrides), defaults = canonicalBag(factoryDefaults);
    const legacy = strategy.legacy && canonicalBag(strategy.legacy.ratings);
    const layers = strategy.inheritRatings && !legacy ? loadActivePerkRatingLayers() : { global: {}, profile: {} };
    const global = canonicalBag(layers.global), profile = canonicalBag(layers.profile);
    const groups = legacy ? strategy.legacy.groupDefaults : loadPerkGroupDefaults();
    const effectiveUnits = armyEffectiveAppliedSet(strategy.units);
    const revision = strategyRevision();
    function explain(name, axis) {
      name = canon(name);
      const result = (value, source) => ({ value, source, strategyId: strategy.id });
      let value = perkRatingAxisOrNull(overrides, name, axis);
      if (value != null) return result(value, "override");
      if (legacy) {
        value = perkRatingAxisOrNull(legacy, name, axis);
        if (value != null) return result(value, "legacy");
        if (strategy.legacy.configured && unitFamily(name) && !effectiveUnits.has(unitFamily(name))) return result(0, "army");
        return result(perkRatingAxisOrNull(defaults, name, axis) ?? 0, "factory");
      }
      if (axis === "offensive" && strategy.configured !== false && unitFamily(name) && !effectiveUnits.has(unitFamily(name))) return result(0, "army");
      value = perkRatingAxisOrNull(profile, name, axis);
      if (value != null) return result(value, "profile");
      value = perkRatingAxisOrNull(global, name, axis);
      if (value != null) return result(value, "global");
      value = groupPerkRating(name, axis, groups);
      if (value != null) return result(value, "group");
      return result(perkRatingAxisOrNull(defaults, name, axis) ?? 0, "factory");
    }
    return { strategy, revision, explain, ratingOf: (name, axis) => explain(name, axis).value };
  }

  window.DN = {
    ARTIFACT_TYPE_EXHIBITS,
    artifactSlotCapacity,
    loadScannerArtifactType,
    saveScannerArtifactType,
    COLLECTED_KEY,
    LOADOUT_KEY,
    LEVELS_KEY,
    COLLECTION_UI_KEY,
    ARMY_PRESETS_KEY,
    ARMY_PRESET_MAX,
    STRATEGIES_KEY,
    STRATEGY_MIGRATION_BACKUP_KEY,
    STRATEGY_MAX,
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
    expectedPerkSign,
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
    saveArtifactPerkEdits,
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
    newStrategyId,
    normalizeStrategies,
    loadStrategies,
    saveStrategies,
    activeStrategyId,
    activeStrategy,
    setActiveStrategy,
    comparisonStrategies,
    setComparisonStrategyIds,
    createStrategyRatingContext,
    saveStrategyOverrides,
    updateStrategy,
    addStrategy,
    removeStrategy,
    archiveStrategy,
    strategyRevision,
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
    PERK_GROUPS,
    loadPerkGroupDefaults,
    savePerkGroupDefaults,
    groupPerkRating,
    loadStoredGlobalPerkRatings,
    loadGlobalPerkRatings,
    saveGlobalPerkRatings,
    loadProfilePerkOverrides,
    saveProfilePerkOverrides,
    loadActivePerkRatingLayers,
  };

  window.DN.scannerLog = scannerLog;
  ensureProfiles();
  ensurePerkRatingsMigrated();
})();
