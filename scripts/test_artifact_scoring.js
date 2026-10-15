/*
 * Authority: Phase 3 must preserve the existing rating algorithm exactly.
 * Ownership: Standalone parity test; frozen pre-extraction app.js functions below.
 * Invariants: Compare complete score objects for every catalogue row and mode/axis.
 * History: Snapshot taken before replacing app.js functions with shared delegates.
 */
  function text(v) {
    if (v == null) return "";
    return String(v).trim();
  }
  /** Parse a perk base/max field to a finite number, or null. */
  function parseStatNum(v) {
    const raw = text(v).replace(/,/g, "").replace(/%/g, "");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Strongest available magnitude among base/max (absolute value).
   * Missing side is ignored; both missing → 0.
   */
  function perkMagnitude(base, max) {
    const nums = [parseStatNum(base), parseStatNum(max)].filter((n) => n != null);
    if (!nums.length) return 0;
    return Math.max(...nums.map((n) => Math.abs(/** @type {number} */ (n))));
  }

  /**
   * @typedef {{
   *   index: number,
   *   name: string,
   *   base: string,
   *   max: string,
   *   mag: number,
   *   offRating: number,
   *   defRating: number,
   *   offensive: number,
   *   defensive: number
   * }} PerkLineScore
   */

  /** @returns {PerkLineScore[]} */
  function perkLinesOf(row) {
    /** @type {PerkLineScore[]} */
    const lines = [];
    for (let i = 1; i <= 6; i++) {
      const rawName = text(row[`perk_${i}_name`]);
      const name = canonPerk(rawName);
      const base = text(row[`perk_${i}_base`]);
      const max = text(row[`perk_${i}_max`]);
      if (!rawName && !base && !max) continue;
      const mag = perkMagnitude(base, max);
      const offRating = name ? ratingOf(name, "offensive") : 0;
      const defRating = name ? ratingOf(name, "defensive") : 0;
      lines.push({
        index: lines.length,
        name,
        base,
        max,
        mag,
        offRating,
        defRating,
        offensive: offRating * mag,
        defensive: defRating * mag,
      });
    }
    return lines;
  }

  /** Active-axis line score for Best-line selection. */
  function lineActiveScore(line) {
    let sum = 0;
    if (prefSortAxes.offensive) sum += line.offensive;
    if (prefSortAxes.defensive) sum += line.defensive;
    return sum;
  }

  /**
   * @returns {{
   *   lines: PerkLineScore[],
   *   bestIndex: number,
   *   offensive: number,
   *   defensive: number,
   *   preference: number
   * }}
   */
  function artifactScores(row) {
    const lines = perkLinesOf(row);
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'ui', name), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('artifact-scoring.js'), context);
const scorer = context.window.DNArtifactScoring;
const factory = JSON.parse(read('data/perk_rating_defaults.json'));
const mapping = Object.fromEntries(read('data/perk_name_mapping.csv').trim().split(/\r?\n/).slice(1).map(line => line.split(',')));
const canonPerk = name => (mapping[text(name)] || text(name)).replace(/(?:Hitpoints\s+and\s+Damage|Damage\s+and\s+Hitpoints)/gi, 'Hitpoints & Damage');
let scoreMode, prefSortAxes, ratingBag;
const ratingOf = (name, axis) => ratingBag[name]?.[axis] ?? 0;
const catalogue = JSON.parse(read('data/artifacts.json'));
const special = [
  {},
  { perk_1_name: 'Heavy Tank Damage', perk_1_base: '-1,200%', perk_1_max: '15%', perk_3_name: 'Bomber Damage', perk_3_base: 'bad', perk_3_max: 'Infinity', perk_4_base: 5 },
  { perk_1_name: 'Heavy Tank Damage', perk_1_base: 10, perk_2_name: 'Bomber Damage', perk_2_base: -10 },
];
const allNames = [...new Set([...Object.keys(factory), 'Heavy Tank Damage', 'Bomber Damage'])];
const bags = [factory, Object.fromEntries(allNames.map(name => [name, { offensive: -2, defensive: -3 }])),
  Object.fromEntries(allNames.map((name, i) => [name, { offensive: i % 11 - 5, defensive: (i * 3) % 11 - 5 }])), {}];
let checked = 0;
for (ratingBag of bags) for (scoreMode of ['combined', 'maxrow']) for (prefSortAxes of [
  { offensive: true, defensive: false }, { offensive: false, defensive: true }, { offensive: true, defensive: true },
]) for (const row of [...catalogue, ...special]) {
  const options = { canonPerk, ratingOf, scoreMode, prefSortAxes };
  assert.deepEqual(structuredClone(scorer.score(row, options)), artifactScores(row), `${row.artifact_id || 'edge'} ${scoreMode} score parity`);
  assert.deepEqual(structuredClone(scorer.perkLines(row, options)), perkLinesOf(row), 'line parity');
  checked++;
}
ratingBag = { 'Heavy Tank Damage': { offensive: -2, defensive: -3 }, 'Bomber Damage': { offensive: -2, defensive: -3 } };
scoreMode = 'maxrow'; prefSortAxes = { offensive: true, defensive: true };
const tie = scorer.score(special[2], { canonPerk, ratingOf, scoreMode, prefSortAxes });
assert.equal(tie.bestIndex, 0, 'negative tie retains earliest line');
assert.equal(tie.offensive, -20); assert.equal(tie.defensive, -30);
assert.equal(perkMagnitude('-1,200%', '15%'), 1200);
assert.equal(perkMagnitude('bad', null), 0);
assert.match(read('app.js'), /DNArtifactScoring\.score\(row, \{ canonPerk, ratingOf, scoreMode, prefSortAxes \}\)/);
console.log(`Artifact scorer parity passed for ${checked} catalogue/edge configurations.`);

