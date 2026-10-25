/* Disposable local review data. Only called from the isolated design runner. */
(async () => {
  const until = performance.now() + 10000;
  while (!window.DNCraftingPurposes || !window.DNStoredArtifacts || !document.getElementById('scanner-names')?.children.length) {
    if (performance.now() > until) throw Error('Design fixture setup timed out');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  document.getElementById('scanner-auto').checked = false;
  document.getElementById('header-main').click();
  DNCraftingPurposes.saveCustom({label: 'Ground attack', category: 'attacking', selections: ['attack-heavy-infantry', 'attack-ranged-infantry']});
  DNCraftingPurposes.saveCustom({label: 'Anti-bomber defence', category: 'defensive', selections: ['counter-bomber']});
  const names = ['Heavy Tank Damage', 'Heavy Tank Hitpoints', 'Ranged Infantry Damage', 'Barracks Troop Damage', 'All Resources Looted'];
  const rows = value => names.map((name, index) => ({name, value: index === 4 ? 6 : value, base: index === 4 ? 6 : value, max: (index === 4 ? 6 : value) + 9, level: 1, levelSource: 'manual', unlocked: index < 2, rerollEligible: false}));
  const items = [
    {id:'design-weapon-1',name:'Heavy Tank Weapon',hall:'main',type:'Weapon',reviewed:true,rows:rows(11)},
    {id:'design-weapon-2',name:'Ranged Infantry Weapon',hall:'main',type:'Weapon',reviewed:true,rows:rows(6)},
    {id:'design-jewelry-1',name:'Resource Jewelry',hall:'main',type:'Jewelry',reviewed:true,rows:rows(1)},
  ];
  await DNStoredArtifacts.write(DNStoredArtifacts.collectionKey(), items);
  const strategy = DN.activeStrategyId(), loadout = DN.loadLoadout(strategy);
  loadout.Main.mains = [items[0].id];
  loadout.Main.scannedPlaced = items.map(item => item.id);
  DN.saveLoadout(loadout, strategy);
  DN.saveCollectionUi({hall:'Main',viewMode:'list',compareRows:'all',valueMode:'actual'});
  window.dispatchEvent(new Event('focus'));
  return {items:items.length, targets:2};
})();
