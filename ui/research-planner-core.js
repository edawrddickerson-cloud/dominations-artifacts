/* Pure research availability model. Recorded completions never imply other completions. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DNResearchPlannerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const RELATIONS = {direct:'Direct',spawned:'Spawned units',general:'General bonuses',upgrade:'Upgrades',research:'Research support'};
  function normalize(data, raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const state = {version:1,age:null,buildings:{University:null,Library:null},levels:{}};
    if (Object.hasOwn(data.ages,source.age)) state.age = Number(source.age);
    for (const building of ['University','Library']) {
      const n=source.buildings?.[building];
      if (Number.isInteger(n) && Object.hasOwn(data.building_age_gates[building.toLowerCase()],n)) state.buildings[building]=n;
    }
    for (const e of data.entries) {
      const n=source.levels?.[e.id];
      if (Number.isInteger(n) && n>=0 && n<=e.max_level) state.levels[e.id]=n;
    }
    return state;
  }
  const completed = (state,id) => Object.hasOwn(state.levels,id) ? state.levels[id] : null;
  function dependencies(stage,state) {
    return stage.requires.map(r=>({...r,satisfied:r.any.some(p=>completed(state,p.id)!==null && completed(state,p.id)>=p.level)}));
  }
  function status(data,entry,stage,state,match) {
    if (completed(state,entry.id)!==null && completed(state,entry.id)>=stage.level) return 'Complete';
    if (entry.age_status==='conflicting_sources') return 'Age disputed';
    if (state.age===null) return 'Choose age';
    if (stage.age>state.age) return 'Later age';
    const building=state.buildings[entry.building];
    if (building===null) return 'Building level needed';
    if (building<stage.building_level) return 'Building upgrade needed';
    const actualAge=data.building_age_gates[entry.building.toLowerCase()][building];
    if (actualAge>state.age) return 'Check building level';
    if (completed(state,entry.id)===null) return 'Progress needed';
    const missing=dependencies(stage,state).filter(r=>!r.satisfied);
    if (missing.length) return 'Prerequisites needed';
    if (match?.conditional || stage.conditions?.length) return 'Check conditions';
    return 'Ready';
  }
  function results(data,state,options={}) {
    const {focus='APC',future=false,disputed=false,finished=false,query='',relation='',building='',availability=''}=options;
    const rows=[];
    for (const entry of data.entries) {
      if (entry.age_status==='conflicting_sources'&&!disputed) continue;
      if (building&&entry.building!==building) continue;
      const level=completed(state,entry.id);
      const candidates=entry.stages.filter(s=>focus==='all'||s.matches.some(m=>m.focus===focus));
      if (!candidates.length) continue;
      const upcoming=candidates.filter(s=>s.level>(level??0));
      const stage=upcoming[0] || candidates.at(-1);
      const match=stage.matches.find(m=>m.focus===focus) || {relation:'direct',reason:stage.effect,conditional:/munition|wonder|world war|detachment/i.test(stage.effect)};
      const stateLabel=status(data,entry,stage,state,match);
      if (stateLabel==='Complete'&&!finished) continue;
      if (!future&&state.age!==null&&stage.age>state.age) continue;
      if (relation&&match.relation!==relation) continue;
      if (availability&&stateLabel!==availability) continue;
      if (query&&!`${entry.name} ${entry.line} ${entry.study||''} ${stage.effect}`.toLowerCase().includes(query.toLowerCase())) continue;
      rows.push({entry,stage,match,status:stateLabel,completed:level,later:upcoming.slice(1),dependencies:dependencies(stage,state)});
    }
    return rows.sort((a,b)=>a.stage.age-b.stage.age || a.entry.building.localeCompare(b.entry.building) || a.entry.line.localeCompare(b.entry.line) || a.entry.name.localeCompare(b.entry.name) || a.entry.id.localeCompare(b.entry.id));
  }
  return {RELATIONS,normalize,completed,dependencies,status,results};
});
