// Exhaustive ordered-card oracle, independent of the calculator's DP.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={window:{}};vm.createContext(app);vm.runInContext(fs.readFileSync('ui/crafting-probability.js','utf8'),app);const P=app.window.DNCraftingProbability;
const names=['A','B','C'],perk=[.2,.3,.5],tier=[.5,.25,.25],magnitudes=[1,6,11];
const data={hall:'main',category:'Weapon',artifacts:1000,rows:5000,perks:names.map((name,i)=>({name,rows:perk[i]*5000})),profiles:{event:{artifacts:1000,tiers:[2500,1250,1250]}}};
const z=[];for(let n=0;n<=5;n++){let total=0;function colors(counts,left,p){if(!left){total+=p;return;}for(let t=0;t<3;t++)if(counts[t]<2){const next=[...counts];next[t]++;colors(next,left-1,p*tier[t]);}}colors([0,0,0],n,1);z[n]=total;}
const cards=[];function make(rows,counts,p){if(rows.length===5){const n=names.map((_,k)=>rows.filter(r=>Math.floor(r/3)===k).length);cards.push({rows,p:p/n.reduce((product,count)=>product*z[count],1)});return;}for(let r=0;r<9;r++)if(counts[r]<2){const next=[...counts];next[r]++;make([...rows,r],next,p*perk[Math.floor(r/3)]*tier[r%3]);}}make([],Array(9).fill(0),1);
assert(Math.abs(cards.reduce((sum,c)=>sum+c.p,0)-1)<1e-10);
function brute(requirements){const req=P.validate(requirements);let probability=0;for(const card of cards){
 const matches=(row,r,selected=r.perks)=>selected.includes(names[Math.floor(row/3)])&&(r.tier==null||r.tier==='max'||r.tier===magnitudes[row%3]);
 if(req.some(r=>r.mode==='combined'&&r.match==='exact'&&card.rows.filter(row=>matches(row,r)).length!==r.count))continue;
 function assign(i,used){if(i===req.length)return true;const r=req[i],groups=r.mode==='same'?r.perks.map(name=>[name]):[r.perks];for(const selected of groups){
  if(r.mode==='same'&&r.match==='exact'&&card.rows.filter(row=>matches(row,r,selected)).length!==r.count)continue;
  const available=card.rows.map((row,j)=>!(used>>j&1)&&matches(row,r,selected)?j:-1).filter(j=>j>=0);
  function choose(start,left,indexes){if(!left){if(r.tier==='max'){const actual=[0,0,0];for(const index of indexes)actual[card.rows[index]%3]++;const max=P.maximum(r);if(actual.some((n,t)=>n!==max[t]))return false;}return assign(i+1,used|indexes.reduce((mask,j)=>mask|1<<j,0));}for(let k=start;k<available.length;k++)if(choose(k+1,left-1,[...indexes,available[k]]))return true;return false;}
  if(choose(0,r.count,[]))return true;
 }return false;}
 if(assign(0,0))probability+=card.p;
 }return probability;}
const r=(perks,count,tier='max',mode='combined',match='atLeast')=>({perks,count,tier,mode,match});
const cases=[[r(['A'],3)],[r(['A'],3,'max','combined','exact')],[r(['A','B'],3)],[r(['A','B'],3,'max','same')],[r(['A','B'],2,'max','same')],[r(['A','B'],2,'max','same'),r(['B','C'],2)],[r(['A'],2,null,'combined','exact'),r(['B'],2)],[r(['A'],3,11)],[r(['A','B'],5)]];
for(const req of cases){const actual=P.calculate(data,req,'event').probability,expected=brute(req);assert(Math.abs(actual-expected)<1e-10,JSON.stringify({req,actual,expected}));}
console.log('Capped-tier model: '+cases.length+' exhaustive ordered-card comparisons passed, including overlapping groups and same-perk Max.');
