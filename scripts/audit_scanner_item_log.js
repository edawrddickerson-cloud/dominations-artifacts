/* Read-only audit of complete exported encounters, distinct from raw OCR passes.
 * Repeated signatures are identity-review candidates, never automatic merges.
 * Exported OCR is not ground truth; conditional expectations are not corrections. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const context=require('../ui/artifact-stat-context.js').create(require('../data/artifact_stat_context.json'));
function audit(data){
  if(data.version!==2 || !Array.isArray(data.items) || !Array.isArray(data.scans))throw new Error('Expected a full version-2 item log with items and scans.');
  const known=row=>!!row?.known && !row.assumed && !!context.lookup(row.name);
  const numeric=row=>Number.isFinite(row?.value);
  const inferred=row=>!!row.inferred || !!row.inferredFields?.includes('value');
  const direct=row=>numeric(row) && row.hasPercent!==false && !inferred(row) && !row.estimated;
  const conflict=row=>!!(row.conflict || row.tierConflict || row.outOfRange);
  const canonical=row=>context.lookup(row.name)?.name || row.name;
  const rows=data.items.flatMap((item,index)=>item.rows.map((row,offset)=>({item:index+1,row:offset+1,value:row,
    evidence:context.assess(row,{hall:item.hall,type:item.type,freshCraft:item.freshCraft===true})})));
  const count=predicate=>rows.filter(({value:row})=>predicate(row)).length;
  const complete=predicate=>data.items.filter(item=>item.rows.length===item.expectedRows && item.rows.every(predicate)).length;
  const groups=new Map(),sessions=new Map(),duplicateRows=[],adjacent=[],statEvidence=new Map();
  for(const [index,item] of data.items.entries()){
    const sessionKey=String(item.id).split(':')[0];
    if(!sessions.has(sessionKey))sessions.set(sessionKey,{session:sessions.size+1,items:0,firstItem:index+1,firstSeen:item.firstSeen,lastSeen:item.firstSeen,readerValid:0,missingCategory:0});
    const session=sessions.get(sessionKey);session.items++;session.lastSeen=item.firstSeen;session.readerValid+=!!item.validated;session.missingCategory+=!item.type;
    const names=new Map();
    for(const row of item.rows){
      if(!known(row))continue;const name=canonical(row);names.set(name,(names.get(name)||0)+1);
      const key=JSON.stringify([name,item.hall]);
      if(!statEvidence.has(key))statEvidence.set(key,{name,hall:item.hall,rows:0,directValues:0,inferredValues:0,values:[],reviewedAvailability:context.lookup(name).ordinary_availability[item.hall]?.status || 'unknown'});
      const stat=statEvidence.get(key);stat.rows++;stat.directValues+=direct(row);stat.inferredValues+=numeric(row)&&inferred(row);
      if(numeric(row) && !stat.values.includes(row.value))stat.values.push(row.value);
    }
    const repeated=[...names].filter(([,number])=>number>1);if(repeated.length)duplicateRows.push({item:index+1,repeated});
    if(item.rows.length===item.expectedRows && item.rows.every(row=>known(row)&&numeric(row))){
      const key=JSON.stringify([item.hall,item.type,item.rows.map(row=>[canonical(row),row.value])]);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index+1);
    }
    if(!index)continue;
    const previous=data.items[index-1],gap=Date.parse(item.firstSeen)-Date.parse(previous.lastUpdated);
    if(item.hall!==previous.hall || item.type && previous.type && item.type!==previous.type || !Number.isFinite(gap) || gap<0 || gap>10000 || item.rows.length!==previous.rows.length)continue;
    let matching=0,contradictions=0;
    item.rows.forEach((row,offset)=>{
      const prior=previous.rows[offset];if(!known(row)||!known(prior))return;
      if(canonical(row)!==canonical(prior) || numeric(row)&&numeric(prior)&&row.value!==prior.value)contradictions++;
      else if(numeric(row)&&numeric(prior))matching++;
    });
    if(matching>=3 && !contradictions)adjacent.push({items:[index,index+1],gapMs:gap,matchingRows:matching});
  }
  const tally=key=>{const counts={};for(const item of data.items){const value=String(item[key]??'unknown');counts[value]=(counts[value]||0)+1;}return counts;};
  const range=values=>{const sorted=values.filter(Boolean).sort();return {first:sorted[0] || null,last:sorted.at(-1) || null};};
  const contextConflicts=rows.filter(row=>row.evidence.issues.length).map(({item,row,value,evidence})=>({item,row,name:value.name,value:value.value,raw:value.raw,colour:value.colour,
    inferred:inferred(value),issues:evidence.issues,conditionalExpectedValue:evidence.expectedValue}));
  const invalidStartingValues=rows.filter(({item,value:row})=>data.items[item-1].freshCraft===true && known(row) && numeric(row) &&
    !context.tierBases({hall:data.items[item-1].hall,type:data.items[item-1].type,crafting:true})?.includes(Math.abs(row.value)))
    .filter(({item})=>context.tierBases({hall:data.items[item-1].hall,type:data.items[item-1].type,crafting:true}));
  return {scope:'Text-only historical export. Counts describe recorded evidence, not verified OCR accuracy or unique physical artifacts. No user data or stat rules changed.',
    capturedItems:range(data.items.map(item=>item.firstSeen)),capturedReads:range(data.scans.map(scan=>scan.timestamp)),
    summary:{items:data.items.length,scans:data.scans.length,labelSummaries:data.labels?.length || 0,sessions:sessions.size,rows:rows.length,halls:tally('hall'),categories:tally('type'),
      readerValid:data.items.filter(item=>item.validated).length,manuallyCorrected:data.items.filter(item=>item.corrected).length,
      freshCraftExplicit:data.items.filter(item=>item.freshCraft===true).length,missingCategory:data.items.filter(item=>!item.type).length,
      allNamesRecognised:complete(known),allValuesNumeric:complete(numeric),allNamesAndValuesPresentIncludingInference:complete(row=>known(row)&&numeric(row)),
      allNamesAndValuesDirect:complete(row=>known(row)&&direct(row)),allNamesAndValuesDirectWithoutConflict:complete(row=>known(row)&&direct(row)&&!conflict(row)),
      recognisedNames:count(known),unclearNames:count(row=>!known(row)),numericValues:count(numeric),directNumericValues:count(direct),inferredValues:count(row=>numeric(row)&&inferred(row)),missingValues:count(row=>!numeric(row)),
      inferredValuesWithAssumedName:count(row=>numeric(row)&&inferred(row)&&row.assumed),missingValuesWithRecognisedName:count(row=>!numeric(row)&&known(row)),
      conflictRows:count(conflict),weakConfidenceRows:count(row=>Number.isFinite(row.confidence)&&row.confidence<80),missingConfidenceRows:count(row=>!Number.isFinite(row.confidence)),
      itemsMissingStarCount:data.items.filter(item=>item.unlocked?.count==null).length,itemsWithRepeatedStats:duplicateRows.length,
      repeatedCompleteSignatureGroups:[...groups.values()].filter(group=>group.length>1).length,nearbyIdentityReviewPairs:adjacent.length,
      contextConflictRows:contextConflicts.length,invalidFreshStartingValues:invalidStartingValues.length,
      uniqueConditionalExpectedValues:rows.filter(row=>row.evidence.expectedValue!==null).length,
      recordedContextRows:count(row=>!!row.statContext),scansWithFieldReads:data.scans.filter(scan=>scan.observations.some(observation=>observation.fieldReads)).length},
    contextConflicts,invalidStartingValues:invalidStartingValues.map(({item,row,value})=>({item,row,name:value.name,value:value.value})),
    repeatedCompleteSignatures:[...groups.values()].filter(group=>group.length>1).map(items=>({items,unlockedCounts:[...new Set(items.map(index=>data.items[index-1].unlocked?.count ?? null))],rows:data.items[items[0]-1].rows.map(row=>({name:canonical(row),value:row.value}))})),
    nearbyIdentityReviewPairs:adjacent,itemsWithRepeatedStats:duplicateRows,sessions:[...sessions.values()],
    statEvidence:[...statEvidence.values()].map(stat=>({...stat,values:stat.values.sort((a,b)=>a-b)})).sort((a,b)=>a.name.localeCompare(b.name)),
    evidenceSummary:context.summarizeObservations(data),
    limits:['No screenshots are present, so an apparently complete item is not a verified correct item.','Counts of direct values reflect stored provenance, not an independent pixel review.','Matching signatures and nearby compatible entries do not prove the same physical copy.','Colour-based expectations are conditional; conflicting valid numbers may indicate a colour classification failure.','This Main crafting history cannot establish War tiers, owned-item upgrades or equipped slots.']};
}
if(require.main===module){
  const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
  const input=option('input'),output=option('report');if(!input||!output)throw new Error('Use --input=EXPORT.json --report=reports/NAME.json');
  const target=path.resolve(root,output);if(!target.startsWith(path.join(root,'reports')+path.sep)||path.extname(target)!=='.json')throw new Error('Report must be JSON inside reports/.');
  const raw=fs.readFileSync(input),data=JSON.parse(raw),report={version:1,source:{filename:path.basename(input),bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex'),exportedAt:data.exportedAt},...audit(data)};
  fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:target,source:report.source,capturedReads:report.capturedReads,summary:report.summary},null,2));
}
module.exports={audit};
