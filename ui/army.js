(() => {
  "use strict";
  const DN = window.DN;
  const el = Object.fromEntries(['preset-strip', 'preset-name', 'preset-add', 'preset-remove', 'army-save', 'army-discard', 'unit-grid', 'error', 'army-hint', 'strategy-status'].map(id => [id, document.getElementById(id)]));
  el.error = document.getElementById('army-error') || el.error;
  let state, draftUnits = new Set(), unitImages = {}, dirty = false, leaveRequest;
  let factoryDefaults, canonicalizePerk = name => name, creating = false, creationProfile;
  const active = () => state?.strategies.find(s => s.id === state.activeId);
  const units = () => DN.normalizeArmyUnits([...draftUnits]);
  function error(err) { el.error.hidden = !err; el.error.textContent = err ? `Could not save your loadout. ${err.message || err}` : ''; }

  // Use the same dialog, form and button styles as the ratings and collection pages.
  function ask(title, hint, actions, onSave) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ratings-dialog uncollect-dialog army-loadout-dialog';
      dialog.setAttribute('aria-labelledby', 'loadout-dialog-title');
      dialog.setAttribute('aria-describedby', 'loadout-dialog-hint');
      dialog.innerHTML = `<form method="dialog" class="ratings-form"><header class="ratings-header"><h2 id="loadout-dialog-title">${DN.esc(title)}</h2><p class="ratings-hint" id="loadout-dialog-hint">${DN.esc(hint)}</p><p class="error" role="alert" hidden></p></header><footer class="ratings-footer">${actions.map(([value, label, accent]) => `<button type="submit" class="btn${accent ? ' btn-accent' : ''}" value="${value}">${label}</button>`).join('')}</footer></form>`;
      dialog.querySelector('form').addEventListener('submit', ev => {
        if (ev.submitter?.value !== 'save' || !onSave) return;
        if (!onSave()) {
          ev.preventDefault();
          const message = dialog.querySelector('.error');
          message.hidden = false;
          message.textContent = el.error.textContent;
        }
      });
      dialog.addEventListener('close', () => { const answer = dialog.returnValue; dialog.remove(); resolve(answer); }, {once: true});
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }
  function canLeave() {
    if (leaveRequest) return leaveRequest;
    if (!dirty) return Promise.resolve(true);
    leaveRequest = ask('Save loadout changes?', `You have unsaved changes to “${active().name}”. Save or discard them before continuing.`, [['cancel', 'Cancel'], ['discard', 'Discard changes'], ['save', 'Save changes', true]], saveDraft)
      .then(answer => {
        if (answer !== 'save' && answer !== 'discard') return false;
        if (answer === 'discard') resetDraft();
        return true;
      }).finally(() => { leaveRequest = null; });
    return leaveRequest;
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
  function saveDraft() {
    try {
      const name = el['preset-name'].value.trim();
      if (!name) throw new Error('Give the loadout a name.');
      const patch = {name};
      if (JSON.stringify(units()) !== JSON.stringify(DN.normalizeArmyUnits(active().units))) patch.units = units();
      if (!DN.updateStrategy(state.activeId, patch)) throw new Error('This loadout is no longer available.');
      error('');
      resetDraft();
      return true;
    } catch (err) { error(err); setDirty(); return false; }
  }
  function run(action, {leave = false} = {}) {
    if (leave && dirty) return canLeave().then(allowed => { if (allowed) run(action); });
    try { action(); error(''); resetDraft(); } catch (err) { error(err); setDirty(); }
  }
  function render() {
    const selected = active();
    // Older archived loadouts remain accessible without keeping archive controls.
    el['preset-strip'].innerHTML = state.strategies.map(s =>
      `<button type="button" class="seg-btn army-preset-btn${s.id === state.activeId ? ' is-active' : ''}" data-strategy-id="${DN.esc(s.id)}" aria-pressed="${s.id === state.activeId}">${DN.esc(s.name)}</button>`).join('');
    el['unit-grid'].innerHTML = DN.ARMY_UNIT_GROUPS.map(group => `<section class="army-unit-group" aria-label="${DN.esc(group.label)}"><h3 class="army-unit-group-title">${DN.esc(group.label)}</h3><div class="army-unit-grid">${group.units.map(fam => {
      const linked = DN.armyIncludes(fam);
      return `<label class="army-unit-check${linked.length ? ' is-linked' : ''}">${DN.thumbHtml(unitImages[fam] || '', fam, 'entity-thumb--army')}<input type="checkbox" data-unit="${DN.esc(fam)}"${draftUnits.has(fam) ? ' checked' : ''}/><span class="army-unit-label"><span>${DN.esc(fam)}</span>${linked.length ? `<span class="army-unit-link">includes ${DN.esc(linked.join(', '))}</span>` : ''}</span></label>`;
    }).join('')}</div></section>`).join('');
    el['preset-add'].disabled = !factoryDefaults || state.strategies.length >= DN.STRATEGY_MAX;
    el['preset-remove'].disabled = !selected;
    setDirty();
  }
  el['preset-strip'].addEventListener('click', ev => {
    const id = ev.target.closest('[data-strategy-id]')?.dataset.strategyId;
    if (id && id !== state.activeId) run(() => {
      const strategy = DN.loadStrategies().strategies.find(s => s.id === id);
      if (strategy?.archived) DN.updateStrategy(id, {archived: false});
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
  el['army-save'].addEventListener('click', saveDraft);
  el['army-discard'].addEventListener('click', async () => {
    if (await ask('Revert loadout changes?', 'Restore the last saved name and troop choices for this loadout?', [['cancel', 'Cancel'], ['discard', 'Revert changes', true]]) === 'discard') resetDraft();
  });
  const createDialog = document.getElementById('loadout-create-dialog');
  const createName = document.getElementById('loadout-create-name');
  const createBaseline = document.getElementById('loadout-create-baseline');
  const createError = document.getElementById('loadout-create-error');
  function describeBaseline() {
    document.getElementById('loadout-create-description').textContent = createBaseline.value === 'defaults' ? 'Start with no troops selected and standard army and group ratings.' :
      createBaseline.value === 'profile' ? 'Start with no troops selected and a copy of this profile’s current shared perk ratings.' : 'Copy this strategy’s troop choices and effective ratings. Its saved artifact layout stays separate.';
  }
  createBaseline.addEventListener('change', describeBaseline);
  el['preset-add'].addEventListener('click', async () => {
    if (creating) return;
    creating = true;
    if (!await canLeave()) { creating = false; return; }
    const names = new Set(DN.loadStrategies().strategies.map(s => s.name));
    let number = 1;
    while (names.has(`Loadout ${number}`)) number++;
    creationProfile = DN.activeProfileId();
    createName.value = `Loadout ${number}`;
    createBaseline.innerHTML = '<option value="defaults">Defaults</option><option value="profile">Current profile</option>' + DN.loadStrategies().strategies.filter(s => !s.archived).map(s => `<option value="strategy:${DN.esc(s.id)}">Existing strategy: ${DN.esc(s.name)}</option>`).join('');
    createBaseline.value = 'defaults';
    createError.hidden = true;
    describeBaseline();
    createDialog.showModal();
    createName.focus(); createName.select();
  });
  createDialog.addEventListener('close', () => { creating = false; });
  document.getElementById('loadout-create-form').addEventListener('submit', ev => {
    if (ev.submitter?.value !== 'create') return;
    ev.preventDefault();
    try {
      if (DN.activeProfileId() !== creationProfile) throw new Error('The profile changed. Cancel and create the loadout again.');
      const name = createName.value.trim();
      if (!name) throw new Error('Give the loadout a name.');
      const fromStrategy = createBaseline.value.startsWith('strategy:');
      const created = DN.addStrategy(name, {units: [], baseline: fromStrategy ? 'strategy' : createBaseline.value, sourceId: fromStrategy ? createBaseline.value.slice(9) : null,
        factoryDefaults, canonPerk: canonicalizePerk, activate: true});
      if (!created) throw new Error('The loadout limit has been reached.');
      error(''); resetDraft(); createDialog.close('create');
    } catch (err) { createError.hidden = false; createError.textContent = err.message || String(err); }
  });
  el['preset-remove'].addEventListener('click', async () => {
    const id = state.activeId;
    const answer = await ask('Delete loadout?', `Delete “${active().name}”, including its perk overrides and saved artifact layout?`, [['cancel', 'Cancel'], ['delete', 'Delete loadout', true]]);
    if (answer !== 'delete') return;
    run(() => {
      const current = DN.loadStrategies();
      current.strategies = current.strategies.filter(s => s.id !== id);
      // Normalization supplies an empty loadout when the last one is deleted.
      // Restore a remaining archived loadout if needed so none become stranded.
      DN.saveStrategies(current);
    });
  });
  document.addEventListener('click', ev => {
    const link = ev.target.closest('a[href]');
    if (!dirty || !link || link.hasAttribute('download') || ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || (link.target && link.target !== '_self')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    canLeave().then(allowed => { if (allowed) location.assign(destination.href); });
  }, true);
  window.addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('dn-strategies-changed', () => { if (!dirty) resetDraft(); });
  for (const event of ['focus','storage']) window.addEventListener(event, () => { if (!dirty) resetDraft(); });
  async function load() {
    resetDraft();
    try {
      const [defaultsResponse, mappingResponse, response] = await Promise.all([fetch('./data/perk_rating_defaults.json'), fetch('./data/perk_name_mapping.csv'), fetch('./data/army_unit_images.json')]);
      if (!defaultsResponse.ok) throw new Error('Could not load perk defaults. Reload to retry.');
      canonicalizePerk = DN.makeCanonPerk(mappingResponse.ok ? DN.parseMappingCsv(await mappingResponse.text()) : {});
      factoryDefaults = Object.fromEntries(Object.entries(await defaultsResponse.json()).map(([name, value]) => [canonicalizePerk(name), value]));
      if (!Object.keys(factoryDefaults).length) throw new Error('Perk defaults are empty. Reload to retry.');
      DN.initializeStrategyBaselines(factoryDefaults, {canonPerk: canonicalizePerk});
      unitImages = response.ok ? DN.imageUrlMap(await response.json()) : {};
      for (const unit of DN.ARMY_UNITS) if (!unitImages[unit.name]) unitImages[unit.name] = unit.aliases.map(a => unitImages[a]).find(Boolean) || '';
      render();
    } catch (err) { error(err); }
  }
  load();
})();
