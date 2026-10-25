/* Conditional randomization of perk names within category, period and row.
 * Preserves observed perk prevalence and row-specific pools under the null. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const app={window:{}};vm.createContext(app);
for(const f of ['data/artifact_stat_context','crafted-log-stats','crafting-community'])vm.runInContext(fs.readFileSync('ui/'+f+'.js','utf8'),app);
const C=app.window.DNCraftingCommunity,rules=C.rules(),plan=JSON.parse(fs.readFileSync('data/temp/historical-crafting/plan.json'));
const eligible=plan.workspace.craftingLog.items.filter(i=>i.hall==='main'&&!C.encode(i,rules).exclusion);
const trials=4999;
let seed=719301;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function analyze(items){
  const names=[...new Set(items.flatMap(i=>C.encode(i,rules).rows.map(r=>r.perk)))].sort(),index=new Map(names.map((s,i)=>[s,i]));
  const groups=new Map(),counts=names.map(name=>({name,rows:0,items:0,copies:[0,0,0,0,0,0],pairs:0,expectedPairs:0,expectedRepeatedItems:0}));
  for(const item of items){const key=item.type+'|'+(item.firstSeen<'2026-10-19'?'event':'normal');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(C.encode(item,rules).rows.map(r=>index.get(r.perk)));}
  for(const rows of groups.values()){
    const columns=Array.from({length:5},(_,c)=>rows.map(row=>row[c]));
    for(const row of rows){const freq=new Map();for(const s of row)freq.set(s,(freq.get(s)||0)+1);for(const [s,k]of freq){const r=counts[s];r.rows+=k;r.items++;r.copies[k]++;r.pairs+=k*(k-1)/2;}}
    for(let s=0;s<names.length;s++){
      const probs=columns.map(col=>col.filter(v=>v===s).length/rows.length);let dist=[1];
      for(const p of probs){const next=Array(dist.length+1).fill(0);for(let j=0;j<dist.length;j++){next[j]+=dist[j]*(1-p);next[j+1]+=dist[j]*p;}dist=next;}
      counts[s].expectedRepeatedItems+=rows.length*(1-dist[0]-dist[1]);
      for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)counts[s].expectedPairs+=rows.length*probs[a]*probs[b];
    }
  }
  const groupsColumns=[...groups].map(([key,rows])=>({key,columns:Array.from({length:5},(_,c)=>rows.map(row=>row[c]))}));
  const exceed=new Int32Array(names.length),nullTotals=[],categoryNull={},observedCategories={};
  for(const [key,rows]of groups){const cat=key.split('|')[0];observedCategories[cat]??={artifacts:0,repeatedArtifacts:0,pairs:0,copies:[0,0,0,0,0,0]};const r=observedCategories[cat];r.artifacts+=rows.length;for(const row of rows){const freq=new Map();for(const s of row)freq.set(s,(freq.get(s)||0)+1);if(freq.size<5)r.repeatedArtifacts++;for(const k of freq.values()){r.pairs+=k*(k-1)/2;if(k>=2)r.copies[k]++;}}}
  for(let t=0;t<trials;t++){
    const pairs=new Int32Array(names.length),catPairs={};
    for(const {key,columns}of groupsColumns){const cat=key.split('|')[0];catPairs[cat]??=0;
      for(const col of columns)for(let k=col.length-1;k>0;k--){const j=Math.floor(random()*(k+1));[col[k],col[j]]=[col[j],col[k]];}
      for(let row=0;row<columns[0].length;row++)for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)if(columns[a][row]===columns[b][row]){pairs[columns[a][row]]++;catPairs[cat]++;}
    }
    let total=0;for(let s=0;s<names.length;s++){total+=pairs[s];if(pairs[s]>=counts[s].pairs)exceed[s]++;}nullTotals.push(total);
    for(const [cat,n]of Object.entries(catPairs))(categoryNull[cat]??=[]).push(n);
  }
  const quantile=(list,p)=>[...list].sort((a,b)=>a-b)[Math.floor(p*(list.length-1))];
  for(let s=0;s<names.length;s++){const r=counts[s];r.repeatedItems=r.copies.slice(2).reduce((a,b)=>a+b,0);r.p=(exceed[s]+1)/(trials+1);r.repeatShare=r.repeatedItems/r.items;}
  const sorted=[...counts].sort((a,b)=>a.p-b.p);let q=1;for(let i=sorted.length-1;i>=0;i--){q=Math.min(q,sorted[i].p*sorted.length/(i+1));sorted[i].q=q;}
  const observedPairs=counts.reduce((n,r)=>n+r.pairs,0);
  return {artifacts:items.length,perks:names.length,observedPairs,expectedPairs:counts.reduce((n,r)=>n+r.expectedPairs,0),null95:[quantile(nullTotals,.025),quantile(nullTotals,.975)],p:(1+nullTotals.filter(n=>n>=observedPairs).length)/(trials+1),categories:Object.fromEntries(Object.entries(observedCategories).map(([cat,r])=>[cat,{...r,null95:[quantile(categoryNull[cat],.025),quantile(categoryNull[cat],.975)],p:(1+categoryNull[cat].filter(n=>n>=r.pairs).length)/(trials+1)}])),perStat:counts.sort((a,b)=>b.repeatedItems-a.repeatedItems)};
}
const seen=new Set(),unique=eligible.filter(i=>{const key=JSON.stringify([i.type,C.encode(i,rules).rows]);if(seen.has(key))return false;seen.add(key);return true;});
const report={trials,method:'Shuffle names independently in each row position within category and event/normal period; test pair counts; Benjamini–Hochberg adjustment across all observed perks.',all:analyze(eligible),direct:analyze(eligible.filter(i=>i.rows.every(r=>!r.assumed&&!r.inferred))),uniqueRollsSensitivity:analyze(unique)};
fs.writeFileSync('data/temp/historical-crafting/repeat-analysis.json',JSON.stringify(report,null,2)+'\n');
for(const [mode,r]of Object.entries(report)){if(!r?.perStat)continue;console.log(JSON.stringify({mode,...r,perStat:r.perStat.slice(0,14),significant:r.perStat.filter(s=>s.q<.05)},null,2));}
