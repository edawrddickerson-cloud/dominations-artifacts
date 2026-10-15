const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const store = new Map();
const context = {
  window: {}, document: { getElementById: () => ({}) },
  localStorage: {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  },
};
vm.createContext(context);
for (const file of ['ui/data/army_catalog.js', 'ui/shared.js']) vm.runInContext(read(file), context);
const DN = context.window.DN;
const defaults = JSON.parse(read('ui/data/perk_rating_defaults.json'));
context.defaults = defaults;
const armySource = read('ui/army.js').replace(/  bind\(\);\s+load\(\);\s*\}\)\(\);\s*$/, `
  factoryDefaults = defaults;
  allPerkNames = Object.keys(defaults);
  window.testArmy = { buildUnusedUnitRows, zeroUnusedUnitRows, offerZeroUnusedUnits,
    choose(layer) { showRatingConfirm = async () => layer; } };
})();`);
assert.notEqual(armySource, read('ui/army.js'));
vm.runInContext(armySource, context);
const army = context.window.testArmy;
const rows = army.buildUnusedUnitRows(['APC', 'Fighter']);
const names = new Set(rows.map(row => row.perk));
assert(names.has('Heavy Tank Damage'));
assert(names.has('Heavy Tank Attack Speed'));
for (const name of ['APC Damage', 'Heavy Infantry Damage', 'Fighter Hitpoints & Damage',
  "Generals' Damage", 'Barracks Troop Damage', 'Invading Heavy Tank Damage', 'Tower Damage']) {
  assert(!names.has(name), name);
}
DN.savePerkGroupDefaults({ 'single:damage': { offensive: 5 } });
DN.saveGlobalPerkRatings({ 'Heavy Tank Damage': { offensive: 4, defensive: 3 }, 'Fighter Damage': { offensive: 2 } });
DN.saveProfilePerkOverrides(DN.activeProfileId(), { 'Heavy Tank Damage': { offensive: 5, defensive: 2 } });
async function test() {
  const before = JSON.stringify(DN.loadStoredGlobalPerkRatings());
  army.choose(null);
  await army.offerZeroUnusedUnits(['APC', 'Fighter']);
  assert.equal(JSON.stringify(DN.loadStoredGlobalPerkRatings()), before, 'Skip preserves ratings');
  assert.equal(DN.loadProfilePerkOverrides(DN.activeProfileId())['Heavy Tank Damage'].offensive, 5);
  army.choose('profile');
  await army.offerZeroUnusedUnits(['APC', 'Fighter']);
  const profile = DN.loadProfilePerkOverrides(DN.activeProfileId());
  assert.equal(profile['Heavy Tank Damage'].offensive, 0);
  assert.equal(profile['Heavy Tank Damage'].defensive, 2);
  assert.equal(JSON.stringify(DN.loadStoredGlobalPerkRatings()), before);
  army.zeroUnusedUnitRows(rows, 'global');
  const global = DN.loadStoredGlobalPerkRatings();
  assert.equal(global['Heavy Tank Damage'].offensive, 0);
  assert.equal(global['Heavy Tank Damage'].defensive, 3);
  assert.equal(global['Fighter Damage'].offensive, 2);
  assert.equal(DN.loadPerkGroupDefaults()['single:damage'].offensive, 5);
  for (const row of rows) {
    assert.equal(global[row.perk].offensive, 0, row.perk);
    assert.equal(row.newDef, row.curDef, row.perk);
  }
  console.log('Unused unit selection, linked units, Skip, profile/global cleanup, and defensive preservation passed.');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
