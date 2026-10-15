/* Authority: 23 user-confirmed Multiplayer stats plus later approved stat names.
 * Ownership: Catalogue integration, mode provenance, and scanner acceptance checks.
 * Invariants: War availability stays unknown; names preserve Enemy/Invading;
 * OCR still requires readable signed values; upgraded values are not tier-gated.
 * History: Covers catalogue gaps in the 2026-10-11 and 2026-10-12 scanner exports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const db = JSON.parse(read('data/possible_artifact_stats.json'));
const factory = JSON.parse(read('data/perk_rating_defaults.json'));
const army = JSON.parse(read('data/army_catalog.json'));
for (const file of ['possible_artifact_stats.json', 'perk_rating_defaults.json', 'perk_name_mapping.csv']) {
  assert.equal(read('ui/data/' + file), read('data/' + file), 'Browser data must match canonical data: ' + file);
}
const stored = new Map();
const context = {window: {}, localStorage: {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: key => stored.delete(key),
}};
vm.createContext(context);
for (const file of ['ui/data/army_catalog.js', 'ui/shared.js', 'ui/scanner-recognition.js']) {
  vm.runInContext(read(file), context);
}
const DN = context.window.DN;
const parse = context.window.DNScannerRecognition.parseText;
const mapping = DN.parseMappingCsv(read('ui/data/perk_name_mapping.csv'));
const canon = DN.makeCanonPerk(mapping);
const names = Object.keys(factory);
const classified = DN.PERK_GROUPS.flatMap(group => group.perks.map(perk => ({...perk, group: group.id})));
assert.equal(db.stats.length, 39);
assert.equal(new Set(db.stats.map(stat => stat.stat_id)).size, 39);
assert.equal(db.stats.filter(stat => stat.evidence.source === 'scanner-export-2026-10-11').length, 24);
assert.equal(db.stats.filter(stat => stat.evidence.source === 'scanner-export-2026-10-11-batch2').length, 9);
assert.equal(db.stats.filter(stat => stat.evidence.source === 'scanner-export-2026-10-12').length, 3);
for (const stat of db.stats) {
  const name = stat.canonical_name;
  assert.equal(stat.active, true, name);
  const firstBatch = stat.evidence.source === 'scanner-export-2026-10-11' && name !== 'Invading Guerrilla Hitpoints';
  assert.equal(stat.verification_status, firstBatch ? 'user_confirmed' : 'user_approved_catalogue_entry', name);
  const nameOnly = ['Invading Attack Helicopter Damage','Invading Paratrooper Hitpoints'].includes(name);
  assert.equal(stat.availability.Multiplayer.status, nameOnly ? 'unknown' : firstBatch ? 'confirmed' : 'approved', name);
  assert.equal(stat.availability.Multiplayer.hall, 'Main', name);
  assert.equal(stat.availability.War.hall, 'War', name);
  assert.equal(stat.availability.War.status, 'unknown', name);
  assert.equal(stat.availability.War.evidence_source, null, name);
  assert.equal(Object.hasOwn(stat.availability.War, 'starting_values'), false, name);
  const values = [1, 6, 11].map(value => value * stat.expected_sign);
  if (nameOnly) {
    assert.equal(stat.observed_mode, null);
    assert.equal(stat.observed_sign, null);
    assert.equal(Object.hasOwn(stat.availability.Multiplayer, 'starting_values'), false);
    assert.deepEqual(stat.evidence.raw_samples, []);
  } else assert.deepEqual(stat.availability.Multiplayer.starting_values, values, name);
  assert.equal(mapping[name], name, name);
  assert(Number.isFinite(factory[name]?.offensive) && Number.isFinite(factory[name]?.defensive), 'Factory rating exists: '+name);
  if(name==='Invading Ranged Siege Damage')assert.deepEqual(factory[name], {offensive:0,defensive:1},name);
  if(name==='Invading Paratrooper Hitpoints')assert.deepEqual(factory[name], {offensive:0,defensive:0},name);
  const sections = classified.filter(perk => perk.name === name);
  assert.equal(sections.length, 1, name);
  assert.equal(sections[0].group, stat.suggested_rating_group, name);
  assert.equal(sections[0].kind, stat.stat_kind, name);
  const ownUnit = {'Supply Vehicle Hitpoints': 'Supply Vehicle', 'Tactical Helicopter Hitpoints': 'Tactical Helicopter'}[name];
  assert.deepEqual(army.perk_scopes[name], ownUnit
    ? {kind: 'unit', unit: ownUnit} : {kind: 'independent'}, name);
  for (const value of values) {
    const text = name + ' ' + (value > 0 ? '+' : '') + value + '%';
    const result = parse([text, ...Array(4).fill('Catapult Damage +1%')].join('\n'), names, canon, 5);
    assert.equal(result.valid, true, text);
    assert.equal(result.rows[0].name, name);
    assert.equal(result.rows[0].value, value);
  }
}
const panel = ['Enemy Sniper Tower Hitpoints -1%', 'Enemy Missile Silo Hitpoints -11%',
  'Supply Vehicle Hitpoints +1%', 'Enemy Air Defense Hitpoints -1%', 'Invading Raider Damage -1%'];
assert.equal(parse(panel.join('\n'), names, canon, 5).valid, true, 'Previously unknown complete panel is accepted');
assert.equal(parse(panel.slice(0, 4).join('\n'), names, canon, 5).valid, false, 'Partial panel still needs review');
assert.equal(parse(panel.join('\n').replace('-11%', '11%'), names, canon, 5).valid, false, 'Missing sign still needs review');
assert.equal(parse(panel.join('\n').replace('Enemy Missile Silo Hitpoints', 'Er tpoints'), names, canon, 5).valid, false, 'Clipped name still needs review');
assert.equal(parse(['Enemy Missile Silo Hitpoints -20%', ...Array(4).fill('Catapult Damage +1%')].join('\n'), names, canon, 5).valid, true, 'Upgraded values are not rejected by starting tiers');
assert.notEqual(canon('Enemy Missile Silo Hitpoints'), canon('Missile Silo Hitpoints'));
const secondPanel = ['Invading Ranged Infantry Damage -1%', 'Invading Ranged Siege Hitpoints -1%',
  'Invading Tactical Helicopter Hitpoints -1%', 'Invading Assault Vehicle Damage -6%', 'Invading Armored Car Hitpoints -6%'];
assert.equal(parse(secondPanel.join('\n'), names, canon, 5).valid, true, 'Second-batch names now recognised together');
assert.notEqual(canon('Enemy Redoubt Hitpoints'), canon('Redoubt Hitpoints'));
assert.notEqual(canon('Invading Tactical Helicopter Hitpoints'), canon('Tactical Helicopter Hitpoints'));
DN.savePerkGroupDefaults({'single:hp': {offensive: 4}, 'invading-single:hp': {defensive: 3}});
assert.equal(DN.loadGlobalPerkRatings()['Invading Paratrooper Hitpoints'].defensive, 3, 'New stat inherits Invading hitpoints group ratings');
assert.notEqual(canon('Invading Paratrooper Hitpoints'), canon('Paratrooper Hitpoints'), 'Invading qualifier remains distinct');
assert.equal(parse('Invading Paratrooper Hitpoints +6%',names,canon,1).valid,false,'Invading Paratrooper Hitpoints requires a negative value');
assert.equal(DN.loadGlobalPerkRatings()['Supply Vehicle Hitpoints'].offensive, 4);
assert.equal(DN.loadGlobalPerkRatings()['Invading APC Hitpoints'].defensive, 3);
DN.saveGlobalPerkRatings({'Invading APC Hitpoints': {defensive: 1}});
assert.equal(DN.loadGlobalPerkRatings()['Invading APC Hitpoints'].defensive, 1, 'Explicit exception wins');
assert.equal(db.pending_name_reviews.length, 0);
assert(db.resolved_name_reviews.some(review => review.proposed_name === 'Invading Guerrilla Hitpoints'
  && review.resolution_source === 'user_request_to_add_invading_guerrilla_hitpoints_2026-10-13'));
assert(db.resolved_name_reviews.some(review => review.proposed_name === 'Invading Raider Hitpoints'
  && review.resolution_source === 'scanner-export-2026-10-12'));
for (const pending of db.pending_name_reviews) {
  assert.equal(Object.hasOwn(factory, pending.proposed_name), false, 'Typo-only proposals remain pending');
  assert.equal(parse(pending.raw_samples[0], names, canon, 1).valid, false, 'No guessed OCR aliases');
}
assert.equal(db.tier_profiles.War.status, 'user_confirmed');
assert.deepEqual(db.tier_profiles.War.user_supplied_starting_magnitudes, [1,3,6], 'Preserve the user-corrected War tiers');
console.log('39 active stats and 117 signed variants recognised; mode evidence, rating inheritance, resolved name reviews, and strict OCR gates passed.');
