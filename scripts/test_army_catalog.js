const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const catalog = JSON.parse(read("data/army_catalog.json"));
assert.deepStrictEqual(JSON.parse(read("ui/data/army_catalog.json")), catalog);
const storage = new Map();
const context = { window: {}, localStorage: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
} };
vm.createContext(context);
vm.runInContext(read("ui/data/army_catalog.js"), context);
vm.runInContext(read("ui/shared.js"), context);
const dn = context.window.DN;
for (const unit of catalog.units) {
  assert.strictEqual(dn.armyUnitType(unit.name), unit.type);
  assert(dn.ARMY_UNIT_GROUPS.find(g => g.id === unit.type).units.includes(unit.name));
  for (const alias of unit.aliases) assert.strictEqual(dn.armyUnitType(alias), unit.type);
}
// Exercise every stored scope on both axes, including every actual default perk.
for (const [perk, scope] of Object.entries(catalog.perk_scopes)) {
  const probe = { [perk]: { offensive: 3, defensive: 2 } };
  const selected = scope.kind === "unit" ? [scope.unit]
    : scope.kind === "type" ? [catalog.units.find(u => u.type === scope.type).name] : [];
  for (const axis of ["offensive", "defensive"]) {
    assert.strictEqual(dn.armyAwareDefault(probe, selected, perk, axis), probe[perk][axis], perk);
    assert.strictEqual(dn.armyAwareDefault(probe, [], perk, axis), scope.kind === "independent" ? probe[perk][axis] : 0, perk);
  }
}
for (const [alias, target] of Object.entries(catalog.perk_aliases)) {
  assert.deepStrictEqual(dn.perkArmyScope(alias), dn.perkArmyScope(target), alias);
}
assert.deepStrictEqual(Array.from(dn.normalizeArmyUnits(["Wall Miner", "Wall Sapper"])), ["Wall Breacher"]);
assert.strictEqual(dn.unitFamily("Airstrip Troop Damage"), "Air troops");
assert.strictEqual(dn.unitFamily("All Air Troops Damage"), "Air troops");
assert.strictEqual(dn.unitFamily("Invading Airstrip Troop Damage"), null);
assert.strictEqual(dn.unitFamily("Air Defense Damage"), null);
for (const artifact of JSON.parse(read("ui/data/artifacts.json"))) {
  for (let i = 1; i <= 6; i++) {
    const perk = artifact[`perk_${i}_name`];
    if (perk) assert(dn.perkArmyScope(perk), `${artifact.name}: ${perk}`);
  }
}
const changes = (before, after) => JSON.parse(JSON.stringify(dn.armyGroupRatingChanges(before, after)));
assert.deepStrictEqual(changes([], ["Recon"]), { removed: [], added: ["Air troops"] });
assert.deepStrictEqual(changes(["Recon"], []), { removed: ["Air troops"], added: [] });
assert.deepStrictEqual(changes(["Fighter"], ["Recon"]), { removed: [], added: [] });
assert.deepStrictEqual(changes(["Fighter", "Recon"], ["Recon"]), { removed: [], added: [] });
assert.deepStrictEqual(changes([], ["APC"]), { removed: [], added: ["Barracks troops", "Factory troops"] });
assert.deepStrictEqual(changes(["APC"], ["Heavy Infantry"]), { removed: ["Factory troops"], added: [] });
assert.strictEqual(dn.armyAwareDefault({ "Barracks Troop Damage": { offensive: 4 } }, ["APC"], "Barracks Troop Damage", "offensive"), 4);
dn.saveArmyPresets({ activeId: "p1", presets: [{ id: "p1", name: "Legacy", units: ["Wall Miner", "Wall Sapper", "Recon"] }], lastApplied: ["Wall Sapper", "Recon"] });
const saved = dn.loadArmyPresets();
assert.deepStrictEqual(Array.from(saved.presets[0].units), ["Recon", "Wall Breacher"]);
assert(dn.armyEffectiveAppliedSet().has("Air troops"));
assert(dn.armyEffectiveAppliedSet().has("Barracks troops"));
for (const file of fs.readdirSync(path.join(root, "ui")).filter(f => f.endsWith(".html"))) {
  const html = read("ui/" + file);
  if (!html.includes('src="shared.js')) continue;
  assert(html.indexOf('src="data/army_catalog.js') < html.indexOf('src="shared.js'), file);
}
// The UI's classification must change when the canonical record changes.
context.window.DN_ARMY_CATALOG = JSON.parse(JSON.stringify(catalog));
context.window.DN_ARMY_CATALOG.units.find(u => u.name === "Recon").type = "factory";
vm.runInContext(read("ui/shared.js"), context);
assert.strictEqual(context.window.DN.armyUnitType("Recon"), "factory");
assert(context.window.DN.ARMY_UNIT_GROUPS.find(g => g.id === "factory").units.includes("Recon"));
console.log(`Passed: ${catalog.units.length} units, ${Object.keys(catalog.perk_scopes).length} perk scopes, aliases, saved presets, type transitions, and canonical-data authority.`);
