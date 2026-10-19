/* Descriptive encounter frequencies. Complete reads may be a biased sample;
 * inferred percentages and repeated encounters cannot establish game odds. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const numeric = row => Number.isFinite(row.value) && [1, 6, 11].includes(Math.abs(row.value));
const direct = row => numeric(row) && row.hasPercent !== false && !row.inferred && !row.inferredFields?.includes('value') &&
  !row.estimated && !row.conflict && !row.tierConflict && !row.outOfRange;
function summarize(items, accept) {
  const selected = items.filter(item => item.rows.length === 5 && item.rows.every(accept));
  const counts = Array(6).fill(0);
  for (const item of selected) counts[item.rows.filter(row => Math.abs(row.value) === 11).length]++;
  return {sample: selected.length, excluded: items.length - selected.length, exactly: counts.map((count, rolls) => ({
    rolls, count, percent: selected.length ? 100 * count / selected.length : null,
    atLeastCount: counts.slice(rolls).reduce((sum, value) => sum + value, 0),
    atLeastPercent: selected.length ? 100 * counts.slice(rolls).reduce((sum, value) => sum + value, 0) / selected.length : null,
  }))};
}
function analyze(data) {
  return {scope: 'Main Hall fresh-crafted item encounters; all five perks including locked perks. Signed +11% and -11% both count.',
    limits: ['Empirical frequencies; unknown game probabilities.', 'Scanner records are unverified and encounters may repeat physical items.',
      'Direct-only results exclude all inferred percentages and recorded row conflicts; this exclusion may bias frequencies.',
      'Complete-numeric results include inferred percentages and provide a sensitivity comparison.', 'Zero observed outcomes do not establish impossibility.'],
    byType: Object.fromEntries(['Weapon', 'Armor', 'Jewelry', 'Pottery'].map(type => {
      const items = data.items.filter(item => item.freshCraft === true && item.hall === 'main' && item.type === type);
      return [type, {recorded: items.length, directOnly: summarize(items, direct), completeNumeric: summarize(items, numeric)}];
    }))};
}
if (require.main === module) {
  const input = process.argv.find(arg => arg.startsWith('--input='))?.slice(8);
  const output = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
  if (!input) throw Error('Use --input=EXPORT.json [--report=reports/NAME.json]');
  const raw = fs.readFileSync(input), data = JSON.parse(raw);
  if (data.version !== 2 || !Array.isArray(data.items)) throw Error('Expected a version-2 item export.');
  const report = {version: 1, source: {filename: path.basename(input), exportedAt: data.exportedAt,
    sha256: crypto.createHash('sha256').update(raw).digest('hex')}, ...analyze(data)};
  if (output) {
    const target = path.resolve(__dirname, '..', output);
    if (!target.startsWith(path.resolve(__dirname, '../reports') + path.sep) || path.extname(target) !== '.json') throw Error('Report must be JSON inside reports/.');
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
}
module.exports = {analyze};
