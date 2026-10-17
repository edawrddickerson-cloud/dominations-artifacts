(() => {
  "use strict";
  const DN = window.DN;
  const el = Object.fromEntries(['preset-strip', 'preset-name', 'preset-add', 'preset-remove', 'army-save', 'army-discard', 'unit-grid', 'error', 'army-hint', 'strategy-status', 'strategy-legacy', 'strategy-archived'].map(id => [id, document.getElementById(id)]));
  let state, draftUnits = new Set(), unitImages = {}, dirty = false;
  const active = () => state?.strategies.find(s => s.id === state.activeId);
  const units = () => DN.normalizeArmyUnits([...draftUnits]);
  function error(err) { el.error.hidden = !err; el.error.textContent = err ? `Could not save your strategy. ${err.message || err}` : ''; }
  function canLeave() {
    if (!dirty) return true;
    if (!confirm('Discard the unsaved changes to this strategy?')) return false;
    dirty = false;
    return true;
  }
  window.DNStrategyEditor = {canLeave};
  function setDirty() {
    const strategy = active();
    dirty = !!strategy && (JSON.stringify(units()) !== JSON.stringify(DN.normalizeArmyUnits(strategy.units)) || el['preset-name'].value.trim() !== strategy.name);
    el['strategy-status'].textContent = dirty ? 'Unsaved changes' : 'All changes saved';
    el['strategy-status'].classList.toggle('is-unsaved', dirty);
    el['army-save'].disabled = !dirty;
    el['army-discard'].disabled = !dirty;
  }
  function resetDraft() {
    state = DN.loadStrategies();
    draftUnits = new Set(active()?.units || []);
    el['preset-name'].value = active()?.name || '';
    render();
  }
  function run(action, {leave = false} = {}) {
    if (leave && !canLeave()) return;
    try { action(); error(''); resetDraft(); } catch (err) { error(err); setDirty(); }
  }
  function render() {
    const selected = active();
    el['preset-strip'].innerHTML = state.strategies.filter(s => !s.archived || el['strategy-archived'].checked).map(s =>
      `<button type="button" class="seg-btn army-preset-btn${s.id === state.activeId ? ' is-active' : ''}" data-strategy-id="${DN.esc(s.id)}" aria-pressed="${s.id === state.activeId}">${s.favorite ? '★ ' : ''}${DN.esc(s.name)}${s.archived ? ' (archived)' : ''}</button>`).join('');
    el['unit-grid'].innerHTML = DN.ARMY_UNIT_GROUPS.map(group => `<section class="army-unit-group" aria-label="${DN.esc(group.label)}"><h3 class="army-unit-group-title">${DN.esc(group.label)}</h3><div class="army-unit-grid">${group.units.map(fam => {
      const linked = DN.armyIncludes(fam);
      return `<label class="army-unit-check${linked.length ? ' is-linked' : ''}">${DN.thumbHtml(unitImages[fam] || '', fam, 'entity-thumb--army')}<input type="checkbox" data-unit="${DN.esc(fam)}"${draftUnits.has(fam) ? ' checked' : ''}/><span class="army-unit-label"><span>${DN.esc(fam)}</span>${linked.length ? `<span class="army-unit-link">includes ${DN.esc(linked.join(', '))}</span>` : ''}</span></label>`;
    }).join('')}</div></section>`).join('');
    const remaining = state.strategies.filter(s => !s.archived).length;
    el['preset-add'].disabled = state.strategies.length >= DN.STRATEGY_MAX;
    document.getElementById('strategy-duplicate').disabled = state.strategies.length >= DN.STRATEGY_MAX;
    el['preset-remove'].disabled = !selected || remaining < 2;
    document.getElementById('strategy-archive').disabled = !selected || (!selected.archived && remaining < 2);
    document.getElementById('strategy-archive').textContent = selected?.archived ? 'Restore' : 'Archive';
    document.getElementById('strategy-favorite').textContent = selected?.favorite ? '★ Favorite' : '☆ Favorite';
    el['strategy-legacy'].hidden = !selected?.legacy;
    el['army-hint'].textContent = `${selected?.name || 'Strategy'} · ${draftUnits.size} troop families. Troop choices and perk overrides belong to this strategy. Customize its ratings in Settings → Perk ratings.`;
    setDirty();
  }
  el['preset-strip'].addEventListener('click', ev => {
    const id = ev.target.closest('[data-strategy-id]')?.dataset.strategyId;
    if (id && id !== state.activeId) run(() => {
      const strategy = state.strategies.find(s => s.id === id);
      if (strategy.archived) DN.updateStrategy(id, {archived: false});
      DN.setActiveStrategy(id);
    }, {leave: true});
  });
  el['unit-grid'].addEventListener('change', ev => {
    const target = ev.target;
    if (!target.matches('[data-unit]')) return;
    if (target.checked) draftUnits.add(target.dataset.unit); else draftUnits.delete(target.dataset.unit);
    setDirty();
  });
  el['preset-name'].addEventListener('input', setDirty);
  el['army-save'].addEventListener('click', () => run(() => {
    const name = el['preset-name'].value.trim();
    if (!name) throw new Error('Give the strategy a name.');
    const patch = {name};
    if (JSON.stringify(units()) !== JSON.stringify(DN.normalizeArmyUnits(active().units))) patch.units = units();
    DN.updateStrategy(state.activeId, patch);
  }));
  el['army-discard'].addEventListener('click', () => { if (canLeave()) resetDraft(); });
  el['preset-add'].addEventListener('click', () => run(() => {
    const created = DN.addStrategy(`Strategy ${state.strategies.length + 1}`, {units: []});
    if (!created) throw new Error('The strategy limit has been reached.');
    if (created) DN.setActiveStrategy(typeof created === 'string' ? created : created.id);
  }, {leave: true}));
  document.getElementById('strategy-duplicate').addEventListener('click', () => run(() => {
    const created = DN.addStrategy(`${active().name} copy`, {duplicateId: state.activeId});
    if (!created) throw new Error('The strategy could not be duplicated.');
    if (created) DN.setActiveStrategy(typeof created === 'string' ? created : created.id);
  }, {leave: true}));
  el['preset-remove'].addEventListener('click', () => {
    if (confirm(`Delete “${active().name}”, including its perk overrides and saved artifact layout?`)) run(() => DN.removeStrategy(state.activeId), {leave: true});
  });
  document.getElementById('strategy-archive').addEventListener('click', () => run(() => {
    if (active().archived) DN.updateStrategy(state.activeId, {archived: false}); else DN.archiveStrategy(state.activeId);
  }, {leave: true}));
  document.getElementById('strategy-favorite').addEventListener('click', () => run(() => DN.updateStrategy(state.activeId, {favorite: !active().favorite}), {leave: true}));
  for (const [id, delta] of [['strategy-earlier', -1], ['strategy-later', 1]]) document.getElementById(id).addEventListener('click', () => run(() => {
    const index = state.strategies.findIndex(s => s.id === state.activeId), next = index + delta;
    if (next < 0 || next >= state.strategies.length) return;
    [state.strategies[index], state.strategies[next]] = [state.strategies[next], state.strategies[index]];
    DN.saveStrategies(state);
  }, {leave: true}));
  el['strategy-archived'].addEventListener('change', render);
  document.getElementById('strategy-adopt-defaults').addEventListener('click', () => {
    if (confirm('Adopt army defaults for this strategy? Its migrated rating snapshot and strategy overrides will be cleared. Shared and profile ratings are kept.')) run(() => DN.updateStrategy(state.activeId, {legacy: null, overrides: {}, inheritRatings: false}), {leave: true});
  });
  document.addEventListener('click', ev => {
    const link = ev.target.closest('a[href]');
    if (link && !link.hasAttribute('download') && !ev.defaultPrevented && !canLeave()) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('dn-strategies-changed', () => { if (!dirty) resetDraft(); });
  for (const event of ['focus','storage']) window.addEventListener(event, () => { if (!dirty) resetDraft(); });
  async function load() {
    try {
      const response = await fetch('./data/army_unit_images.json');
      unitImages = response.ok ? DN.imageUrlMap(await response.json()) : {};
      for (const unit of DN.ARMY_UNITS) if (!unitImages[unit.name]) unitImages[unit.name] = unit.aliases.map(a => unitImages[a]).find(Boolean) || '';
      resetDraft();
    } catch (err) { error(err); }
  }
  load();
})();
