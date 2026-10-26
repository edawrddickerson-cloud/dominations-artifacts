/* Rarity uses the same model and eligible personal history as Crafting Stats.
 * Cache models between log changes; no network requests or history writes. */
(() => {
  'use strict';
  const models=new Map(),odds=new Map();
  function reset(){models.clear();odds.clear();}
  for(const event of ['dn-crafting-log-changed','dn-crafted-log-ready','storage','focus','dn-profile-changed'])window.addEventListener(event,reset);
  window.DNScannerRareCards={render(match,{hall,type}){
    const node=document.querySelector('[data-rare-card-rarity]');
    if(!node)return;
    node.textContent='Rarity: insufficient personal data';
    if(match.uncertain){node.textContent='Rarity: unverified pattern';return;}
    const P=window.DNCraftingProbability,source=window.DNScannerCollection;
    if(!P || !source || !window.DNCraftingCommunity || !window.DNCraftedLogStats)return;
    hall=String(hall).toLowerCase()==='war'?'war':'main';
    const category=P.categories[hall].find(value=>value.toLowerCase()===String(type).toLowerCase());
    if(!category)return;
    const key=window.DN.activeProfileId()+'|'+hall+'|'+category;
    try{
      if(!models.has(key))models.set(key,P.model(source.historyItems(),hall,category));
      const data=models.get(key),preset=window.DNCraftingPurposes.rareDefinitions.find(entry=>entry.id===match.id);
      if(!preset || data.artifacts<20)return;
      const perks=match.perks || [...preset.stats],oddsKey=key+'|'+match.id+'|'+match.mode+'|'+match.lines;
      if(!odds.has(oddsKey))odds.set(oddsKey,P.calculate(data,[{perks,count:match.lines,match:'atLeast',mode:'combined',tier:null}]));
      const result=odds.get(oddsKey);
      if(result.status!=='ready' || !result.oneIn)return;
      node.textContent='Estimated rarity: 1 in '+Number(result.oneIn.toPrecision(3)).toLocaleString()+' crafts · Personal · '+data.artifacts.toLocaleString()+' artifacts'+(result.lowSample?' · Low sample':'');
      node.title='Independent perk-roll model; at least '+match.lines+' '+(match.mode==='damage'?'damage':match.mode==='hp'?'hitpoint':'HP/damage')+' lines for '+preset.label+' in '+hall+' '+category+'.';
    }catch{/* An unavailable estimate must never affect Keep/Discard. */}
  }};
})();
