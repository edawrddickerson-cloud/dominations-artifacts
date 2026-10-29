/*
 * Authority: Untitled-1.md, approved Phase 3 recognition/rating integration.
 * Ownership: Shared artifact scorer; callers own canonical names and rating inheritance.
 * Invariants: Absolute strongest base/max, higher enabled axis per perk,
 * one selected Showcase line, earliest-line tie handling.
 * Constraints: No DOM, storage, capture, recognition, or alternative rating algorithm.
 * History: Extracted from app.js without changing established calculation behavior.
 */
(() => {
  "use strict";
  function text(v) {
    if (v == null) return "";
    return String(v).trim();
  }
  /** Parse a perk base/max field to a finite number, or null. */
  function parseStatNum(v) {
    const raw = text(v).replace(/,/g, "").replace(/%/g, "");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Strongest available magnitude among base/max (absolute value).
   * Missing side is ignored; both missing → 0.
   */
  function perkMagnitude(base, max) {
    const nums = [parseStatNum(base), parseStatNum(max)].filter((n) => n != null);
    if (!nums.length) return 0;
    return Math.max(...nums.map((n) => Math.abs(/** @type {number} */ (n))));
  }

  /**
   * @typedef {{
   *   index: number,
   *   name: string,
   *   base: string,
   *   max: string,
   *   mag: number,
   *   offRating: number,
   *   defRating: number,
   *   offensive: number,
   *   defensive: number
   * }} PerkLineScore
   */

  /** @returns {PerkLineScore[]} */
  function perkLines(row, { canonPerk, ratingOf }) {
    /** @type {PerkLineScore[]} */
    const lines = [];
    for (let i = 1; i <= 6; i++) {
      const rawName = text(row[`perk_${i}_name`]);
      const name = canonPerk(rawName);
      const base = text(row[`perk_${i}_base`]);
      const max = text(row[`perk_${i}_max`]);
      if (!rawName && !base && !max) continue;
      const mag = perkMagnitude(base, max);
      const offRating = name ? ratingOf(name, "offensive") : 0;
      const defRating = name ? ratingOf(name, "defensive") : 0;
      lines.push({
        index: lines.length,
        name,
        base,
        max,
        mag,
        offRating,
        defRating,
        offensive: offRating * mag,
        defensive: defRating * mag,
      });
    }
    return lines;
  }

  /** Active-axis line score for Best-line selection. */
  function lineActiveScore(line, prefSortAxes) {
    if (prefSortAxes.offensive && prefSortAxes.defensive) return Math.max(line.offensive, line.defensive);
    return prefSortAxes.offensive ? line.offensive : prefSortAxes.defensive ? line.defensive : 0;
  }

  /**
   * @returns {{
   *   lines: PerkLineScore[],
   *   bestIndex: number,
   *   offensive: number,
   *   defensive: number,
   *   preference: number
   * }}
   */
  function score(row, { canonPerk, ratingOf, scoreMode, prefSortAxes }) {
    const lines = perkLines(row, { canonPerk, ratingOf });
    if (!lines.length) {
      return { lines, bestIndex: -1, offensive: 0, defensive: 0, preference: 0 };
    }
    if (scoreMode === "maxrow") {
      let bestIndex = 0;
      let bestActive = lineActiveScore(lines[0], prefSortAxes);
      for (let i = 1; i < lines.length; i++) {
        const active = lineActiveScore(lines[i], prefSortAxes);
        if (active > bestActive) {
          bestActive = active;
          bestIndex = i;
        }
      }
      const best = lines[bestIndex];
      return {
        lines,
        bestIndex,
        offensive: best.offensive,
        defensive: best.defensive,
        preference: bestActive,
      };
    }
    let offensive = 0;
    let defensive = 0;
    for (const line of lines) {
      offensive += line.offensive;
      defensive += line.defensive;
    }
    const preference = lines.reduce((total, line) => total + lineActiveScore(line, prefSortAxes), 0);
    return { lines, bestIndex: -1, offensive, defensive, preference };
  }


  // Ordinary crafting/reroll families, reviewed 2026-10-17. These are separate
  // from the Legendary/Mythical catalogue. Source and scope: docs/artifact-rerolls.md.
  const troops=['Heavy Infantry','Ranged Infantry','Heavy Cavalry','Raider','Wall Sapper','Ranged Siege','Mortar Troop','Attack Helicopter','Machine Gun Infantry','Guerrilla','Heavy Tank','Bazooka','APC','Armored Car','Assault Vehicle','MRL','Fighter','Bomber','Paratrooper'];
  const hitpoints=[...troops,'Supply Vehicle','Tactical Helicopter'].map(unit=>unit+' Hitpoints');
  const damage=[...troops.map(unit=>unit+' Damage'),'Supply Vehicle Healing','Tactical Helicopter Healing'];
  const buildings=['Tower','Catapult','Anti-Tank Gun','Redoubt','Sniper Tower','Air Defense','Missile Silo'].flatMap(building=>[building+' Damage',building+' Hitpoints']);
  const enemyBuildings=buildings.map(name=>'Enemy '+name);
  const generals=["Generals' Damage","Generals' Hitpoints"];
  const invadingHP=[...hitpoints.map(name=>'Invading '+name),'Invading Transport Hitpoints'];
  const invadingDamage=damage.map(name=>'Invading '+name);
  const ordinaryPools={
    main:{
      weapon:[...damage,...hitpoints,...generals,'Enemy Defender Spawn Time','Defender Spawn Time'],
      armor:[...invadingHP,...invadingDamage,...generals.map(name=>'Invading '+name),'Defender Damage','Defender Hitpoints'],
      jewelry:[...enemyBuildings,'Gold Looted','Food Looted','Oil Looted','National Trade Good Loot Chance','All Resources Looted','Looted Resource Refund','Library Tech Gold Cost'],
      pottery:[...buildings,'Gold from Gold Mines','Food from Fruit Trees','All Resources from Hunting','Gold from Caravans','Food from Farms','Oil From Oil Wells','Vault Capacity','Vault Interest','Forest Expansion Cost Refund','Library Tech Food Cost','Library Tech Oil Cost'],
    },
    war:{
      weapon:[...damage,...invadingHP],
      armor:[...hitpoints,...invadingDamage],
      equipment:[...buildings,...enemyBuildings,...generals,...generals.map(name=>'Invading '+name),'All Defensive Towers Damage','All Defensive Towers Hitpoints','All Enemy Defensive Towers Damage','All Enemy Defensive Towers Hitpoints','Defender Damage','Defender Hitpoints','Defender Spawn Time','Enemy Defender Spawn Time'],
    },
  };
  function rerollPotential({hall,grade}={},options={}) {
    let category=text(grade).toLowerCase();
    hall=text(hall).toLowerCase();
    if(/^war[ -]/.test(category)){hall='war';category=category.replace(/^war[ -]/,'');}
    category=category.replace('armour','armor').replace('jewellery','jewelry');
    const pool=ordinaryPools[hall]?.[category],magnitude=hall==='war'?15:20;
    let target=-Infinity,stat=null,bestMagnitude=null;
    if(pool && options.ratingOf)for(const rawName of pool) {
      const name=options.canonPerk?options.canonPerk(rawName):rawName;
      const rating=lineActiveScore({offensive:options.ratingOf(name,'offensive'),defensive:options.ratingOf(name,'defensive')},options.prefSortAxes || {});
      const candidateMagnitude=rating<0?10:magnitude,value=candidateMagnitude*rating;
      if(Number.isFinite(value) && value>target){target=value;stat=name;bestMagnitude=candidateMagnitude;}
    }
    return {rerollTarget:Number.isFinite(target)?target:0,rerollStat:stat,rerollMagnitude:bestMagnitude,rerollPoolKnown:!!pool && !!options.ratingOf};
  }
  function withRerollPotential(base,{grade,eligible=[],rerollTarget:target=0,rerollStat=null,rerollMagnitude=null,rerollPoolKnown=false}={}) {
    const special=/legendary|mythical/i.test(String(grade || '')) || (base.axes && !base.axes.offensive && !base.axes.defensive);
    const active=line=>lineActiveScore(line,base.axes || {});
    // Callers provide their selected axes; older score objects can use an explicit
    // line preference assigned by the comparison adapter.
    const points=line=>Number.isFinite(line.preference)?line.preference:active(line);
    const gain=(line,i,possible=false)=>special || !rerollPoolKnown || (possible?eligible[i]===false:eligible[i]!==true)?0:Math.max(0,target-points(line));
    const rerollGains=base.lines.map((line,i)=>gain(line,i)),possibleRerollGains=base.lines.map((line,i)=>gain(line,i,true));
    const sum=values=>values.reduce((total,value)=>total+value,0);
    const rerollGain=sum(rerollGains),possibleGain=sum(possibleRerollGains);
    const index=rerollGain>0?rerollGains.indexOf(Math.max(...rerollGains)):-1;
    return {...base,basePreference:base.preference,potentialPreference:base.preference+rerollGain,
      possiblePotentialPreference:base.preference+possibleGain,rerollGain,rerollGains,possibleRerollGains,rerollIndex:index,
      rerollTarget:target,rerollStat,rerollMagnitude,rerollPoolKnown,rerollUncertain:possibleGain>rerollGain || !special && !rerollPoolKnown && eligible.some(value=>value!==false),
      rerollUnknown:special?0:base.lines.filter((_,i)=>eligible[i]!==true && eligible[i]!==false).length};
  }
  function comparisonScore(row,options,{hall,grade,eligible=[]}={}) {
    const base=score(row,{...options,scoreMode:'combined'});
    return withRerollPotential({...base,axes:options.prefSortAxes,
      lines:base.lines.map(line=>({...line,preference:lineActiveScore(line,options.prefSortAxes)}))},{grade,eligible,...rerollPotential({hall,grade},options)});
  }
  function craftingAxes(selected,{hall,type}={}) {
    const axes={offensive:selected?.offensive!==false,defensive:selected?.defensive!==false};
    if(!axes.offensive && !axes.defensive)return axes;
    const category=String(type || '').trim().replace(/^war[ -]/i,'').toLowerCase();
    if(String(hall).toLowerCase()==='main') {
      if(['armor','pottery'].includes(category))return {offensive:false,defensive:true};
      if(['jewelry','jewellery'].includes(category))return {offensive:true,defensive:false};
    }
    return axes;
  }
  window.DNArtifactScoring = { score, perkLines, lineActiveScore, withRerollPotential, comparisonScore, rerollPotential, craftingAxes };
})();
