/* Shared presentation behaviour only. Domain selection/save state stays with consumers. */
(() => {
  'use strict';
  const definitions = [
    ['.perk-filter-panel', panel => document.querySelector('[aria-controls="' + panel.id + '"]')],
    ['.strategy-comparison-options', panel => panel.parentElement.querySelector(':scope > summary')],
    ['.probability-perk-menu', panel => panel.parentElement.querySelector(':scope > summary')],
    ['.collection-slot-filter-menu', panel => panel.parentElement.querySelector(':scope > summary')],
  ];
  const entries = new Map();
  let sequence = 0, scheduled = false;
  const isOpen = entry => entry.details ? entry.details.open : !entry.panel.hidden;
  function emptyState(entry) {
    if (!isOpen(entry)) return;
    if (!entry.panel.contains(entry.empty)) entry.panel.appendChild(entry.empty);
    const options = [...entry.panel.querySelectorAll('input[type="checkbox"]')];
    const empty = !options.some(option => !option.closest('[hidden]'));
    if (entry.empty.hidden === empty) entry.empty.hidden = !empty;
    const text = entry.panel.querySelector('input[type="search"]')?.value ? 'No matches' : 'No options';
    if (entry.empty.textContent !== text) entry.empty.textContent = text;
  }
  function close(entry, restore = false) {
    if (entry.details) entry.details.open = false;
    else { entry.panel.hidden = true; entry.trigger.setAttribute('aria-expanded', 'false'); }
    if (restore) entry.trigger.focus();
  }
  function place(entry) {
    const { panel, trigger } = entry;
    if (!isOpen(entry) || !trigger.isConnected) return;
    emptyState(entry);
    const rect = trigger.getBoundingClientRect(), gap = 6, edge = 8;
    const width = Math.min(384, innerWidth - edge * 2);
    const below = innerHeight - rect.bottom - gap - edge, above = rect.top - gap - edge;
    const height = Math.min(448, Math.max(below, above));
    panel.style.width = width + 'px';
    panel.style.maxHeight = Math.max(0, height) + 'px';
    const actual = panel.getBoundingClientRect().height;
    panel.style.left = Math.max(edge, Math.min(rect.left, innerWidth - width - edge)) + 'px';
    panel.style.top = Math.max(edge, below >= actual || below >= above ? rect.bottom + gap : rect.top - actual - gap) + 'px';
  }
  function sync(entry) {
    if (!isOpen(entry)) return;
    for (const other of entries.values()) if (other !== entry && isOpen(other)) close(other);
    place(entry);
  }
  function scan(root) {
    for (const [selector, findTrigger] of definitions) {
      const panels = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
      for (const panel of panels) {
        if (entries.has(panel)) continue;
        const trigger = findTrigger(panel);
        if (!trigger) continue;
        const details = trigger.tagName === 'SUMMARY' ? trigger.parentElement : null;
        if (!panel.id) panel.id = 'ui-picker-' + (++sequence);
        trigger.setAttribute('aria-controls', panel.id);
        panel.setAttribute('data-ui-floating', '');
        const empty = document.createElement('p');
        empty.className = 'ui-picker-empty'; empty.hidden = true; empty.setAttribute('role', 'status');
        panel.appendChild(empty);
        const entry = { panel, trigger, details, empty };
        entries.set(panel, entry);
        if (details) details.addEventListener('toggle', () => sync(entry));
        sync(entry);
      }
    }
  }
  function reposition() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const [panel, entry] of entries) {
        if (!panel.isConnected) entries.delete(panel);
        else place(entry);
      }
    });
  }
  function revealCurrentPage() {
    if (innerWidth > 900 || !document.body.classList.contains('app-shell')) return;
    const current = document.querySelector('.site-nav [aria-current="page"]');
    current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function dismissOutside(target) {
    for (const entry of entries.values()) {
      if (isOpen(entry) && !entry.panel.contains(target) && !entry.trigger.contains(target)) close(entry);
    }
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) if (node.nodeType === 1) {
          scan(node);
          if (node.matches('.site-nav') || node.querySelector('.site-nav')) requestAnimationFrame(revealCurrentPage);
        }
      } else if (entries.has(record.target)) sync(entries.get(record.target));
      if (record.attributeName === 'aria-current') requestAnimationFrame(revealCurrentPage);
    }
    reposition();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-current'] });
  // Capture runs even when a page's trigger handler stops propagation.
  document.addEventListener('click', event => {
    dismissOutside(event.target);
    const frame = document.getElementById('scanner-view');
    frame?.contentWindow?.dispatchEvent(new Event('dn-ui-dismiss'));
    queueMicrotask(reposition);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    const entry = [...entries.values()].find(isOpen);
    if (entry) { event.preventDefault(); event.stopPropagation(); close(entry, true); }
  }, true);
  document.addEventListener('focusin', event => dismissOutside(event.target));
  addEventListener('dn-ui-dismiss', () => { for (const entry of entries.values()) close(entry); });
  addEventListener('resize', reposition);
  addEventListener('resize', revealCurrentPage);
  addEventListener('scroll', reposition, true);

  const main = document.querySelector('main, [role="main"]');
  if (main) {
    if (!main.id) main.id = 'main-content';
    main.tabIndex = -1;
  }
  if (document.body.classList.contains('app-shell')) {
    const skip = document.createElement('a');
    skip.className = 'ui-skip-link'; skip.href = '#scanner-view'; skip.textContent = 'Skip to content';
    skip.addEventListener('click', event => {
      event.preventDefault();
      const frame = document.getElementById('scanner-view');
      frame?.contentDocument?.querySelector('main, [role="main"]')?.focus();
    });
    document.body.prepend(skip);
  }
})();
