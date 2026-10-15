const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../ui/profiles-ui.js'), 'utf8');
const mount = source.slice(source.indexOf('  function mountPrimaryFilters()'), source.indexOf('  function fillSelect('));
const store = new Map();
const key = 'dn-primary-filters:test';
function setup() {
  const buttons = Object.fromEntries(['main', 'war', 'off', 'def'].map(name => [name, {
    listeners: [], attrs: {}, classList: { toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(event, fn) { this.listeners.push(fn); },
    click() { this.listeners.forEach(fn => fn()); },
  }]));
  const selectors = {
    '#hall-main, #mode-main, #header-main': buttons.main,
    '#hall-war, #mode-war, #header-war': buttons.war,
    '#sort-off, #header-off': buttons.off,
    '#sort-def, #header-def': buttons.def,
  };
  const window = {};
  const context = {
    window,
    document: { querySelector: s => selectors[s], getElementById: () => null },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    DN: { activeProfileId: () => 'test', lsGet: k => store.get(k) ?? null, lsSet: (k, v) => store.set(k, v) },
  };
  vm.runInNewContext(mount + '\nmountPrimaryFilters();', context);
  return { ...buttons, filters: window.DNPrimaryFilters };
}
function expectAxes(buttons, off, def) {
  assert.equal(buttons.off.attrs['aria-pressed'], String(off));
  assert.equal(buttons.def.attrs['aria-pressed'], String(def));
  for (const storageKey of ['dn-artifact-pref-sort-axes', 'dn-council-pref-sort-axes']) {
    assert.deepEqual(JSON.parse(store.get(storageKey)), { offensive: off, defensive: def });
  }
}
// Migrate existing preferences, then remember different choices for each hall.
store.set(key, JSON.stringify({ hall: 'Main', offensive: true, defensive: false }));
let buttons = setup();
expectAxes(buttons, true, false);
buttons.war.click();
expectAxes(buttons, true, false);
buttons.def.click();
buttons.off.click();
expectAxes(buttons, false, true);
buttons.main.click();
expectAxes(buttons, true, false);
buttons.war.click();
expectAxes(buttons, false, true);
buttons.def.click();
expectAxes(buttons, false, true); // At least one base type stays selected.
buttons = setup(); // Reload preserves each hall's choice.
expectAxes(buttons, false, true);
buttons.filters.setHall('main');
expectAxes(buttons, true, false);
buttons.filters.setHall('war');
expectAxes(buttons, false, true);
assert.equal(JSON.parse(store.get(key)).axesByHall.Main.offensive, true);
assert.equal(JSON.parse(store.get(key)).axesByHall.War.defensive, true);
console.log('Hall-specific base types, migration, reload, and programmatic switching passed.');
