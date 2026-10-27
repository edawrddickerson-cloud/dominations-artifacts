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
  const HALL_CAP = DN.artifactSlotCapacity('Legendary','Main');

  /** @type {{ key: string, label: string, count: number }[]} */
  const MAIN_TYPE_EXHIBITS = DN.ARTIFACT_TYPE_EXHIBITS.Main;
  /** @type {{ key: string, label: string, count: number }[]} */
  const WAR_TYPE_EXHIBITS = DN.ARTIFACT_TYPE_EXHIBITS.War;

  const el = {
    error: document.getElementById("error"),
    hallMain: document.getElementById("hall-main"),
    hallWar: document.getElementById("hall-war"),
    viewList: document.getElementById("view-list"),
    viewStructured: document.getElementById("view-structured"),
    list: document.getElementById("collection-list"),
    board: document.getElementById("museum-board"),
    workspace: document.getElementById('museum-workspace'),
    detail: document.getElementById('museum-detail'),
    picker: document.getElementById("slot-picker"),
    pickerTitle: document.getElementById("slot-picker-title"),
    pickerList: document.getElementById("slot-picker-list"),
    compareItem:document.getElementById('collection-compare-item'),
    compareSwap:document.getElementById('collection-compare-swap'),
    comparisonTotals:document.getElementById('collection-comparison-totals'),
    comparison:document.getElementById('collection-comparison'),
    layout:document.querySelector('.collection-layout'),
    summary:document.querySelector('.collection-summary'),
    compareUnlocked:document.getElementById('compare-unlocked'),
    compareAll:document.getElementById('compare-all'),
  };

  /** @type {object[]} */
  let rows = [];
  let catalogRows=[],catalogImages={},personalImages={};
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
  let listSort={key:'name',direction:'ascending'},listSlotTypes=null;

  /** @type {{ kind: "hall" | "hermitage", grade?: string } | null} */
  let pickerTarget = null;
  let highlightedId=null;
  let comparedId=null,comparisonSelectedId=null,factoryRatings={};
  let detailStrategyId=DN.activeStrategyId(),strategyFilter='all',strategyMetric='all';
  let lastActiveStrategyId=detailStrategyId;
  let strategyContexts=new Map(),strategyMetrics=new Map(),strategyRanks=new Map();
  let strategyScores=new Map();
  let uncertainStrategyGroups=new Map();
  let strategyState=DN.loadStrategies(),comparedStrategies=DN.comparisonStrategies(),strategyUsage=new Map();
  let refreshSequence=0;
  const comparisonStrategies=()=>comparedStrategies;
  function ratingContext(strategyId=DN.activeStrategyId()) {
    if(!strategyContexts.has(strategyId))strategyContexts.set(strategyId,DN.createStrategyRatingContext(factoryRatings,{strategyId,canonPerk}));
    return strategyContexts.get(strategyId);
  }
  function completeScore(row,mode) {
    if(row.scanned && mode==='all' && (row.scanned.rows.length<5 || row.scanned.rows.some(stat=>!stat.name)))return false;
    const perks=comparisonPerks(row,mode);
    return perks.length>0 && perks.every(perk=>Number.isFinite(comparisonValue(row,perk,mode)));
  }
  function strategyValue(row,strategyId,mode=strategyMetric) {
    const score=itemScore(row,mode,strategyId);
    return completeScore(row,mode)?(mode==='all'?score.potentialPreference:score.basePreference):null;
  }
  function usedStrategies(id) {
    return strategyUsage.get(id) || [];
  }
  function rebuildStrategyMetrics(owned) {
    strategyContexts=new Map();strategyMetrics=new Map();strategyRanks=new Map();strategyScores=new Map();uncertainStrategyGroups=new Map();
    strategyState=DN.loadStrategies();comparedStrategies=DN.comparisonStrategies();strategyUsage=new Map();
    for(const strategy of strategyState.strategies.filter(strategy=>!strategy.archived))for(const hall of ['Main','War']) {
      const layout=strategy.loadout[hall];
      for(const id of new Set([...layout.mains,layout.hermitage,...Object.keys(layout.singles)].filter(Boolean))) {
        if(!strategyUsage.has(id))strategyUsage.set(id,[]);
        strategyUsage.get(id).push(strategy);
      }
    }
    for(const strategy of comparisonStrategies()) {
      const values=new Map(owned.map(row=>[DN.artifactKey(row),{value:strategyValue(row,strategy.id),uncertain:itemScore(row,strategyMetric,strategy.id).rerollUncertain}]));
      strategyMetrics.set(strategy.id,values);
      uncertainStrategyGroups.set(strategy.id,new Set(owned.filter(row=>{const metric=values.get(DN.artifactKey(row));return metric.value==null || metric.uncertain;}).map(row=>row.grade)));
      const ranks=new Map();
      for(const type of new Set(owned.map(row=>row.grade))) {
        const candidates=owned.filter(row=>row.grade===type && values.get(DN.artifactKey(row)).value!=null && !values.get(DN.artifactKey(row)).uncertain)
          .sort((a,b)=>values.get(DN.artifactKey(b)).value-values.get(DN.artifactKey(a)).value || DN.text(a.name).localeCompare(DN.text(b.name)) || DN.artifactKey(a).localeCompare(DN.artifactKey(b)));
        candidates.forEach((row,index)=>ranks.set(DN.artifactKey(row),index+1));
      }
      strategyRanks.set(strategy.id,ranks);
    }
  }
  function topTwoCount(row) {
    const id=DN.artifactKey(row);
    return comparisonStrategies().filter(strategy=>(strategyRanks.get(strategy.id)?.get(id) ?? Infinity)<=2).length;
  }
  function matchesStrategyFilter(row) {
    const count=topTwoCount(row),total=comparisonStrategies().length,id=DN.artifactKey(row);
    if(strategyFilter==='any')return count>0;
    if(strategyFilter==='every')return total>0 && count===total;
    if(strategyFilter==='outside')return count===0 && total>0 && comparisonStrategies().every(strategy=>!uncertainStrategyGroups.get(strategy.id)?.has(row.grade));
    if(strategyFilter==='unused')return usedStrategies(id).length===0;
    if(strategyFilter==='incomplete')return comparisonStrategies().some(strategy=>{const metric=strategyMetrics.get(strategy.id)?.get(id);return metric?.value==null || metric.uncertain;});
    if(strategyFilter.startsWith('assigned:'))return usedStrategies(id).some(strategy=>strategy.id===strategyFilter.slice(9));
    return true;
  }
  const crafted=row=>row && !['Legendary','Mythical'].includes(DN.text(row.grade));
  function artworkThumb(id,name,size) {
    const row=byId[id],item=personalImages[id]?{...row?.scanned,image:personalImages[id]}:row?.scanned;
    if(!window.DNArtwork)return DN.thumbHtml(artifactImages[id] || '',name,size);
    const image=window.DNArtwork.html(item,'entity-thumb',name,catalogImages[id] || '');
    return '<span class="entity-thumb-frame '+DN.esc(size)+'">'+image+'</span>';
  }
  function applyScans(scans) {
    rows=window.DNStoredArtifacts.catalogRows(catalogRows,scans,{includeOrdinary:true});
    byId={};collected=DN.loadCollected();artifactImages={...catalogImages,...personalImages};
    for(const row of rows) {
      const id=DN.artifactKey(row);byId[id]=row;
      if(row.scanned && !row.scanned.catalogId)collected.add(id);
      if(row.scanned?.image && !personalImages[id])artifactImages[id]=row.scanned.image;
    }
  }

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
    if(crafted(byId[id]) || (byId[id]?.scanned && !byId[id].scanned.catalogId && !Object.prototype.hasOwnProperty.call(h.singles,id)))return "unused";
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
      return (ui.hall==='War'?'War ':'')+grade+' Exhibit';
    }
    return mode==='unused'?'Unused':'Showcase';
  }

  function exhibitGrade(exhibit) {
    const name=exhibit.key.replace(/^war-/, '');
    return name.charAt(0).toUpperCase()+name.slice(1);
  }
  function capacity(grade,hall=ui.hall) {
    return DN.artifactSlotCapacity(grade,hall);
  }
  function placeScannedArtifacts() {
    for(const row of rows) {
      if(!row.scanned)continue;
      const id=DN.artifactKey(row), h=loadout[row.hall];
      if(h.scannedPlaced.includes(id))continue;
      h.scannedPlaced.push(id);
      if(!DN.activeStrategy()?.legacy)continue;
      if(h.mains.includes(id) || h.hermitage===id)continue;
      delete h.singles[id];
      const used=h.mains.filter(other=>byId[other]?.grade===row.grade).length;
      if(used<capacity(row.grade,row.hall))h.mains.push(id);
    }
  }

  function persistLoadout() {
    if(JSON.stringify(DN.loadLoadout())!==JSON.stringify(loadout))DN.saveLoadout(loadout);
  }

  /** Catalogue artifacts default to Showcase; unassigned scanned copies stay unassigned. */
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
        if(crafted(row))continue;
        const perks = DN.perksOf(row, canonPerk);
        if (!perks.length) continue;
        h.singles[id] = perks[0].index;
        changed = true;
      }
    }
    if (changed) persistLoadout();
  }

  /** Respect each category's capacity; scanned overflow stays unassigned. */
  function enforceHallCaps() {
    let changed = false;
    for (const hall of ["Main", "War"]) {
      const h = loadout[hall];
      const kept = [];
      const counts = {};
      for (const id of h.mains) {
        const row = byId[id];
        if (!row || !collected.has(id)) {
          changed = true;
          continue;
        }
        const grade = DN.text(row.grade);
        if (!capacity(grade,hall)) {
          changed = true;
          continue;
        }
        if ((counts[grade] || 0) >= capacity(grade,hall)) {
          const perks = DN.perksOf(row, canonPerk);
          if (perks.length && !row.scanned) h.singles[id] = perks[0].index;
          changed = true;
          continue;
        }
        counts[grade] = (counts[grade] || 0) + 1;
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
    const override = levels[id]?.[String(perk.index)];
    if (override != null && Number.isFinite(Number(override))) return Number(override);
    const scanned=byId[id]?.scanned?.rows[perk.index-1];
    if(scanned) return scanned.value;
    const range = DN.effectivePerkRange(perk);
    if (range.base == null || range.max == null) return perk.base;
    const stored = levels[id] && levels[id][String(perk.index)];
    const current = stored != null ? Number(stored) : range.base;
    return DN.clampPerkLevel(range.base, range.max, current);
  }

  function displayPerkValue(id, perk) {
    const scanned=byId[id]?.scanned?.rows[perk.index-1];
    if(scanned && ui.valueMode==='max')return scanned.max ?? null;
    const range = DN.effectivePerkRange(perk);
    if (ui.valueMode === "max") return range.max != null ? range.max : perk.base;
    return actualPerkValue(id, perk);
  }

  function canStepPerk(perk, id) {
    return ui.valueMode === "actual" && Number.isFinite(actualPerkValue(id, perk));
  }

  function perkValueEditor(id, perk) {
    const value = actualPerkValue(id, perk);
    return `<input type="number" class="collection-perk-value" data-action="perk-value" data-id="${DN.esc(id)}" data-perk="${perk.index}" step="1" value="${DN.esc(formatNum(value))}" aria-label="Current value for ${DN.esc(perk.name)}" />`;
  }

  function editPerkValue(input) {
    const id = input.dataset.id, index = Number(input.dataset.perk);
    const row = byId[id], perk = row && DN.perksOf(row, canonPerk).find(p => p.index === index);
    if (!perk) return;
    const value = Number(input.value), current = actualPerkValue(id, perk);
    const scanned = row.scanned?.rows[index - 1];
    const range = scanned ? {base:scanned.base, max:scanned.max} : DN.effectivePerkRange(perk);
    const hasRange = range.base != null && range.max != null && range.base !== range.max;
    let error = '';
    if (!input.value.trim() || !Number.isInteger(value) || value === 0) error = 'Enter a nonzero whole number.';
    else if (current && Math.sign(value) !== Math.sign(current)) error = 'Keep the stat’s positive or negative sign.';
    else if (hasRange && (value < Math.min(range.base, range.max) || value > Math.max(range.base, range.max))) error = `Enter a value between ${Math.min(range.base, range.max)} and ${Math.max(range.base, range.max)}.`;
    input.setCustomValidity(error);
    if (error) { input.reportValidity(); return; }
    if (!levels[id]) levels[id] = {};
    if (row.scanned) levels[id]._scanRevision = Date.parse(row.scanned.updatedAt || row.scanned.capturedAt) || 0;
    levels[id][String(index)] = value;
    DN.saveLevels(levels);
    render();
  }

  function perkStar(id,perk) {
    const scanned=byId[id]?.scanned?.rows[perk.index-1],active=scanned?.unlocked===true;
    const label=active?'Unlocked':scanned?.unlocked===false?'Locked':'Star state unknown';
    return '<span class="collection-perk-star'+(active?' is-unlocked':'')+'" role="img" aria-label="'+label+'" title="'+DN.esc(scanned?.rangeReview || label)+'">'+(active?'★':'☆')+'</span>';
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
    if (mode !== "hall" && mode !== "showcase" && mode !== "hermitage" && mode!=='unused') return;
    if(mode==='showcase' && crafted(row)){showError('Crafted artifacts belong in exhibits or Unused.');return;}
    const h = hallState();
    const grade = DN.text(row.grade);

    if (mode === "hall") {
      if (!capacity(grade)) {
        showError("This category has no exhibit in the selected hall.");
        return;
      }
      if (!h.mains.includes(id)) {
        const used = mainsOfGrade(grade).length;
        if (used >= capacity(grade)) {
          showError(`${grade} slots full (${capacity(grade)}/${capacity(grade)}) for ${ui.hall}.`);
          return;
        }
      }
    } else if (mode === "hermitage") {
      if (grade !== "Legendary") {
        showError("Hermitage accepts Legendary only (not Mythical).");
        return;
      }
    } else if(mode!=='unused') {
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
    } else if(mode!=='unused') {
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
    const scanned = row.scanned?.rows[perkIndex - 1];
    const range = scanned ? {base:scanned.base, max:scanned.max} : DN.effectivePerkRange(perk);
    const current = actualPerkValue(id, perk);
    if (current == null) return;
    const hasRange = range.base != null && range.max != null && range.base !== range.max;
    const next = hasRange ? DN.stepPerkLevel(range.base, range.max, current, dir)
      : Math.sign(current) * Math.max(1, Math.abs(current) + (dir >= 0 ? 1 : -1));
    if (!levels[id]) levels[id] = {};
    if(row.scanned)levels[id]._scanRevision=Date.parse(row.scanned.updatedAt || row.scanned.capturedAt) || 0;
    if (next === range.base && !row.scanned) delete levels[id][String(perkIndex)];
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
      if(!['unused', 'showcase'].includes(modeOf(id)) || (crafted(row) && modeOf(id)!=='unused'))return false;
      if (kind === "hermitage") return g === "Legendary";
      if (kind === "hall") return g === grade;
      return false;
    }).sort(compareByScore);
  }

  function diceIcon(row,perk) {
    const eligible=crafted(row)?row.scanned?.rows[perk.index-1]?.rerollEligible ?? null:false;
    const state=eligible===true?'available':eligible===false?'unavailable':'unknown';
    const shape='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.4"/><circle cx="16" cy="8" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="8" cy="16" r="1.4"/><circle cx="16" cy="16" r="1.4"/></svg>';
    return '<span class="comparison-dice'+(eligible===true?' is-rerollable':eligible==null?' is-unknown':'')+'" role="img" aria-label="Reroll '+state+'" title="Reroll '+state+'">'+shape+'</span>';
  }
  function comparisonPerks(row,mode=ui.compareRows) {
    return DN.perksOf(row, canonPerk).filter(perk => mode === 'all' || mode === 'current' || !row.scanned || row.scanned.rows[perk.index - 1]?.unlocked === true);
  }

  function comparisonMaxValue(row,perk) {
    const scanned=row.scanned?.rows[perk.index-1];
    return scanned?scanned.max ?? window.DNStoredArtifacts.impliedRange(scanned)?.max ?? null:DN.effectivePerkRange(perk).max;
  }
  function comparisonValue(row,perk,mode=ui.compareRows) {
    return mode==='all'?comparisonMaxValue(row,perk):actualPerkValue(DN.artifactKey(row),perk);
  }
  function itemScore(row,mode=ui.compareRows,strategyId=DN.activeStrategyId()) {
    const key=JSON.stringify([DN.artifactKey(row),mode,strategyId]);
    if(strategyScores.has(key))return strategyScores.get(key);
    const scored={};
    comparisonPerks(row,mode).forEach(perk=>{scored['perk_'+perk.index+'_name']=perk.name;scored['perk_'+perk.index+'_base']=String(comparisonValue(row,perk,mode) ?? '');});
    let axes={offensive:document.getElementById('header-off').getAttribute('aria-pressed')==='true',defensive:document.getElementById('header-def').getAttribute('aria-pressed')==='true'};
    if(crafted(row))axes=window.DNArtifactScoring.craftingAxes(axes,{hall:row.hall,type:row.grade});
    const result=window.DNArtifactScoring.comparisonScore(scored,{canonPerk,scoreMode:'combined',
      prefSortAxes:axes,ratingOf:ratingContext(strategyId).ratingOf},
      {hall:row.hall,grade:row.grade,eligible:comparisonPerks(row,mode).map(perk=>mode==='all'?(row.scanned?.rows[perk.index-1]?.rerollEligible ?? (crafted(row)?null:false)):false)});
    strategyScores.set(key,result);
    return result;
  }
  function compareByStrategyScore(a,b,strategyId=DN.activeStrategyId()) {
    const left=strategyValue(a,strategyId,ui.compareRows),right=strategyValue(b,strategyId,ui.compareRows);
    if(left==null || right==null)return left==null && right==null?DN.text(a.name).localeCompare(DN.text(b.name)):left==null?1:-1;
    return right-left || DN.text(a.name).localeCompare(DN.text(b.name));
  }
  function compareByScore(a,b) {return compareByStrategyScore(a,b);}
  function comparisonCandidates(selected) {
    return selected?ownedForHall().filter(row=>row.grade===selected.grade && DN.artifactKey(row)!==highlightedId).sort(compareByScore):[];
  }
  function syncInspector() {
    const visible=!!(byId[highlightedId] || pickerTarget);
    if(!visible && el.summary.contains(document.activeElement))document.activeElement.blur();
    el.summary.inert=!visible;
    el.summary.setAttribute('aria-hidden',String(!visible));
    el.summary.classList.toggle('is-visible',visible);
    el.layout.classList.toggle('has-selection',visible);
    el.summary.querySelector('.collection-comparison').hidden=!!pickerTarget;
    el.picker.hidden=!pickerTarget;
  }
  function renderComparison() {
    const selected=byId[highlightedId];
    if(!DN.loadStrategies().strategies.some(strategy=>strategy.id===detailStrategyId && !strategy.archived))detailStrategyId=DN.activeStrategyId();
    const scoreFor=(row,mode=ui.compareRows)=>itemScore(row,mode,detailStrategyId);
    syncInspector();
    for (const [button, mode] of [[el.compareUnlocked, 'unlocked'], [el.compareAll, 'all']]) {
      button.classList.toggle('is-active', ui.compareRows === mode);
      button.setAttribute('aria-pressed', String(ui.compareRows === mode));
    }
    // Keep the previous contents in place while the panel slides out.
    if(!selected){comparedId=null;comparisonSelectedId=null;return;}
    if(comparisonSelectedId!==highlightedId){comparedId=null;comparisonSelectedId=highlightedId;}
    const candidates=comparisonCandidates(selected);
    if(!candidates.some(row=>DN.artifactKey(row)===comparedId))comparedId=null;
    candidates.sort((a,b)=>compareByStrategyScore(a,b,detailStrategyId));
    el.compareItem.innerHTML='<option value="">Choose artifact</option>'+candidates.map(row=>{const score=scoreFor(row);return '<option value="'+DN.esc(DN.artifactKey(row))+'">'+DN.esc(DN.show(row.name))+' · '+(ui.compareRows==='all'?'Full Potential ':'Unlocked Score ')+(completeScore(row,ui.compareRows)?(score.rerollUncertain?'~':'')+formatNum(score.potentialPreference):'Incomplete')+'</option>';}).join('');
    el.compareItem.disabled=!candidates.length;
    if(comparedId)el.compareItem.value=comparedId;
    const other=byId[comparedId];
    const canSwap=!!(selected && other && detailStrategyId===DN.activeStrategyId() && ['hall','hermitage'].includes(modeOf(highlightedId)) && ['unused','showcase'].includes(modeOf(comparedId)));
    el.compareSwap.disabled=!canSwap;
    el.compareSwap.hidden=!other;
    el.compareSwap.title=canSwap?'Replace '+selected.name+' with '+other.name+' in '+DN.activeStrategy().name:'Choose the active strategy and an assigned slot to swap.';
    el.compareSwap.remove();
    const valid=(row,mode=ui.compareRows)=>completeScore(row,mode);
    const leftScore=scoreFor(selected),rightScore=other?scoreFor(other):null;
    const signed=value=>(value>0?'+':'')+formatNum(value);
    const statCells=(row,score,index,side)=>{
      const line=score?.lines[index];
      const perk=line?comparisonPerks(row,'all')[index]:null,value=perk?comparisonValue(row,perk):null;
      const points=line?line.preference:null;
      const locked=perk && row.scanned && row.scanned.rows[perk.index-1]?.unlocked!==true;
      const star=perk?perkStar(DN.artifactKey(row),perk):'';
      const name='<td class="comparison-stat '+side+'">'+(line?'<span class="comparison-stat-content">'+(side==='left'?diceIcon(row,perk)+star:'')+'<span class="comparison-stat-name'+(locked?' is-locked':'')+'">'+DN.esc(line.name)+'</span>'+(side==='right'?star+diceIcon(row,perk):'')+'</span>':DN.BLANK)+'</td>';
      const stat='<td class="comparison-perk-stat">'+DN.formatPerkValue(perk?.name,value)+'</td>';
      const weighted='<td class="comparison-line-score"><b>'+(Number.isFinite(value)?formatNum(points):DN.BLANK)+'</b></td>';
      return side==='left'?name+stat+weighted:weighted+stat+name;
    };
    const portrait=row=>'<figure class="comparison-portrait">'+artworkThumb(DN.artifactKey(row),DN.show(row.name),'entity-thumb--comparison')+'</figure>';
    const uncertain=leftScore.rerollUncertain || rightScore?.rerollUncertain;
    const difference=other && valid(selected) && valid(other)?(uncertain?'~':'')+signed(rightScore.potentialPreference-leftScore.potentialPreference):DN.BLANK;
    const delta=other && valid(selected) && valid(other) && !uncertain?rightScore.potentialPreference-leftScore.potentialPreference:0;
    const comparedTone=delta>0?' is-higher':delta<0?' is-lower':'';
    const headerScores=row=>({unlocked:scoreFor(row,'unlocked'),full:scoreFor(row,'all')});
    const leftHeader=headerScores(selected),rightHeader=other?headerScores(other):null;
    const leftDisplay=ui.compareRows==='all'?leftHeader.full:scoreFor(selected,'current');
    const rightDisplay=other?(ui.compareRows==='all'?rightHeader.full:scoreFor(other,'current')):null;
    const itemHeader=(row,actual)=>{
      const unlocked=valid(row,'unlocked')?formatNum(actual.unlocked.basePreference):DN.BLANK;
      const potential=valid(row,'all')?(actual.full.rerollUncertain?'~':'')+formatNum(actual.full.potentialPreference):DN.BLANK;
      const breakdown='<div class="comparison-header-scores"><div class="comparison-header-metric"><span>Unlocked Score:</span><strong class="comparison-unlocked-score">'+unlocked+'</strong></div><span class="comparison-score-separator">/</span><div class="comparison-header-metric"><span>Full Potential:</span><strong class="comparison-total comparison-potential-total">'+potential+'</strong></div></div>';
      const note=actual.full.rerollUncertain?'<small class="comparison-reroll-note">Reroll availability unknown · possible gain may be higher</small>':'';
      return '<div class="comparison-item">'+portrait(row)+'<div class="comparison-item-heading"><h3>'+DN.esc(row.name)+'</h3>'+breakdown+note+'</div></div>';
    };
    el.comparisonTotals.innerHTML='<div class="comparison-score'+(other?'':' is-single')+'">'+itemHeader(selected,leftHeader)+(other?itemHeader(other,rightHeader):'')+'</div>';
    const strategies=comparisonStrategies(),usage=usedStrategies(highlightedId);
    document.getElementById('collection-strategy-summary').innerHTML='<p>Used by '+usage.length+' strategies'+(usage.length?': '+DN.esc(usage.map(strategy=>strategy.name).join(', ')):'')+'</p><p>Detail: '+DN.esc(DN.loadStrategies().strategies.find(strategy=>strategy.id===detailStrategyId)?.name || '')+' · '+(ui.compareRows==='all'?'Full potential':'Unlocked now')+'</p><div class="strategy-comparison-grid">'+strategies.map(strategy=>{
      const left=strategyValue(selected,strategy.id,ui.compareRows),right=other?strategyValue(other,strategy.id,ui.compareRows):null;
      const uncertain=itemScore(selected,ui.compareRows,strategy.id).rerollUncertain || (other && itemScore(other,ui.compareRows,strategy.id).rerollUncertain);
      const display=value=>value==null?DN.BLANK:(uncertain?'~':'')+formatNum(value);
      return '<button type="button" data-detail-strategy="'+DN.esc(strategy.id)+'" aria-pressed="'+(detailStrategyId===strategy.id)+'"><strong>'+DN.esc(strategy.name)+'</strong><span>A '+display(left)+(other?' / B '+display(right)+' / Δ '+(left!=null && right!=null?(uncertain?'~':'')+signed(right-left):DN.BLANK):'')+'</span></button>';
    }).join('')+'</div>';
    const count=Math.max(leftHeader.full.lines.length,rightHeader?.full.lines.length || 0,1);
    const divider='<td class="comparison-divider" rowspan="'+count+'"><div class="comparison-center"><span class="comparison-change'+comparedTone+'" title="Score change on swap" aria-label="Score change on swap '+difference+'"><strong>'+difference+'</strong></span></div></td>';
    el.comparison.innerHTML='<div class="comparison-artifacts'+(other?'':' is-single')+'"><div class="comparison-table-scroll"><table class="collection-stat-comparison"><thead><tr><th class="comparison-name-heading">Name</th><th class="comparison-stat-heading">Stat</th><th class="comparison-score-heading">Score</th>'+(other?'<th class="comparison-divider-heading" aria-label="Swap comparison"></th><th class="comparison-score-heading">Score</th><th class="comparison-stat-heading">Stat</th><th class="comparison-name-heading">Name</th>':'')+'</tr></thead><tbody>'+Array.from({length:count},(_,index)=>'<tr>'+statCells(selected,leftDisplay,index,'left')+(other?(index===0?divider:'')+statCells(other,rightDisplay,index,'right'):'')+'</tr>').join('')+'</tbody></table></div></div>';
    if(other)el.comparison.querySelector('.comparison-center').append(el.compareSwap);
  }

  function openPicker(kind, grade, replacing=null, reveal=true) {
    pickerTarget = kind === "hermitage" ? { kind: "hermitage",replacing } : { kind: "hall", grade,replacing };
    const target=pickerTarget;
    highlightedId=replacing;renderBoard();renderDetail();
    const title =
      kind === "hermitage"
        ? "Hermitage — Legendary"
        : `${ui.hall==='War' && grade!=='Legendary' && grade!=='Mythical'?'War ':''}${grade} ${grade==='Legendary' || grade==='Mythical'?'Hall':'Exhibit'} slot`;
    el.pickerTitle.textContent = title;
    const candidates = pickerCandidates(kind, grade).filter(row=>DN.artifactKey(row)!==replacing);
    if (!candidates.length) {
      el.pickerList.innerHTML = `<p class="collection-empty">No eligible owned artifacts.</p>`;
    } else {
      el.pickerList.innerHTML = candidates
        .map((row) => {
          const id = DN.artifactKey(row);
          const slot = slotLabel(id);
          const thumb = artworkThumb(id,DN.show(row.name),"entity-thumb--collection");
          return (
            `<button type="button" class="slot-picker-item" data-action="picker-pick" data-id="${DN.esc(id)}">` +
            `<span class="slot-picker-thumb">${thumb}</span>` +
            `<span class="slot-picker-meta">` +
            `<span class="slot-picker-name">${DN.esc(DN.show(row.name))}</span>` +
            `<span class="slot-picker-slot">${DN.esc(slot)} · Potential ${itemScore(row).rerollUncertain?'~':''}${formatNum(itemScore(row).potentialPreference)}</span>` +
            `</span></button>`
          );
        })
        .join("");
    }
    el.picker.hidden = false;
    // Wait for the comparison panel's opening transition before positioning it.
    if(reveal)setTimeout(()=>{
      if(pickerTarget===target)el.picker.scrollIntoView({block:'nearest'});
    },350);
  }

  function closePicker() {
    pickerTarget = null;
    el.pickerList.innerHTML = "";
    syncInspector();
  }

  function renderDetail() {
    const row=byId[highlightedId];
    for(const card of el.list.querySelectorAll('[data-artifact-id]'))card.classList.toggle('is-highlighted',card.dataset.artifactId===highlightedId);
    el.detail.innerHTML=row?renderPerkEditor(row):'';
    renderComparison();
  }
  function renderPerkEditor(row) {
    const id=DN.artifactKey(row),perks=DN.perksOf(row,canonPerk);
    const count=Math.min(6,Math.max(5,row.scanned?.rows.length || 0,...perks.map(perk=>perk.index)));
    const names=[...new Set([...Object.keys(factoryRatings),...rows.flatMap(item=>DN.perksOf(item,canonPerk).map(perk=>perk.name))])].filter(Boolean).sort();
    const number=(field,label,value,index,min,max)=>'<label>'+label+'<input type="number" name="'+field+'" step="1"'+(min!=null?' min="'+min+'" max="'+max+'"':'')+' value="'+(Number.isFinite(value)?value:'')+'" aria-label="'+label+' for perk '+index+'"></label>';
    const types=row.hall==='War'?['Weapon','Armor','Equipment','Legendary','Mythical']:['Weapon','Armor','Jewelry','Pottery','Legendary','Mythical'];
    const metadata=row.scanned?'<fieldset class="artifact-perk-edit-row"><legend>Artifact</legend><label class="artifact-perk-edit-name">Item name<input type="text" name="artifact-name" value="'+DN.esc(row.name)+'" required /></label><label>Type<select name="artifact-type">'+types.map(type=>'<option value="'+type+'"'+(type===row.grade?' selected':'')+'>'+type+'</option>').join('')+'</select></label></fieldset>':'';
    return '<form class="artifact-perk-editor" data-id="'+DN.esc(id)+'">'+metadata+'<datalist id="collection-perk-names">'+names.map(name=>'<option value="'+DN.esc(name)+'">').join('')+'</datalist>'+Array.from({length:count},(_,offset)=>{
      const index=offset+1,perk=perks.find(perk=>perk.index===index),scanned=row.scanned?.rows[offset];
      const value=perk?actualPerkValue(id,perk):scanned?.value;
      const base=scanned?scanned.base:perk?.base,max=scanned?scanned.max:perk?.max;
      const level=scanned?.level ?? (Number.isFinite(value) && Number.isFinite(base) && Math.sign(value)===Math.sign(base)?Math.abs(value)-Math.abs(base)+1:null);
      const tiers=DN.text(row.hall)==='War'?[1,3,6]:[1,6,11];
      const preset=crafted(row) && tiers.includes(Math.abs(base)) && Math.abs(max)===Math.abs(base)+9;
      const recorded=Number.isFinite(base) && Number.isFinite(max) && !preset;
      const tier=preset?String(Math.abs(base)):recorded?'recorded':'';
      const tierOptions='<option value="">Choose tier</option>'+(crafted(row)?tiers.map((base,index)=>'<option value="'+base+'"'+(tier===String(base)?' selected':'')+'>'+['White','Green','Blue'][index]+'</option>').join(''):'')+(recorded?'<option value="recorded" selected>'+ (crafted(row)?'Recorded':'Fixed')+'</option>':'');
      const state=scanned?.unlocked===true?'true':scanned?.unlocked===false?'false':'';
      return '<fieldset class="artifact-perk-edit-row" data-index="'+index+'"><legend>Perk '+index+'</legend><label class="artifact-perk-edit-name">Name<input type="text" name="name" list="collection-perk-names" value="'+DN.esc(perk?.name || scanned?.name || '')+'" aria-label="Name for perk '+index+'"></label>'+
        number('value',DN.isCountPerk(perk?.name || scanned?.name)?'Current count':'Current %',value,index)+number('level','Level',level,index,1,10)+'<label>Tier<select name="tier" aria-label="Tier for perk '+index+'">'+tierOptions+'</select></label>'+
        (row.scanned?'<label>State<select name="unlocked" aria-label="State for perk '+index+'"><option value=""'+(state===''?' selected':'')+'>Unknown</option><option value="true"'+(state==='true'?' selected':'')+'>Unlocked</option><option value="false"'+(state==='false'?' selected':'')+'>Locked</option></select></label>':'')+(row.scanned?'<label>Reroll<select name="reroll" aria-label="Reroll availability for perk '+index+'"'+(!crafted(row)?' disabled':'')+'><option value=""'+(scanned?.rerollEligible==null && crafted(row)?' selected':'')+'>Unknown</option><option value="true"'+(scanned?.rerollEligible===true?' selected':'')+'>Available</option><option value="false"'+(scanned?.rerollEligible===false || !crafted(row)?' selected':'')+'>Unavailable</option></select></label>':'')+'</fieldset>';
    }).join('')+'<div class="artifact-perk-edit-actions"><button type="submit" class="btn btn-accent">Save</button><button type="button" class="btn" data-action="edit-cancel">Cancel</button><span class="artifact-perk-edit-status" role="status"></span></div></form>';
  }
  async function savePerkEditor(form) {
    const id=form.dataset.id,row=byId[id];if(!row)return;
    const fields=[...form.querySelectorAll('.artifact-perk-edit-row[data-index]')];
    const itemName=form.querySelector('[name="artifact-name"]'),itemType=form.querySelector('[name="artifact-type"]');
    if(itemName){itemName.setCustomValidity(itemName.value.trim()?'':'Enter an item name.');}
    let invalid=false;
    const corrected=fields.map((field,offset)=>{
      const input=name=>field.querySelector('[name="'+name+'"]');
      for(const element of field.querySelectorAll('input,select'))element.setCustomValidity('');
      const read=name=>{
        const element=input(name),raw=element.value.trim(),value=raw===''?null:Number(raw);
        if(value!==null && (!Number.isInteger(value) || (name==='level'?(value<1 || value>10):value===0))){element.setCustomValidity(name==='level'?'Use level 1–10.':'Enter a nonzero whole number.');invalid=true;}
        return value;
      };
      let value=read('value'),level=read('level');
      const previous=DN.perksOf(row,canonPerk).find(perk=>perk.index===offset+1),scanned=row.scanned?.rows[offset];
      const previousBase=scanned?scanned.base:previous?.base,previousMax=scanned?scanned.max:previous?.max;
      const tier=input('tier').value;
      let base=null,max=null;
      if(tier==='recorded'){base=previousBase;max=previousMax;}
      else if(tier!==''){
        const magnitude=Number(tier),sign=Math.sign(value || previousBase || previousMax || 1);
        const presets=DN.text(row.hall)==='War'?[1,3,6]:[1,6,11];
        if(!crafted(row) || !presets.includes(magnitude)){input('tier').setCustomValidity('Choose a tier.');invalid=true;}
        else{base=sign*magnitude;max=sign*(magnitude+9);}
      }
      const name=canonPerk(input('name').value.trim());
      if(DN.isCountPerk(name)) {
        base=value ?? previousBase;max=base;level=1;
      }
      if(Number.isInteger(level) && Number.isFinite(value) && base===null)base=Math.sign(value)*(Math.abs(value)-level+1);
      if(Number.isFinite(base) && max===null && Number.isInteger(level))max=Math.sign(base)*(Math.abs(base)+9);
      if(value===null && Number.isFinite(base) && Number.isInteger(level))value=Math.sign(base)*(Math.abs(base)+level-1);
      if(level===null && Number.isFinite(base) && Number.isFinite(value) && Math.sign(base)===Math.sign(value)){
        const implied=Math.abs(value)-Math.abs(base)+1;if(implied>=1 && implied<=10)level=implied;
      }
      let error='';
      if(base!==null && max!==null && (Math.sign(base)!==Math.sign(max) || Math.abs(max)<Math.abs(base)))error='Base and max must have the same sign; max must be stronger.';
      else if(value!==null && base!==null && max!==null && (value<Math.min(base,max) || value>Math.max(base,max)))error='Current value must be within base and max.';
      else if(Number.isFinite(base) && level!==null && value!==null && value!==Math.sign(base)*(Math.abs(base)+level-1))error='Current value does not match this base and level.';
      if(error){input('value').setCustomValidity(error);invalid=true;}
      return {...row.scanned?.rows[offset],name,value,level,base,max,unlocked:row.scanned?(input('unlocked').value===''?null:input('unlocked').value==='true'):true,
        rerollEligible:row.scanned?(input('reroll').value===''?null:input('reroll').value==='true'):false,rerollSource:row.scanned?'manual':'artifact-type',rerollConfidence:'high',rerollConflict:false,levelSource:level==null?null:'manual',rangeSource:base!=null && max!=null?'manual':null,tier:null,tierSource:null,tierConflict:false,rangeCandidates:[],rangeReview:null};
    });
    if(invalid || !form.checkValidity()){form.reportValidity();return;}
    const button=form.querySelector('[type="submit"]'),status=form.querySelector('[role="status"]');button.disabled=true;status.textContent='';
    try {
      if(row.scanned){
        const type=itemType.value;
        const updated=await window.DNStoredArtifacts.update(id,{name:itemName.value.trim(),type:(row.hall==='War'?'War ':'')+type,rows:corrected,corrected:true});
        const replacement=window.DNStoredArtifacts.toRow(updated);
        rows[rows.indexOf(row)]=replacement;byId[id]=replacement;
        if(type!==row.grade){DN.removeArtifactSlots(id);loadout=DN.loadLoadout();}
        levels[id]={_scanRevision:Date.parse(updated.updatedAt)};
      } else {
        DN.saveArtifactPerkEdits(id,corrected.map(perk=>({name:perk.name,base:perk.base,max:perk.max})));
        const next={};corrected.forEach((perk,index)=>{if(perk.value!=null)next[String(index+1)]=perk.value;});levels[id]=next;
      }
      DN.saveLevels(levels);showError('');render();
      el.detail.querySelector('[role="status"]').textContent='Saved';
    } catch {button.disabled=false;status.textContent='Could not save. Try again.';}
  }
  async function deleteArtifact(id, button) {
    const row=byId[id];if(!row || !collected.has(id))return;
    const deletionProfile=DN.activeProfileId();
    const dialog=document.getElementById('collection-delete-dialog');
    if(dialog.open)return;
    document.getElementById('collection-delete-name').textContent=DN.show(row.name);
    dialog.returnValue='cancel';
    const confirmed=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='delete'),{once:true}));
    dialog.showModal();
    if(!await confirmed)return;
    if(deletionProfile!==DN.activeProfileId())return;
    button.disabled=true;
    try {
      if(row.scanned)await window.DNStoredArtifacts.remove(id);
      if(deletionProfile!==DN.activeProfileId())return;
      DN.removeArtifactSlots(id);
      collected.delete(id);
      DN.lsSet(DN.COLLECTED_KEY,JSON.stringify([...collected].filter(key=>!byId[key]?.scanned || byId[key].scanned.catalogId)));
      for(const hall of ['Main','War']) {
        clearFromLoadout(loadout[hall],id);
        loadout[hall].scannedPlaced=loadout[hall].scannedPlaced.filter(key=>key!==id);
      }
      delete levels[id];DN.saveLevels(levels);persistLoadout();
      if(row.scanned){
        rows=rows.filter(item=>DN.artifactKey(item)!==id);delete byId[id];delete artifactImages[id];
        const original=catalogRows.find(item=>item.artifact_id===id);
        if(original){rows.push(original);byId[id]=original;if(catalogImages[id])artifactImages[id]=catalogImages[id];}
      }
      if(highlightedId===id)highlightedId=null;
      closePicker();showError('');render();
    } catch {button.disabled=false;showError('Could not delete this artifact. Please try again.');}
  }
  function swapIntoSlot(id) {
    const target=pickerTarget, row=byId[id];
    if(!target || !row || !pickerCandidates(target.kind,target.grade).some(candidate=>DN.artifactKey(candidate)===id))return;
    const h=hallState(), old=target.replacing;
    if(!old){setMode(id,target.kind==='hermitage'?'hermitage':'hall');highlightedId=id;closePicker();renderDetail();return;}
    const selectedIndex=h.mains.indexOf(id), oldIndex=h.mains.indexOf(old);
    if(target.kind==='hall' && selectedIndex>=0 && oldIndex>=0) {
      [h.mains[oldIndex],h.mains[selectedIndex]]=[id,old];
    } else if(target.kind==='hall' && h.hermitage===id && oldIndex>=0) {
      h.mains[oldIndex]=id;h.hermitage=old;
    } else if(target.kind==='hermitage' && selectedIndex>=0) {
      h.mains[selectedIndex]=old;h.hermitage=id;
    } else {
      clearFromLoadout(h,id);
      if(target.kind==='hall')h.mains[oldIndex]=id;else h.hermitage=id;
      delete h.singles[old];
      if(!crafted(byId[old])) {
        const perks=DN.perksOf(byId[old],canonPerk);
        if(perks.length)h.singles[old]=perks[0].index;
      }
    }
    highlightedId=id;persistLoadout();closePicker();render();
  }

  function syncControls() {
    el.hallMain.classList.toggle("is-active", ui.hall === "Main");
    el.hallWar.classList.toggle("is-active", ui.hall === "War");
    el.viewList.classList.toggle("is-active", ui.viewMode === "list");
    el.viewStructured.classList.toggle("is-active", ui.viewMode === "structured");
    el.hallMain.setAttribute("aria-pressed", ui.hall === "Main" ? "true" : "false");
    el.hallWar.setAttribute("aria-pressed", ui.hall === "War" ? "true" : "false");
    el.viewList.setAttribute("aria-pressed", ui.viewMode === "list" ? "true" : "false");
    el.viewStructured.setAttribute("aria-pressed", ui.viewMode === "structured" ? "true" : "false");
  }

  function listTypeOrder() {
    return [...(ui.hall==='War'?WAR_TYPE_EXHIBITS:MAIN_TYPE_EXHIBITS).map(exhibitGrade),'Legendary','Mythical'];
  }
  function renderArtifactTable(owned) {
    const strategies=comparisonStrategies().filter(strategy=>strategy.name!=='Main strategy');
    const count=Math.max(5,...owned.map(row=>DN.perksOf(row,canonPerk).length));
    const heading=(label,key)=>'<th scope="col" aria-sort="'+(listSort.key===key?listSort.direction:'none')+'"><button type="button" data-action="list-sort" data-sort="'+key+'"'+(key.startsWith('stat-')?' title="Sort by this stat’s score at maximum upgrade"':'')+'>'+label+(listSort.key===key?listSort.direction==='ascending'?' ↑':' ↓':'')+'</button></th>';
    const columns='<th scope="col" class="collection-table-stats-heading" aria-sort="'+(listSort.key.startsWith('stat-')?listSort.direction:'none')+'"><div class="collection-table-stats-header"><span>Stats</span><details class="collection-stat-sort-menu"><summary>'+(listSort.key.startsWith('stat-')?'Stat '+(Number(listSort.key.slice(5))+1)+(listSort.direction==='ascending'?' ↑':' ↓'):'Sort stat')+'</summary><div>'+Array.from({length:count},(_,index)=>'<button type="button" data-action="list-sort" data-sort="stat-'+index+'" title="Sort by stat '+(index+1)+' score">Stat '+(index+1)+(listSort.key==='stat-'+index?listSort.direction==='ascending'?' ↑':' ↓':'')+'</button>').join('')+'</div></details><span class="collection-table-value-headings"><span>Current</span><span>Score</span></span></div></th>';
    const complete=completeScore;
    const metrics=new Map(owned.map(row=>[row,{full:itemScore(row,'all'),unlocked:itemScore(row,'unlocked')}]));
    const sortValue=row=>{
      const score=metrics.get(row),key=listSort.key;
      if(key==='name')return DN.show(row.name);
      if(key==='type')return DN.text(row.grade);
      if(key==='slot')return slotLabel(DN.artifactKey(row));
      if(key==='unlocked')return complete(row,'unlocked')?score.unlocked.basePreference:null;
      if(key==='potential')return complete(row,'all')?score.full.potentialPreference:null;
      if(key.startsWith('strategy-score:'))return strategyMetrics.get(key.slice(15))?.get(DN.artifactKey(row))?.value ?? null;
      if(key.startsWith('strategy-rank:'))return strategyRanks.get(key.slice(14))?.get(DN.artifactKey(row)) ?? null;
      const index=Number(key.slice(5)),line=score.full.lines[index],perk=DN.perksOf(row,canonPerk)[index];
      return line && Number.isFinite(comparisonMaxValue(row,perk))?line.preference:null;
    };
    const sorted=owned.slice().sort((a,b)=>{
      const types=listTypeOrder(),leftType=DN.text(a.grade),rightType=DN.text(b.grade);
      const rank=type=>types.includes(type)?types.indexOf(type):types.length;
      const section=rank(leftType)-rank(rightType) || (leftType===rightType?0:leftType.localeCompare(rightType));
      if(section)return section;
      const left=sortValue(a),right=sortValue(b);
      if(left==null || right==null)return left==null && right==null?DN.text(a.name).localeCompare(DN.text(b.name)):left==null?1:-1;
      const order=typeof left==='number'?left-right:String(left).localeCompare(String(right));
      return order*(listSort.direction==='ascending'?1:-1) || DN.text(a.name).localeCompare(DN.text(b.name));
    });
    const renderRow=row=>{
      const id=DN.artifactKey(row),perks=DN.perksOf(row,canonPerk),{full}=metrics.get(row);
      const stats=Array.from({length:count},(_,index)=>{
        const perk=perks[index];if(!perk)return '<div class="collection-table-stat">'+DN.BLANK+'</div>';
        const value=actualPerkValue(id,perk),line=full.lines[index];
        const points=line?line.preference:null;
        const locked=row.scanned && row.scanned.rows[perk.index-1]?.unlocked!==true;
        return '<div class="collection-table-stat"><div class="collection-table-stat-title">'+diceIcon(row,perk)+perkStar(id,perk)+'<span class="comparison-stat-name'+(locked?' is-locked':'')+'">'+DN.esc(perk.name)+'</span></div><div class="collection-table-stat-values"><span>'+DN.formatPerkValue(perk.name,value)+'</span><span title="Score at maximum upgrade">'+(Number.isFinite(comparisonMaxValue(row,perk))?formatNum(points):DN.BLANK)+'</span></div></div>';
      }).join('');
      const usage=usedStrategies(id);
      const identity='<div class="collection-table-identity"><div class="collection-table-thumb">'+artworkThumb(id,DN.show(row.name),'entity-thumb--collection')+'</div><div><button type="button" class="card-name collection-table-name" data-action="inspect" data-id="'+DN.esc(id)+'">'+DN.esc(DN.show(row.name))+'</button><small title="'+DN.esc(usage.map(strategy=>strategy.name).join(', '))+'">Used by '+usage.length+' strategies</small></div></div>';
      const strategyCells=strategies.map(strategy=>{
        const metric=strategyMetrics.get(strategy.id)?.get(id),rank=strategyRanks.get(strategy.id)?.get(id);
        return '<td class="collection-strategy-score"><button type="button" data-action="strategy-inspect" data-strategy-id="'+DN.esc(strategy.id)+'" data-id="'+DN.esc(id)+'" title="Inspect using '+DN.esc(strategy.name)+'">'+(metric?.value!=null?(metric.uncertain?'~':'')+formatNum(metric.value):DN.BLANK)+'<small>'+(rank?(uncertainStrategyGroups.get(strategy.id)?.has(row.grade)?'Known rank ':'Rank ')+rank+(rank<=2?' · Top 2':''):metric?.value==null?'Incomplete':metric.uncertain?'Uncertain reroll':'Incomplete')+'</small></button></td>';
      }).join('');
      return '<tr class="artifact-card collection-table-row" data-artifact-id="'+DN.esc(id)+'"><th scope="row">'+identity+'</th><td class="collection-table-type">'+DN.esc(row.grade)+'</td><td class="collection-table-slot">'+DN.esc(slotLabel(id))+'</td><td class="collection-table-stats-cell"><div class="collection-table-stats" style="--stat-count:'+count+'">'+stats+'</div></td>'+strategyCells+'<td class="collection-table-actions"><button type="button" class="btn" data-action="inspect" data-id="'+DN.esc(id)+'">Compare / Edit</button><button type="button" class="btn artifact-delete" data-action="delete" data-id="'+DN.esc(id)+'" aria-label="Delete '+DN.esc(row.name)+'">Delete</button></td></tr>';
    };
    const groups=new Map();
    for(const row of sorted){const type=DN.text(row.grade);if(!groups.has(type))groups.set(type,[]);groups.get(type).push(row);}
    const strategyColumns=strategies.map(strategy=>'<th scope="col" class="collection-strategy-heading"><span>'+DN.esc(strategy.name)+'</span><div>'+heading('Score','strategy-score:'+strategy.id).replace(/^<th[^>]*>|<\/th>$/g,'')+heading('Rank','strategy-rank:'+strategy.id).replace(/^<th[^>]*>|<\/th>$/g,'')+'</div></th>').join('');
    const body=Array.from(groups,([type,items])=>'<tbody class="collection-type-section" data-slot-type="'+DN.esc(type)+'"><tr class="collection-section-heading"><th colspan="'+(5+strategies.length)+'" scope="rowgroup">'+DN.esc(type)+'<span>'+items.length+' artifact'+(items.length===1?'':'s')+'</span></th></tr>'+items.map(renderRow).join('')+'</tbody>').join('');
    return '<table class="collection-owned-table" style="--strategy-columns:'+strategies.length+'"><caption class="visually-hidden">Owned artifacts, stats and scores. Strategy ranks use every owned artifact in the same hall and type.</caption><thead><tr>'+heading('Artifact','name')+heading('Type','type')+heading('Slot','slot')+columns+strategyColumns+'<th scope="col">Actions</th></tr></thead>'+body+'</table>';
  }
  function renderArtifactCard(row,{detail=false}={}) {
    const id = DN.artifactKey(row);
    const mode = modeOf(id);
    const perks = DN.perksOf(row, canonPerk);
    const singleIdx = hallState().singles[id];
    const grade = DN.text(row.grade);
    const slot = slotLabel(id);
    const canHermitage = grade === "Legendary";
    function tierClass(perk) {
      const scanned=row.scanned?.rows[perk.index-1];
      const base=scanned?(scanned.base ?? window.DNStoredArtifacts.impliedRange(scanned)?.base):perk.base;
      if(!Number.isFinite(base))return '';
      const tiers=DN.text(row.hall)==='War'?[1,3,6]:[1,6,11];
      const tier=tiers.indexOf(Math.abs(base));
      return tier<0?'':' stat-tier-'+['white','green','blue'][tier];
    }

    const modeBtns =
      `<div class="mode-seg" role="group" aria-label="Contribution mode">` +
      `<button type="button" class="mode-btn${mode === "hall" ? " is-active" : ""}" data-action="mode" data-id="${DN.esc(id)}" data-mode="hall" title="All perks count (${capacity(grade)} slots)">${grade==='Legendary' || grade==='Mythical'?'Hall':'Exhibit'}</button>` +
      (crafted(row)?`<button type="button" class="mode-btn${mode==='unused'?' is-active':''}" data-action="mode" data-id="${DN.esc(id)}" data-mode="unused">Unused</button>`:
      `<button type="button" class="mode-btn${mode === "showcase" ? " is-active" : ""}" data-action="mode" data-id="${DN.esc(id)}" data-mode="showcase" title="One perk counts">Showcase</button>`)+
      (canHermitage
        ? `<button type="button" class="mode-btn${mode === "hermitage" ? " is-active" : ""}" data-action="mode" data-id="${DN.esc(id)}" data-mode="hermitage" title="Hermitage: all perks (1 slot)">Hermitage</button>`
        : "") +
      `</div>`;

    let perkHtml = "";
    if (!perks.length) {
      perkHtml = `<p class="card-empty">${DN.blankSpan("no perks")}</p>`;
    } else if (mode === "hall" || mode === "hermitage" || mode === "unused") {
      perkHtml =
        `<ul class="card-perks">` +
        perks
          .map((p) => {
            const steppers = canStepPerk(p, id)
              ? `<span class="lvl-btns">` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="-1" aria-label="Lower ${DN.esc(p.name)}">−</button>` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="1" aria-label="Raise ${DN.esc(p.name)}">+</button>` +
                `</span>`
              : "";
            return (
              `<li class="is-active-perk${tierClass(p)}">` +
              `${perkStar(id,p)}<span class="perk-name">${DN.esc(p.name || DN.BLANK)}</span>` +
              `<span class="perk-vals">${perkValueEditor(id, p)}${steppers}</span>` +
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
            const steppers = canStepPerk(p, id)
              ? `<span class="lvl-btns">` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="-1" aria-label="Lower ${DN.esc(p.name)}">−</button>` +
                `<button type="button" class="lvl-btn" data-action="lvl" data-id="${DN.esc(id)}" data-perk="${p.index}" data-dir="1" aria-label="Raise ${DN.esc(p.name)}">+</button>` +
                `</span>`
              : "";
            return (
              `<li class="${selected ? "is-active-perk" : "is-dim"}${tierClass(p)}">` +
              `<label class="single-pick">` +
              `<input type="radio" name="single-${DN.esc(id)}" data-action="single-perk" data-id="${DN.esc(id)}" data-perk="${p.index}"${selected ? " checked" : ""} />` +
              `${perkStar(id,p)}<span class="perk-name">${DN.esc(p.name || DN.BLANK)}</span>` +
              `</label>` +
              `<span class="perk-vals">${perkValueEditor(id, p)}${steppers}</span>` +
              `</li>`
            );
          })
          .join("") +
        `</ul>`;
    }

    const thumb = artworkThumb(id,DN.show(row.name),"entity-thumb--collection");
    return (
      `<article class="artifact-card mode-${mode}" data-artifact-id="${DN.esc(id)}">` +
      `<div class="card-thumb">${thumb}</div>` +
      `<div class="card-body">` +
      `<header class="card-head">` +
      `<div class="card-title">` +
      `<span class="card-name">${DN.esc(DN.show(row.name))}</span>` +
      `<span class="card-meta">${DN.esc(grade)} · ${DN.esc(DN.show(row.hall))} · <span class="slot-badge slot-badge--${mode}">${DN.esc(slot)}</span></span>` +
      `</div>${modeBtns}</header>${perkHtml}`+(detail?'':`<button type="button" class="btn" data-action="inspect" data-id="${DN.esc(id)}">Compare</button> `)+`<button type="button" class="btn artifact-delete" data-action="delete" data-id="${DN.esc(id)}" aria-label="Delete ${DN.esc(DN.show(row.name))}">Delete</button></div></article>`
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
      inspectAction = "tile-inspect",
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
      const thumb = artworkThumb(id,name,"entity-thumb--museum");
      return (
        `<button type="button" class="museum-tile is-filled${highlightedId===id?' is-highlighted':''}" data-action="${inspectAction}" data-id="${DN.esc(id)}" title="${inspectAction === 'inspect' ? 'Inspect artifact' : 'Inspect and choose a replacement'}">` +
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
    const thumb = artworkThumb(id,DN.show(row.name),"entity-thumb--museum");
    const perkOpts = perks
      .map((p) => {
        const selected = p.index === singleIdx ? " selected" : "";
        const v = displayPerkValue(id, p);
        const valLabel =
          v == null || !Number.isFinite(v)
            ? ""
            : ` (${DN.formatPerkValue(p.name,v)})`;
        const name = p.name || "Perk " + p.index;
        return `<option value="${p.index}"${selected}>${DN.esc(name + valLabel)}</option>`;
      })
      .join("");
    return (
      `<div class="museum-tile is-showcase" data-artifact-id="${DN.esc(id)}" data-action="inspect" data-id="${DN.esc(id)}" tabindex="0" role="button">` +
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
    const hermGroup = `<div class="museum-section"><h3 class="museum-section-title">Hermitage</h3><div class="museum-row">${hermTile}</div></div>`;

    const typeGroups = typeExhibits
      .map((ex) => {
        let tiles = "";
        for (let i = 0; i < ex.count; i++) {
          tiles += tileHtml({
            filled:!!mainsOfGrade(exhibitGrade(ex))[i],
            id:mainsOfGrade(exhibitGrade(ex))[i] || null,
            emptyAction:'slot-hall',
            emptyGrade:exhibitGrade(ex),
            label: `${ex.label} ${i + 1}`,
          });
        }
        return (
          `<div class="museum-section">` +
          `<h3 class="museum-section-title">${DN.esc(ex.label)}</h3>` +
          `<div class="museum-row museum-row--4">${tiles}</div>` +
          `</div>` +
          (ex.key.replace(/^war-/, '') === 'armor' ? hermGroup : '')
        );
      })
      .join("");

    const showcaseRows = ownedForHall().filter((row) => modeOf(DN.artifactKey(row)) === "showcase");
    const unusedRows=ownedForHall().filter(row=>modeOf(DN.artifactKey(row))==='unused');
    const showcaseHtml = showcaseRows.length
      ? `<div class="museum-showcase-grid">${showcaseRows.map(renderShowcaseTile).join("")}</div>`
      : `<p class="collection-empty">No Showcase artifacts.</p>`;

    el.board.innerHTML =
      `<div class="museum-section">` +
      `<h3 class="museum-section-title">Mythical Hall</h3>` +
      `<div class="museum-row">${mythTiles}</div>` +
      `</div>` +
      `<div class="museum-section">` +
      `<h3 class="museum-section-title">Legendary Hall</h3>` +
      `<div class="museum-row">${legTiles}</div>` +
      `</div>` +
      `<div class="museum-type-exhibits">${typeGroups}</div>` +
      `<div class="museum-section">` +
      `<h3 class="museum-section-title">Showcase</h3>` +
      showcaseHtml +
      `</div>` +
      (unusedRows.length?'<div class="museum-section museum-unused"><h3 class="museum-section-title">Unused</h3><div class="museum-row">'+unusedRows.map(row => tileHtml({filled:true,id:DN.artifactKey(row),label:'Unused',inspectAction:'inspect'})).join('')+'</div></div>':'');
    layoutBoardGroups();
  }

  function layoutBoardGroups() {
    const width=el.board.clientWidth;if(!width)return;
    // Seven equal spaces: each group gets one per tile, with one empty space between groups.
    const gap=9,columns=Math.min(7,Math.max(1,Math.floor((width+gap)/(125+gap))));
    el.board.style.gridTemplateColumns='repeat('+columns+', minmax(0, 1fr))';
    let nextColumn=1;
    for(const group of el.board.querySelectorAll('.museum-section')) {
      const row=group.querySelector('.museum-row, .museum-showcase-grid');
      const count=row?.querySelectorAll('.museum-tile').length || 1,span=Math.min(count,columns);
      let start=nextColumn===1?1:nextColumn+1;
      if(start+span-1>columns)start=1;
      group.style.gridColumn=start+' / span '+span;
      if(row)row.style.gridTemplateColumns='repeat('+span+', minmax(0, 1fr))';
      nextColumn=start+span;
      if(nextColumn>columns)nextColumn=1;
    }
  }

  function render() {
    const activeId=DN.activeStrategyId();
    if(activeId!==lastActiveStrategyId){lastActiveStrategyId=activeId;detailStrategyId=activeId;closePicker();}
    if(highlightedId && byId[highlightedId]?.hall!==ui.hall)highlightedId=null;
    syncControls();
    const owned = ownedForHall();
    rebuildStrategyMetrics(owned);
    const strategySelect=document.getElementById('collection-strategy-filter');
    strategySelect.innerHTML='<option value="all">All artifacts</option><option value="any">Top 2 in any compared strategy</option><option value="every">Top 2 in every compared strategy</option><option value="outside">Outside Top 2 in all compared strategies</option><option value="unused">Unused across all strategies</option><option value="incomplete">Incomplete / uncertain</option>'+DN.loadStrategies().strategies.filter(strategy=>!strategy.archived).map(strategy=>'<option value="assigned:'+DN.esc(strategy.id)+'">Assigned in '+DN.esc(strategy.name)+'</option>').join('');
    strategySelect.value=strategyFilter;
    const structured = ui.viewMode === "structured";
    document.getElementById('collection-list-toolbar').hidden=structured;
    el.list.hidden = structured;
    el.board.hidden = !structured;
    el.workspace.hidden=!structured;

    if (!structured) {
      const types=[...new Set([...listTypeOrder(),...owned.map(row=>DN.text(row.grade))])];
      document.getElementById('collection-slot-filter-options').innerHTML=types.map(type=>'<label><input type="checkbox" value="'+DN.esc(type)+'"'+(listSlotTypes===null || listSlotTypes.includes(type)?' checked':'')+' />'+DN.esc(type)+'</label>').join('');
      document.getElementById('collection-slot-filter-label').textContent=listSlotTypes===null?'All':types.filter(type=>listSlotTypes.includes(type)).length+' selected';
      const filtered=owned.filter(row=>(listSlotTypes===null || listSlotTypes.includes(DN.text(row.grade))) && matchesStrategyFilter(row));
      if (!collected.size) {
        el.list.innerHTML =
          `<p class="collection-empty">No owned artifacts</p>`;
      } else if (!owned.length) {
        el.list.innerHTML = `<p class="collection-empty">Nothing owned in ${DN.esc(ui.hall)} hall.</p>`;
      } else {
        el.list.innerHTML = filtered.length?renderArtifactTable(filtered):'<p class="collection-empty">No artifacts match the selected slot types.</p>';
      }
    } else {
      renderBoard();
    }

    renderDetail();
    if(pickerTarget)openPicker(pickerTarget.kind,pickerTarget.grade,pickerTarget.replacing,false);
  }

  function bind() {
    const refresh=async()=>{
      const sequence=++refreshSequence;
      try {
        const key=window.DNStoredArtifacts.collectionKey(),[scans,artwork]=await Promise.all([window.DNStoredArtifacts.read(key),window.DNStoredArtifacts.readCatalogArtwork(key)]);
        if(sequence!==refreshSequence || key!==window.DNStoredArtifacts.collectionKey())return;
        personalImages=artwork;applyScans(scans);
        loadout=DN.loadLoadout();levels=DN.loadLevels();
        render();
      } catch {showError('Could not refresh your shared inventory. Reload to try again.');}
    };
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',refresh);
    window.addEventListener('dn-strategies-changed',refresh);
    window.addEventListener('dn-artifacts-changed',refresh);
    document.getElementById('collection-strategy-filter').addEventListener('change',event=>{strategyFilter=event.target.value;render();});
    document.getElementById('collection-strategy-metric').addEventListener('change',event=>{strategyMetric=event.target.value;render();});
    document.getElementById('collection-strategy-summary').addEventListener('click',event=>{
      const button=event.target.closest('[data-detail-strategy]');if(!button)return;
      detailStrategyId=button.dataset.detailStrategy;renderComparison();
    });
    const filter=document.getElementById('collection-slot-filter');
    filter.addEventListener('change',event=>{
      if(!event.target.matches('input[type="checkbox"]'))return;
      const value=event.target.value;
      listSlotTypes=Array.from(filter.querySelectorAll('input:checked')).map(input=>input.value);
      render();Array.from(filter.querySelectorAll('input')).find(input=>input.value===value)?.focus();
    });
    filter.addEventListener('click',event=>{
      const action=event.target.closest('[data-filter-action]')?.dataset.filterAction;
      if(!action)return;
      listSlotTypes=action==='all'?null:[];render();
    });
    el.detail.addEventListener('submit',event=>{event.preventDefault();savePerkEditor(event.target);});
    el.detail.addEventListener('input',event=>{if(event.target.matches('input,select'))for(const input of el.detail.querySelectorAll('input,select'))input.setCustomValidity('');});
    el.detail.addEventListener('change',event=>{
      if(!event.target.matches('[name="tier"]') || !event.target.value || event.target.value==='recorded')return;
      const field=event.target.closest('.artifact-perk-edit-row'),value=field.querySelector('[name="value"]'),level=field.querySelector('[name="level"]');
      const upgrade=Number(level.value),magnitude=Number(event.target.value);
      if(level.value && Number.isInteger(upgrade) && upgrade>=1 && upgrade<=10){
        const scanned=byId[highlightedId]?.scanned?.rows[Number(field.dataset.index)-1];
        const sign=Math.sign(Number(value.value) || scanned?.base || scanned?.value || 1);
        value.value=String(sign*(magnitude+upgrade-1));
      }
      for(const input of el.detail.querySelectorAll('input,select'))input.setCustomValidity('');
    });
    el.detail.addEventListener('click',event=>{if(event.target.closest('[data-action="edit-cancel"]'))renderDetail();});
    if(window.ResizeObserver) {
      let boardWidth=0;
      new ResizeObserver(()=>{if(el.board.clientWidth!==boardWidth){boardWidth=el.board.clientWidth;layoutBoardGroups();}}).observe(el.board);
    } else window.addEventListener('resize',layoutBoardGroups);
    el.compareItem.addEventListener('change',()=>{comparedId=el.compareItem.value;renderComparison();});
    el.compareSwap.addEventListener('click',()=>{
      if(detailStrategyId!==DN.activeStrategyId())return;
      const selected=byId[highlightedId],mode=modeOf(highlightedId);
      if(!selected || !['hall','hermitage'].includes(mode) || !comparisonCandidates(selected).some(row=>DN.artifactKey(row)===comparedId))return;
      pickerTarget={kind:mode==='hermitage'?'hermitage':'hall',grade:selected.grade,replacing:highlightedId};
      swapIntoSlot(comparedId);
    });
    for (const [button, mode] of [[el.compareUnlocked, 'unlocked'], [el.compareAll, 'all']]) {
      button.addEventListener('click', () => {
        ui.compareRows = mode;
        DN.saveCollectionUi(ui);
        renderComparison();
        if(pickerTarget)openPicker(pickerTarget.kind,pickerTarget.grade,pickerTarget.replacing);
      });
    }
    for(const id of ['header-off','header-def'])document.getElementById(id).addEventListener('click',render);
    for (const container of [el.list, el.board, el.detail]) {
      container.addEventListener('change', event => {
        if (event.target.matches('[data-action="perk-value"]')) editPerkValue(event.target);
      });
      container.addEventListener('input', event => {
        if (event.target.matches('[data-action="perk-value"]')) event.target.setCustomValidity('');
      });
    }
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

    el.list.addEventListener("click", (ev) => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const btn = t.closest("[data-action]");
      if (!btn) {const card=t.closest('[data-artifact-id]');if(card){highlightedId=card.getAttribute('data-artifact-id');closePicker();renderDetail();}return;}
      const action = btn.getAttribute("data-action");
      if(action==='list-sort') {
        const key=btn.dataset.sort;
        listSort={key,direction:listSort.key===key && listSort.direction==='ascending'?'descending':listSort.key===key?'ascending':['name','type','slot'].includes(key) || key.startsWith('strategy-rank:')?'ascending':'descending'};
        render();el.list.querySelector('[data-sort="'+key+'"]')?.focus();return;
      }
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if(action==='delete'){deleteArtifact(id,btn);return;}
      if(action==='strategy-inspect'){detailStrategyId=btn.dataset.strategyId;highlightedId=id;closePicker();renderDetail();return;}
      if(action==='inspect'){highlightedId=id;closePicker();renderDetail();return;}

      if (action === "mode") {
        const mode = btn.getAttribute("data-mode");
        if (mode === "hall" || mode === "showcase" || mode === "hermitage" || mode==='unused') setMode(id, mode);
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
      if (!btn) {
        const card=t.closest('[data-artifact-id]');
        if(card){highlightedId=card.getAttribute('data-artifact-id');renderDetail();closePicker();}
        return;
      }
      const action = btn.getAttribute("data-action");
      if(action==='delete'){deleteArtifact(btn.getAttribute('data-id'),btn);return;}
      if(action==='mode') {
        setMode(btn.getAttribute('data-id'),btn.getAttribute('data-mode'));return;
      }
      if(action==='lvl') {
        bumpLevel(btn.getAttribute('data-id'),Number(btn.getAttribute('data-perk')),Number(btn.getAttribute('data-dir')));return;
      }
      if (action === "slot-hall") {
        const grade = btn.getAttribute("data-grade");
        if (!capacity(grade)) return;
        if (mainsOfGrade(grade).length >= capacity(grade)) {
          showError(`${grade} slots full (${capacity(grade)}/${capacity(grade)}). Clear a tile first.`);
          return;
        }
        openPicker("hall", grade);
        return;
      }
      if (action === "slot-hermitage") {
        openPicker("hermitage");
        return;
      }
      if (action === "tile-inspect") {
        const id = btn.getAttribute("data-id");
        const row=byId[id];
        if(row){highlightedId=id;closePicker();renderBoard();renderDetail();}
      }
      if(action==='inspect') {
        highlightedId=btn.getAttribute('data-id');renderDetail();closePicker();
      }
    });

    el.board.addEventListener("change", (ev) => {
      const sel = ev.target;
      if(sel instanceof HTMLInputElement && sel.getAttribute('data-action')==='single-perk') {
        setSinglePerk(sel.getAttribute('data-id'),Number(sel.getAttribute('data-perk')));return;
      }
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
        swapIntoSlot(id);
      }
    });
    el.detail.addEventListener('click',event=>{
      const button=event.target.closest('[data-action]');if(!button)return;
      const id=button.getAttribute('data-id');
      if(button.getAttribute('data-action')==='delete')deleteArtifact(id,button);
      if(button.getAttribute('data-action')==='lvl')bumpLevel(id,Number(button.getAttribute('data-perk')),Number(button.getAttribute('data-dir')));
    });
    function clearHighlight() {
      if(!highlightedId && !pickerTarget)return;
      highlightedId=null;closePicker();renderDetail();
      if(ui.viewMode==='structured')renderBoard();
    }
    document.addEventListener('click',event=>{
      if(event.target.closest('.artifact-card, .museum-tile, .collection-summary, .collection-list-toolbar, .collection-stat-sort-menu, #slot-picker, button, a, input, select, label'))return;
      clearHighlight();
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && !document.getElementById('collection-delete-dialog').open)clearHighlight();});
  }

  async function load() {
    try {
      await DN.scannerLog.ready;
      const [artRes, mapRes, imgRes,ratingsRes] = await Promise.all([
        fetch(DATA_URL),
        fetch(MAPPING_URL),
        fetch(IMAGES_URL),
        fetch('./data/perk_rating_defaults.json'),
      ]);
      if (!artRes.ok) throw new Error(`HTTP ${artRes.status} loading ${DATA_URL}`);
      const data = await artRes.json();
      if (!Array.isArray(data)) throw new Error("artifacts.json is not an array");
      catalogRows = data.filter((row) => row.artifact_id !== "leftwich-trophy-legendary");
      rows = [...catalogRows];
      byId = {};
      for (const row of rows) {
        byId[DN.artifactKey(row)] = row;
      }

      let perkCanon = {};
      if (mapRes.ok) perkCanon = DN.parseMappingCsv(await mapRes.text());
      canonPerk = DN.makeCanonPerk(perkCanon);
      artifactImages = imgRes.ok ? DN.imageUrlMap(await imgRes.json()) : {};
      catalogImages={...artifactImages};
      factoryRatings=ratingsRes.ok?await ratingsRes.json():{};

      collected = DN.loadCollected();
      try {
        const linked=await window.DNStoredArtifacts.reconcileCatalog(catalogRows);
        personalImages=await window.DNStoredArtifacts.readCatalogArtwork(linked.profileKey);
        applyScans(linked.collection);
      } catch {showError('Could not load scanned artifacts from browser storage. Reload to try again.');}
      loadout = DN.loadLoadout();
      levels = DN.loadLevels();
      let changedLevels=false;
      for(const row of rows) {
        const revision=row.scanned && (Date.parse(row.scanned.updatedAt || row.scanned.capturedAt) || 0);
        const id=DN.artifactKey(row);
        if(row.scanned && levels[id] && levels[id]._scanRevision!==revision) {
          delete levels[id];changedLevels=true;
        }
      }
      if(changedLevels)DN.saveLevels(levels);
      ui = DN.loadCollectionUi();
      ui.valueMode='actual';
      if (!ui.viewMode) ui.viewMode = "structured";

      for (const hall of ["Main", "War"]) {
        const h = loadout[hall];
        h.mains = h.mains.filter((id) => collected.has(id) && byId[id]);
        for (const id of Object.keys(h.singles)) {
          if (!collected.has(id) || !byId[id] || crafted(byId[id])) delete h.singles[id];
        }
        if (h.hermitage && (!collected.has(h.hermitage) || !byId[h.hermitage])) {
          h.hermitage = null;
        }
      }
      enforceHallCaps();
      placeScannedArtifacts();
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
