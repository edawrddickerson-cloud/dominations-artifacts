/* User-authorized sequential cleanup. Select one existing version per burst;
 * preserve its fields intact and retain the original diagnostic scan history. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const context = require('../ui/artifact-stat-context.js').create(require('../data/artifact_stat_context.json'));
const root = path.resolve(__dirname, '..');
const normalize = value => String(value || '').trim().toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ');
const nameOf = row => normalize(context.lookup(row?.name)?.name || row?.name);
function matchingRows(a, b) {
  if (a.hall !== b.hall || a.type && b.type && a.type !== b.type ||
      a.profileKey && b.profileKey && a.profileKey !== b.profileKey) return 0;
  return a.rows.reduce((count, row, index) => {
    const other = b.rows[index];
    return count + Number(!!nameOf(row) && nameOf(row) === nameOf(other) && Number.isFinite(row.value) && row.value === other?.value);
  }, 0);
}
function versionKey(item) {
  return JSON.stringify([item.hall, item.type, item.unlocked?.count ?? null,
    item.rows.map(row => [nameOf(row), row.value ?? null])]);
}
const itemsDigest = items => crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
function deduplicate(data) {
  if (data.version !== 2 || !Array.isArray(data.items) || data.items.some(item => !Array.isArray(item.rows))) throw Error('Expected a version-2 item log.');
  // An unchanged cleaned sequence already has explicit burst decisions. Do not
  // reinterpret new adjacencies after their original context was removed.
  if (data.deduplication?.algorithm === 'sequential-bursts-v1' && data.deduplication.keptItemsSha256 === itemsDigest(data.items)) {
    return {cleaned: data, report: {summary: {before: data.items.length, after: data.items.length, removed: 0, bursts: 0},
      rules: data.deduplication.rules, bursts: [], alreadyCleaned: true}};
  }
  const items = [], bursts = [];
  let active = [];
  function flush() {
    if (!active.length) return;
    const variants = new Map();
    for (const member of active) {
      const key = versionKey(member.item), previous = variants.get(key);
      variants.set(key, {count: (previous?.count || 0) + 1, latest: member});
    }
    const winner = [...variants.values()].sort((a, b) => b.count - a.count || b.latest.index - a.latest.index)[0];
    items.push(winner.latest.item);
    if (active.length > 1) {
      const pairs = active.flatMap((member, index) => active.slice(index + 1).map(other => matchingRows(member.item, other.item)));
      bursts.push({sourceItems: active.map(member => member.index + 1), keptSourceItem: winner.latest.index + 1,
        keptId: winner.latest.item.id, removedIds: active.filter(member => member !== winner.latest).map(member => member.item.id),
        minMatchingRows: Math.min(...pairs), variantCount: variants.size, winningVersionOccurrences: winner.count,
        reason: winner.count > 1 ? 'Most repeated version; last occurrence wins ties.' : 'Last version; no version repeats.',
        versions: active.map(member => ({sourceItem: member.index + 1, id: member.item.id, firstSeen: member.item.firstSeen,
          type: member.item.type, unlockedCount: member.item.unlocked?.count ?? null,
          rows: member.item.rows.map(row => ({name: row.name, value: row.value ?? null}))}))});
    }
    active = [];
  }
  for (const [index, item] of data.items.entries()) {
    const previous = active.at(-1)?.item;
    const gap = previous ? Date.parse(item.firstSeen) - Date.parse(previous.lastUpdated || previous.firstSeen) : NaN;
    // Every member must agree on at least three named percentage rows. This
    // prevents a chain of changing partial reads from absorbing a new item.
    if (previous && (!Number.isFinite(gap) || gap < -30000 || gap > 600000 ||
        !active.every(member => matchingRows(member.item, item) >= 3))) flush();
    active.push({index, item});
  }
  flush();
  const summary = {before: data.items.length, after: items.length, removed: data.items.length - items.length, bursts: bursts.length};
  const rules = {scope: 'Consecutive item entries only; diagnostic scans and label summaries retained.',
    minimumMatchingNameAndValueRows: 3, everyPairMustMatch: true, maximumAdjacentGapSeconds: 600,
    maximumOverlapSeconds: 30, context: 'Same Hall; known types and profile keys must agree.',
    selection: 'Most repeated canonical names, percentages and unlocked-count version; latest occurrence breaks ties.',
    fieldMerging: false, limits: 'Heuristic identity cleanup under the user assumption; matching records can still represent different physical items.'};
  return {cleaned: {...data, items, notes: (data.notes || '') + ' Sequential duplicates removed under the user assumption; see deduplication metadata.',
    deduplication: {algorithm: 'sequential-bursts-v1', keptItemsSha256: itemsDigest(items), summary, rules}}, report: {summary, rules, bursts}};
}
if (require.main === module) {
  const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
  const input = option('input'), output = option('output'), reportFile = option('report');
  if (!input || !output || !reportFile) throw Error('Use --input=EXPORT.json --output=data/temp/CLEANED.json --report=reports/AUDIT.json');
  const target = path.resolve(root, output), auditTarget = path.resolve(root, reportFile);
  if (!target.startsWith(path.join(root, 'data', 'temp') + path.sep) || path.extname(target) !== '.json' ||
      !auditTarget.startsWith(path.join(root, 'reports') + path.sep) || path.extname(auditTarget) !== '.json') throw Error('Cleaned export must be in data/temp; audit must be in reports.');
  if (target === path.resolve(input)) throw Error('The original export must be preserved.');
  const raw = fs.readFileSync(input), source = {filename: path.basename(input), bytes: raw.length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex')};
  const {cleaned, report} = deduplicate(JSON.parse(raw));
  cleaned.deduplication.source = source;
  fs.writeFileSync(target, JSON.stringify(cleaned, null, 2) + '\n');
  const written = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (written.items.length !== report.summary.after || new Set(written.items.map(item => item.id)).size !== written.items.length) throw Error('Cleaned item verification failed.');
  const repeated = deduplicate(written);
  if (repeated.report.summary.removed) throw Error('Cleanup is not stable on a second pass.');
  fs.writeFileSync(auditTarget, JSON.stringify({version: 1, source, output: output.replace(/\\/g, '/'), ...report}, null, 2) + '\n');
  console.log(JSON.stringify({cleaned: target, audit: auditTarget, ...report.summary}, null, 2));
}
module.exports = {deduplicate, matchingRows};
