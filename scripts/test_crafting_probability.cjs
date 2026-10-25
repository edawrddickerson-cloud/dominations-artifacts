const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={window:{}};vm.createContext(app);vm.runInContext(fs.readFileSync('ui/crafting-probability.js','utf8'),app);const P=app.window.DNCraftingProbability;
const data={hall:'main',category:'Weapon',artifacts:1000,rows:5000,perks:[{name:'A',rows:1000},{name:'B',rows:1500},{name:'C',rows:2500}],profiles:{event:{artifacts:1000,tiers:[2500,1250,1250]},normal:{artifacts:1000,tiers:[3000,1750,250]}}};
const r=(perks,count=1,tier=null,match='atLeast',mode='combined')=>({perks,count,tier,match,mode});
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const calculate=(req,scenario='normal')=>P.calculate(data,req,scenario).probability;
close(calculate([r(['A'],3)]),10*.2**3*.8**2+5*.2**4*.8+.2**5);
close(calculate([r(['A'],3,null,'exact')]),10*.2**3*.8**2);
close(calculate([r(['A','B'],3)]),.5);
close(calculate([r(['A'],3)],'event'),calculate([r(['A'],3)]));
// Closed-form capped tier allocations for 3, 4 and 5 copies of A.
const capped=10*.2**3*.8**2/18+5*.2**4*.8*.2+.2**5*.6;
close(calculate([r(['A'],2,11),r(['A'],1,6)],'event'),capped);
close(calculate([r(['A'],3,'max')],'event'),capped);
close(calculate([r(['A'],3,'max','exact')],'event'),10*.2**3*.8**2/18);
close(calculate([r(['A'],4,'max','exact')],'event'),5*.2**4*.8*.04);
close(calculate([r(['A'],5,'max')],'event'),.2**5*.2);
close(calculate([r(['A'],3,11)],'event'),0);
assert.deepEqual(Array.from(P.maximum(r(['A'],3,'max'))),[0,1,2]);
assert.deepEqual(Array.from(P.maximum(r(['A','B'],3,'max'))),[0,0,3]);
assert.deepEqual(Array.from(P.maximum(r(['A','B'],3,'max','atLeast','same'))),[0,1,2]);
// Independent exhaustive ordered-outcome oracle checks overlap and same-perk
// union semantics, including outcomes with several valid assignments.
function brute(req){let total=0;function walk(rows,p){if(rows.length<5){for(const[name,q]of [['A',.2],['B',.3],['C',.5]])walk([...rows,name],p*q);return;}const valid=req.every(r=>r.mode==='same'?r.perks.some(name=>{const n=rows.filter(s=>s===name).length;return r.match==='exact'?n===r.count:n>=r.count;}):r.match!=='exact'||rows.filter(s=>r.perks.includes(s)).length===r.count);if(!valid)return;function match(i,used){if(i===req.length)return true;const r=req[i],options=r.mode==='same'?r.perks.map(name=>[name]):[r.perks];for(const names of options){const indexes=rows.map((name,j)=>names.includes(name)&&!(used>>j&1)?j:-1).filter(j=>j>=0);function choose(k,left,mask){if(!left)return match(i+1,used|mask);for(let j=k;j<indexes.length;j++)if(choose(j+1,left-1,mask|1<<indexes[j]))return true;return false;}if(choose(0,r.count,0))return true;}return false;}if(match(0,0))total+=p;}walk([],1);return total;}
for(const req of [[r(['A','B'],3,null,'atLeast','same')],[r(['A','B'],2,null,'atLeast','same')],[r(['A','B'],2,null,'exact','same')],[r(['A','B'],2),r(['B','C'],2)],[r(['A'],2,null,'exact'),r(['A','B'],2)],[r(['A','B'],2,null,'atLeast','same'),r(['B','C'],2,null,'atLeast','same')]])close(calculate(req),brute(req));
close(calculate([r(['A'],2,null,'exact'),r(['A'],1)]),0);
assert.throws(()=>calculate([r(['A'],4),r(['B'],2)]),/exceed/);
assert.equal(P.calculate(data,[r(['unseen'],1)]).status,'insufficient');
assert.throws(()=>P.calculate({...data,hall:'war'},[r(['A'],1,11)]),/Hall/);
assert.equal(P.calculate({...data,profiles:{}},[r(['A'],1,11)]).status,'insufficient');
assert.equal(P.calculate({...data,profiles:{}},[r(['A'],1)]).status,'ready');
assert.equal(P.calculate({...data,profiles:{normal:{artifacts:100,tiers:[400,100,0]}}},[r(['A'],1,11)]).status,'insufficient');
close(P.calculate(data,[r(['A'],1)],'normal',10).attemptChance,1-(.8**5)**10);
const large={...data,perks:Array.from({length:136},(_,i)=>({name:'perk'+i,rows:100})),rows:13600};
close(P.calculate(large,[r(large.perks.map(p=>p.name),2,null,'atLeast','same')]).probability,1-135*134*133*132/136**4);
app.window.DN_CRAFTING_PROBABILITY_CALIBRATION={halls:{main:{Weapon:{profiles:data.profiles}}}};
const sparse={...data,profiles:{}};
const historical=P.calculate(sparse,[r(['A'],2,11)],'event');
assert.equal(historical.status,'ready');assert.equal(historical.historicalTiers,true);
close(historical.probability,P.calculate(data,[r(['A'],2,11)],'event').probability);
close(P.calculate(sparse,[r(['A'],3)],'event').probability,calculate([r(['A'],3)]));
assert.equal(P.calculate({...sparse,hall:'war'},[r(['A'],2,6)],'event').status,'insufficient');
console.log('Probability engine: analytic, exhaustive matching, tiers, sparse data and 136-perk group checks passed.');
