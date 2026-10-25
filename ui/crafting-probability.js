/* Five-row model: independent perk choices, capped tier allocations per perk.
 * Perk frequencies and scenario tiers are separate; no capture/log mutations. */
(() => {
  'use strict';
  const factorial=[1,1,2,6,24,120],categories={main:['Weapon','Armor','Jewelry','Pottery'],war:['Weapon','Armor','Equipment']};
  const calibration={id:'inferred-october-2026-v1',event:['2026-10-13T00:00:00.000Z','2026-10-19T00:00:00.000Z'],normal:['2026-10-20T00:00:00.000Z','2026-10-25T00:00:00.000Z']};
  function maximum(requirement){
    const copies=requirement.mode==='same'?1:new Set(requirement.perks).size,quota=[0,0,0];let remaining=requirement.count;
    for(let tier=2;tier>=0;tier--){quota[tier]=Math.min(remaining,2*copies);remaining-=quota[tier];}return quota;
  }
  function model(records,hall,category){
    const C=window.DNCraftingCommunity,index=C.rules(),sample=[];
    for(const item of records || []){const e=C.encode(item,index);if(e.hall===hall && e.category===category.toLowerCase() && !e.exclusion && !e.deleted)sample.push(e);}
    const perks=new Map(),profiles={event:{artifacts:0,tiers:[0,0,0]},normal:{artifacts:0,tiers:[0,0,0]}};
    const magnitudes=hall==='war'?[1,3,6]:[1,6,11];
    for(const item of sample){
      const at=Date.parse(item.observed_at),period=Object.keys(profiles).find(key=>at>=Date.parse(calibration[key][0])&&at<Date.parse(calibration[key][1]));
      if(period)profiles[period].artifacts++;
      for(const row of item.rows){perks.set(row.perk,(perks.get(row.perk)||0)+1);if(period)profiles[period].tiers[magnitudes.indexOf(Math.abs(row.value))]++;}
    }
    return {version:1,hall,category,artifacts:sample.length,rows:sample.length*5,perks:[...perks].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,rows])=>({name,rows})),profiles,calibration};
  }
  function validate(requirements){
    if(!Array.isArray(requirements)||!requirements.length||requirements.length>5)throw Error('Add 1–5 requirements.');
    const result=requirements.map(r=>{
      const names=[...new Set(r.perks || [])];
      if(!names.length || names.some(n=>typeof n!=='string'||!n))throw Error('Select a perk for each requirement.');
      if(!Number.isInteger(r.count)||r.count<1||r.count>5)throw Error('Counts must be 1–5.');
      if(!['atLeast','exact'].includes(r.match)||!['combined','same'].includes(r.mode))throw Error('Invalid requirement.');
      if(r.tier!=null && r.tier!=='max' && ![1,3,6,11].includes(r.tier))throw Error('Invalid tier.');
      return {...r,perks:names,mode:names.length===1||r.count===1&&r.match!=='exact'?'combined':r.mode};
    });
    if(result.reduce((sum,r)=>sum+r.count,0)>5)throw Error('Requirements exceed five rows.');
    return result;
  }
  function calculate(data,requirements,scenario='normal',attempts=1){
    const req=validate(requirements),magnitudes=data.hall==='war'?[1,3,6]:[1,6,11],usesTiers=req.some(r=>r.tier!=null);
    if(!['normal','event'].includes(scenario))throw Error('Select an event scenario.');
    if(req.some(r=>r.tier!=null&&r.tier!=='max'&&!magnitudes.includes(r.tier)))throw Error('Select a tier available in this Hall.');
    if(!Number.isSafeInteger(attempts)||attempts<1||attempts>1000000000)throw Error('Crafts planned must be 1–1,000,000,000.');
    if(!data.artifacts || !data.rows)return {status:'insufficient',reason:'Insufficient data'};
    const observed=new Map(data.perks.map(p=>[p.name,p.rows])),selected=new Set(req.flatMap(r=>r.perks));
    if([...selected].some(name=>!observed.has(name)))return {status:'insufficient',reason:'No sample: '+[...selected].filter(name=>!observed.has(name)).join(', ')};
    let profile=data.profiles?.[scenario],historicalTiers=false;
    if(usesTiers){
      const historical=window.DN_CRAFTING_PROBABILITY_CALIBRATION?.halls?.[data.hall]?.[data.category]?.profiles?.[scenario];
      if(historical?.artifacts && (!profile?.artifacts || profile.artifacts<20 || profile.tiers.some(n=>!n))){profile=historical;historicalTiers=true;}
      if(!profile?.artifacts)return {status:'insufficient',reason:'Insufficient tier data'};
    }
    const tierCounts=usesTiers?profile.tiers:[1],tierTotal=tierCounts.reduce((a,b)=>a+b,0),tiers=usesTiers?magnitudes:[null];
    if(!tierTotal)return {status:'insufficient',reason:'Insufficient tier data'};
    if(usesTiers&&tierCounts.some(n=>!n))return {status:'insufficient',reason:'Insufficient tier data'};
    const pools=[];let other=1;
    // Combined selections with identical memberships can share one probability
    // bucket. Same-perk selections must retain individual perk identities.
    const merged=new Map();
    for(const [name,rows]of observed){
      const membership=req.map(r=>r.perks.includes(name)),p=rows/data.rows;
      if(!membership.some(Boolean))continue;
      other-=p;
      const key=usesTiers||membership.some((yes,i)=>yes&&req[i].mode==='same')?name:membership.map(Number).join('');
      if(!merged.has(key))merged.set(key,{membership,p:0});merged.get(key).p+=p;
    }
    pools.push(...merged.values());if(other>1e-14)pools.push({membership:req.map(()=>false),p:Math.max(0,other)});
    const targets=[],blocks=req.map(r=>{
      const values=r.tier==='max'&&r.mode==='combined'?maximum(r):[r.count],start=targets.length;targets.push(...values);return values.map((_,i)=>start+i);
    }),radix=targets.map(n=>n+1),multipliers=[];let states=1;
    for(const base of radix){multipliers.push(states);states*=base;}
    const decode=n=>targets.map((_,i)=>Math.floor(n/multipliers[i])%radix[i]),encode=a=>a.reduce((sum,n,i)=>sum+n*multipliers[i],0),goal=states-1;
    const configurations=[];
    function configs(counts,remaining){if(counts.length===tiers.length){const n=counts.reduce((a,b)=>a+b,0);configurations.push({counts,n});return;}for(let n=0;n<=remaining;n++)configs([...counts,n],remaining-n);}
    configs([],5);
    // Keep the empirical perk-count distribution. For n copies of a perk,
    // normalize tier probabilities over allocations with at most two per tier.
    // This models the reported cap without claiming the game's reroll algorithm.
    const normalizers=Array(6).fill(usesTiers?0:1);
    if(usesTiers)for(const config of configurations)if(config.counts.every(n=>n<=2))normalizers[config.n]+=factorial[config.n]*config.counts.reduce((weight,n,t)=>weight*Math.pow(tierCounts[t]/tierTotal,n)/factorial[n],1);
    if(normalizers.some(n=>!n))return {status:'insufficient',reason:'Insufficient tier data'};
    // A state stores ALL feasible disjoint assignments, not one chosen matching.
    // This determinization counts an outcome once even when groups overlap.
    let dp=new Map([['0|0|0',{n:0,exact:req.map(()=>0),feasible:[0],weight:1}]]),operations=0;
    const transitions=new Map();
    for(const pool of pools){
      const constrained=usesTiers&&pool.membership.some(Boolean),next=new Map();
      const choices=usesTiers&&!constrained?Array.from({length:6},(_,n)=>({n,counts:[n,0,0],weight:Math.pow(pool.p,n)/factorial[n]})):configurations.filter(config=>!constrained||config.counts.every(n=>n<=2)).map(config=>({...config,weight:config.counts.reduce((weight,n,t)=>weight*Math.pow(pool.p*tierCounts[t]/tierTotal,n)/factorial[n],1)/(constrained?normalizers[config.n]:1)})).filter(c=>c.weight>0);
      for(const state of dp.values())for(const config of choices){
        if(state.n+config.n>5)continue;
        if(++operations>5000000)throw Error('Reduce overlapping perk groups.');
        const matching=req.map((r,i)=>pool.membership[i]?config.counts.reduce((sum,n,t)=>sum+(r.tier==null||r.tier==='max'||r.tier===tiers[t]?n:0),0):0);
        const exact=state.exact.map((n,i)=>n+(req[i].match==='exact'&&req[i].mode==='combined'?matching[i]:0));
        if(exact.some((n,i)=>n>req[i].count))continue;
        const cacheKey=pool.membership.map(Number).join('')+'|'+config.counts.join(',')+'|'+state.feasible.join(',');
        let feasible=transitions.get(cacheKey);
        if(!feasible){
          const possibilities=new Set();
          for(const code of state.feasible){
            const assigned=decode(code);
            function allocate(i,remaining){
              if(i===req.length){possibilities.add(encode(assigned));return;}
              const r=req[i],dimensions=blocks[i],old=dimensions.map(d=>assigned[d]),leftByTier=dimensions.map((d,t)=>targets[d]-old[t]),needed=leftByTier.reduce((a,b)=>a+b,0),maxCombined=r.tier==='max'&&r.mode==='combined';
              if(!pool.membership[i]||!needed){allocate(i+1,remaining);return;}
              const allowed=remaining.map((_,t)=>r.tier==null||r.tier==='max'||r.tier===tiers[t]),available=remaining.reduce((sum,n,t)=>sum+(allowed[t]?n:0),0);
              function take(t,left,chosen,amount){
                if(t===remaining.length){if(!left){
                  dimensions.forEach((d,j)=>assigned[d]=old[j]+(maxCombined?chosen[j]:chosen.reduce((a,b)=>a+b,0)));
                  allocate(i+1,remaining.map((n,j)=>n-chosen[j]));dimensions.forEach((d,j)=>assigned[d]=old[j]);
                }return;}
                const cap=allowed[t]?Math.min(remaining[t],left,maxCombined?leftByTier[t]:5):0;
                const forced=r.tier==='max'&&r.mode==='same'&&amount?maximum(r)[t]:null;
                for(let n=forced??0;n<=(forced??cap);n++)if(n<=cap)take(t+1,left-n,[...chosen,n],amount);
              }
              const amounts=r.mode==='same'?(old[0]===0 && (r.match!=='exact'||matching[i]===r.count)?[0,r.count]:[0]):Array.from({length:Math.min(needed,available)+1},(_,n)=>n);
              for(const amount of amounts)if(amount<=available)take(0,amount,[],amount);
            }
            allocate(0,config.counts);
          }
          feasible=[...possibilities].sort((a,b)=>a-b);transitions.set(cacheKey,feasible);
        }
        const n=state.n+config.n,key=n+'|'+exact.join(',')+'|'+feasible.join(',');
        if(!next.has(key))next.set(key,{n,exact,feasible,weight:0});next.get(key).weight+=state.weight*config.weight;
      }
      dp=next;
    }
    let probability=0;
    for(const state of dp.values())if(state.n===5 && state.feasible.includes(goal) && req.every((r,i)=>r.match!=='exact'||r.mode!=='combined'||state.exact[i]===r.count))probability+=state.weight*factorial[5];
    probability=Math.max(0,Math.min(1,probability));
    const selectedRows=[...selected].reduce((n,name)=>n+observed.get(name),0),lowSample=[...selected].some(name=>observed.get(name)<20)||(usesTiers&&profile.artifacts<100);
    return {status:'ready',probability,oneIn:probability?1/probability:null,attemptChance:probability===1?1:-Math.expm1(attempts*Math.log1p(-probability)),artifacts:data.artifacts,selectedRows,tierArtifacts:usesTiers?profile.artifacts:null,lowSample,usesTiers,historicalTiers};
  }
  window.DNCraftingProbability={categories,calibration,model,maximum,validate,calculate};
})();
