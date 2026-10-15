/* Authority: User rule 2026-10-11: all Invading effects negative; one sign per stat.
 * Ownership: Read-only audit of original OCR captures and canonical artifact data.
 * Invariants: Preserve raw text and values; no missing-sign repairs or catalogue additions.
 * Constraints: Alias/spelling normalisation groups evidence, not name verification.
 * History: Audits all three user-supplied scanner batches and records residual issues. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(file, 'utf8');
const context = {window: {}, localStorage: {getItem: () => null, setItem() {}, removeItem() {}}};
vm.createContext(context);
for (const file of ['ui/data/army_catalog.js', 'ui/shared.js']) vm.runInContext(read(path.join(root, file)), context);
const DN = context.window.DN;
const canon = DN.makeCanonPerk(DN.parseMappingCsv(read(path.join(root, 'data/perk_name_mapping.csv'))));
const confusions = {hitpomts:'hitpoints',hitpomnts:'hitpoints',guernlla:'guerrilla',tactucal:'tactical',hehcopter:'helicopter',siper:'sniper',sper:'sniper',mache:'machine',oll:'oil',qil:'oil',o1l:'oil',ant:'anti'};
function identity(name) {
  return canon(name).replace(/[”‘’']/g, '').replace(/[-–—]/g, ' ').toLowerCase().split(/\s+/)
    .map(token => confusions[token] || token).join(' ').trim();
}
const supplied = process.argv.slice(2);
const capturePaths = supplied.length ? supplied : ['', ' (1)', ' (2)'].map(suffix =>
  `C:/Users/edwar/Downloads/artifact-perk-observations-2026-10-11${suffix}.json`);
const capturedSigns = new Map(), violations = [], missingInvading = [], files = [];
let rows = 0, numericRows = 0;
for (const file of capturePaths) {
  const source = JSON.parse(read(file));
  files.push({path:file, scans:source.scans.length, exported_at:source.exportedAt});
  for (const scan of source.scans) for (const pass of scan.observations) for (const row of pass.rows) {
    rows++;
    const name = identity(row.name), expected = DN.expectedPerkSign(canon(row.name));
    const record = {file, timestamp:scan.timestamp, raw:row.raw, name:row.name, grouped_name:name, value:row.value};
    if (row.value === null || !Number.isFinite(row.value)) {
      if (/^invading\b/.test(name)) missingInvading.push(record);
      continue;
    }
    numericRows++;
    if (!capturedSigns.has(name)) capturedSigns.set(name, new Set());
    capturedSigns.get(name).add(Math.sign(row.value));
    if ((/^invading\b/.test(name) && row.value >= 0) || (expected !== null && Math.sign(row.value) !== expected)) violations.push(record);
  }
}
const artifactSigns = new Map(), artifactViolations = [];
const artifacts = JSON.parse(read(path.join(root, 'data/artifacts.json')));
for (const artifact of artifacts) for (let i=1; i<=6; i++) {
  const name = canon(artifact[`perk_${i}_name`]);
  if (!name) continue;
  const expected = DN.expectedPerkSign(name);
  for (const suffix of ['base','max']) {
    const raw = artifact[`perk_${i}_${suffix}`];
    if (raw === '' || raw == null || !Number.isFinite(Number(raw))) continue;
    const value = Number(raw);
    if (!artifactSigns.has(name)) artifactSigns.set(name, new Set());
    artifactSigns.get(name).add(Math.sign(value));
    if (expected !== null && Math.sign(value) !== expected) artifactViolations.push({artifact_id:artifact.artifact_id, name, suffix, value});
  }
}
const mixed = bag => [...bag].filter(([,signs]) => signs.has(-1) && signs.has(1)).map(([name]) => name);
const report = {authority:'User fixed-sign rule 2026-10-11', files, captured_rows:rows, numeric_rows:numericRows,
  captured_sign_violations:violations, captured_mixed_sign_stats:mixed(capturedSigns),
  unresolved_invading_rows:missingInvading, artifact_count:artifacts.length,
  artifact_sign_violations:artifactViolations, artifact_mixed_sign_stats:mixed(artifactSigns),
  raw_exports_modified:false};
fs.writeFileSync(path.join(root, 'reports/artifact-sign-audit-2026-10-11.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({capturedRows:rows,numericRows,signViolations:violations.length,mixedCaptureStats:report.captured_mixed_sign_stats.length,
  missingInvadingSigns:missingInvading.length,artifactSignViolations:artifactViolations.length,mixedArtifactStats:report.artifact_mixed_sign_stats.length}));
if (violations.length || report.captured_mixed_sign_stats.length || artifactViolations.length || report.artifact_mixed_sign_stats.length) process.exitCode=1;
