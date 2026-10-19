'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const {build, files} = require('./build_crafted_perk_pools.js');
const row = (name, value, extra = {}) => ({name, value, known: true, hasPercent: true, ...extra});
const item = (type, rows, hall = 'main') => ({freshCraft: true, type, hall, rows});
const example = build({items: [
  item('Weapon', [row('Heavy Tank Damage', 11), row('Heavy Tank Damage', 6), row('Bomber Damage', 11, {inferred: true}), row('Fighter Damage', -11)]),
  item('Legendary', [row('All Resources Looted', 11)]),
  item('Armor', [row('Invading Heavy Tank Damage', -11), row('Invading Bomber Damage', -6, {conflict: true})]),
  item('Equipment', [row('All Resources Looted', 11)]),
]}, {cases: [
  {hall: 'war', category: 'War Weapon', time: 10, rows: [['Heavy Tank Damage', 6]]},
  {hall: 'war', category: 'War Legendary', time: 11, rows: [['All Resources Looted', 11]]},
]}, {});
assert.equal(example.complete, false);
assert.equal(example.pools.main.Weapon['Heavy Tank Damage'].observedItems, 1, 'repeated stats count once per encounter');
assert.equal(example.pools.main.Weapon['Bomber Damage'], undefined, 'inferred values do not establish a type');
assert.equal(example.pools.main.Weapon['Fighter Damage'], undefined, 'wrong sign does not establish a type');
assert.equal(example.pools.main.Armor['Invading Bomber Damage'], undefined, 'conflicted reads remain excluded');
assert.equal(example.pools.main.Armor['Invading Heavy Tank Damage'].observedItems, 1);
assert.deepEqual(example.pools.war.Weapon['Heavy Tank Damage'].reviewedFrames, [10]);
assert.deepEqual(example.pools.war.Equipment, {}, 'Main observations and named artifacts do not populate War pools');
assert.equal(example.pools.main.Jewelry['All Resources Looted'], undefined, 'named artifacts never establish ordinary pools');
const data = require('../data/crafted_perk_pools.json');
const ratings = require('../data/perk_rating_defaults.json');
for (const types of Object.values(data.pools)) for (const perks of Object.values(types)) for (const [name, evidence] of Object.entries(perks)) {
  assert.ok(ratings[name], name + ' has canonical ratings');
  assert.ok(evidence.observedItems > 0 || evidence.reviewedFrames.length > 0, name + ' has positive evidence');
}
for (const [file, content] of Object.entries(files(data))) assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, file + ' is synchronized');
console.log('Crafted type evidence, exclusions, Hall separation and generated data checks passed.');
