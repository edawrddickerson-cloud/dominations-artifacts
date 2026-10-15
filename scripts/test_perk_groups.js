const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const store = new Map();
const context = {
  window: {},
  localStorage: {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  },
};
vm.createContext(context);
for (const file of ["ui/data/army_catalog.js", "ui/shared.js"]) vm.runInContext(read(file), context);
const DN = context.window.DN;
const factory = JSON.parse(read("ui/data/perk_rating_defaults.json"));
const classified = DN.PERK_GROUPS.flatMap(group => group.perks.map(perk => perk.name));
assert.equal(classified.length, new Set(classified).size, "each perk belongs to one section");
assert.deepEqual([...classified].sort(), Object.keys(factory).sort(), "all existing stats are covered");

DN.saveGlobalPerkRatings({ "Heavy Tank Damage": { defensive: 1 } });
DN.savePerkGroupDefaults({
  "single:damage": { offensive: 4, defensive: 2 },
  "single:hp": { offensive: 3 },
  "multi:damage": { offensive: 5 },
});
let global = DN.loadGlobalPerkRatings();
assert.equal(global["Heavy Tank Damage"].offensive, 4);
assert.equal(global["Heavy Tank Damage"].defensive, 1, "individual axis wins");
assert.equal(global["Heavy Tank Hitpoints"].offensive, 3);
assert.equal(global["Fighter Hitpoints & Damage"].offensive, 4, "combined uses higher rating");
assert.equal(global["Barracks Troop Damage"].offensive, 5, "multi unit defaults are separate");
assert.equal(global["Invading Heavy Tank Damage"], undefined, "invading stats remain separate");
assert.equal(DN.loadStoredGlobalPerkRatings()["Bomber Damage"], undefined, "inheritance is not stored as individual overrides");

DN.saveProfilePerkOverrides("main", { "Bomber Damage": { offensive: -2 } });
let layers = DN.loadActivePerkRatingLayers();
assert.equal(DN.mergePerkRatingLayers(layers.global, layers.profile)["Bomber Damage"].offensive, -2);
DN.savePerkGroupDefaults({ "single:damage": { offensive: 1 } });
global = DN.loadGlobalPerkRatings();
assert.equal(global["Heavy Tank Damage"].offensive, 1, "inherited ratings follow later edits");
assert.equal(global["Heavy Tank Damage"].defensive, 1, "explicit exceptions survive edits");
DN.saveGlobalPerkRatings({});
assert.equal(DN.loadGlobalPerkRatings()["Heavy Tank Damage"].offensive, 1, "clearing an exception restores inheritance");
DN.savePerkGroupDefaults({});
assert.equal(DN.loadGlobalPerkRatings()["Heavy Tank Damage"], undefined, "clearing groups restores factory fallback");
assert.equal(DN.loadProfilePerkOverrides("main")["Bomber Damage"].offensive, -2, "reset keeps profile overrides");
DN.savePerkGroupDefaults({ "single:damage": { offensive: -4 }, "single:hp": { offensive: -2 } });
assert.equal(DN.loadGlobalPerkRatings()["Fighter Hitpoints & Damage"].offensive, -2);
console.log("Perk grouping, persistence, inheritance, and profile checks passed.");

async function testRatingsPage() {
  const elements = {};
  for (const id of ["ratings-q", "ratings-grid", "error", "ratings-reset-global", "ratings-clear-overrides"]) {
    elements[id] = {
      value: "", innerHTML: "", hidden: false, listeners: {},
      style: { setProperty() {} },
      addEventListener(event, handler) { this.listeners[event] = handler; },
      querySelectorAll() { return []; },
    };
  }
  class Input {
    constructor(layer, key, axis, value) {
      this.dataset = { layer, key, axis }; this.value = value;
      this.validity = { valid: true };
    }
    matches() { return true; }
  }
  context.document = { getElementById: id => elements[id] };
  context.HTMLInputElement = Input;
  context.fetch = async url => ({
    ok: true,
    text: async () => read("ui/data/perk_name_mapping.csv"),
    json: async () => factory,
  });
  context.confirm = () => true;
  DN.savePerkGroupDefaults({});
  vm.runInContext(read("ui/ratings.js"), context);
  await new Promise(resolve => setImmediate(resolve));
  const grid = elements["ratings-grid"];
  assert.equal(elements.error.textContent, "");
  assert.match(grid.innerHTML, /Single units/);
  assert.match(grid.innerHTML, /Heavy Tank Damage/);
  assert.doesNotMatch(grid.innerHTML, /data-section-id="single" open/, "sections start collapsed");
  grid.listeners.change({ target: new Input("group", "single:damage", "offensive", "5") });
  assert.equal(DN.loadGlobalPerkRatings()["Heavy Tank Damage"].offensive, 5);
  grid.listeners.change({ target: new Input("global", "Heavy Tank Damage", "offensive", "2") });
  assert.equal(DN.loadGlobalPerkRatings()["Heavy Tank Damage"].offensive, 2);
  grid.listeners.change({ target: new Input("global", "Heavy Tank Damage", "offensive", "") });
  assert.equal(DN.loadGlobalPerkRatings()["Heavy Tank Damage"].offensive, 5);
  elements["ratings-q"].value = "Heavy Tank";
  elements["ratings-q"].listeners.input();
  assert.match(grid.innerHTML, /data-section-id="single" open/, "search expands matching sections");
  assert.doesNotMatch(grid.innerHTML, /Research time/);
  elements["ratings-q"].value = "no such perk";
  elements["ratings-q"].listeners.input();
  assert.match(grid.innerHTML, /No perks match/);
  console.log("Grouped ratings page loading, editing, clearing, and search checks passed.");
}
testRatingsPage().catch(error => { console.error(error); process.exitCode = 1; });
