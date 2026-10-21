(async () => {
  const ui = {}, check = (name, passed) => { ui[name] = !!passed; if (!passed) throw Error(name); };
  const wait = async predicate => { for (let i=0;i<300;i++) { if (predicate()) return; await new Promise(resolve=>setTimeout(resolve,20)); } throw Error('Council UI timeout'); };
  await wait(()=>document.querySelector('input[data-layer="council"]'));
  const D=window.DN,C=window.DNCouncil, name='Heavy Tank Damage', axis='offensive';
  const input=(stat=name,layer='council',which=axis,doc=document)=>[...doc.querySelectorAll('input.rating-input')].find(i=>i.dataset.stat===stat&&i.dataset.layer===layer&&i.dataset.axis===which);
  const change=(element,value,event='change')=>{element.value=value;element.dispatchEvent(new Event(event,{bubbles:true}));};
  const search=value=>change(document.getElementById('ratings-q'),value,'input');
  const group=document.getElementById('ratings-group-by'),show=document.getElementById('ratings-show');
  const rowNames=()=>[...document.querySelectorAll('tr[data-stat]')].map(r=>r.dataset.stat);
  document.getElementById('header-war').click();
  check('Council Ratings lives under Council',document.querySelector('.site-nav [href="council-ratings.html"]').closest('.site-nav-section').querySelector('h2').textContent==='Council');
  check('Families are visible and collapsible',document.querySelectorAll('.council-rating-section').length>1);
  const collapsedSection=document.querySelector('.council-rating-section'),collapsedFamily=collapsedSection.dataset.family,collapsedStat=collapsedSection.querySelector('tr[data-stat]').dataset.stat;
  collapsedSection.open=false;
  await new Promise(resolve=>setTimeout(resolve,20));
  search(collapsedStat);check('Search reveals matching stats in collapsed families',document.querySelector('.council-rating-section').open);
  search('');check('Clearing search restores collapsed families',!document.querySelector('[data-family="'+collapsedFamily+'"]').open);
  document.querySelector('[data-family="'+collapsedFamily+'"]').open=true;
  const warNames=rowNames();document.getElementById('header-main').click();const mainNames=rowNames();
  check('Hall controls filter all Council stats',new Set([...warNames,...mainNames]).size===79&&JSON.stringify(warNames)!==JSON.stringify(mainNames));
  document.getElementById('header-war').click();
  if (!C.loadPrefSortAxes().offensive) document.getElementById('header-off').click();
  if (!C.loadPrefSortAxes().defensive) document.getElementById('header-def').click();
  document.getElementById('header-def').click();
  check('Base Type hides inactive-axis columns',!document.querySelector('[data-axis="defensive"]')&&!!input());
  document.getElementById('header-def').click();
  change(group,'none');
  document.querySelector('[data-sort-key="council:offensive"]').click();
  const priorNames=rowNames(), field=input();field.focus();
  const scroller=document.getElementById('ratings-scroll');scroller.scrollTop=120;
  const scroll=scroller.scrollTop;
  change(field,'-9');
  check('Edits preserve input, focus, order and scroll',field===input()&&document.activeElement===field&&JSON.stringify(rowNames())===JSON.stringify(priorNames)&&scroller.scrollTop===scroll);
  check('Negative Council overrides save',C.migrateRatings(C.loadRatingsRaw())[name].offensive===-9);
  change(field,'0');
  check('Explicit zero stays an override',C.migrateRatings(C.loadRatingsRaw())[name].offensive===0&&field.value==='0');
  change(field,'');
  check('Clearing restores inheritance',C.migrateRatings(C.loadRatingsRaw())[name]?.offensive==null&&field.value===''&&field.placeholder!=='');
  const shared=input(name,'shared');change(shared,'7');
  check('Shared field updates artifact profile ratings',D.loadProfilePerkOverrides(D.activeProfileId())[name].offensive===7&&field.placeholder==='7');
  change(field,'0');change(shared,'8');
  check('Council override survives shared edits',field.value==='0'&&field.placeholder==='8');
  const def=input(name,'council','defensive');change(def,'-2');
  change(show,'overridden');check('Override filter finds saved Council stats',rowNames().includes(name));
  document.querySelector('[data-reset-stat="Heavy Tank Damage"]').click();
  check('Per-stat reset clears both Council axes only',!C.migrateRatings(C.loadRatingsRaw())[name]&&D.loadProfilePerkOverrides(D.activeProfileId())[name].offensive===8&&input().placeholder==='8');
  change(show,'shared');check('Shared filter has editable shared columns',rowNames().length>0&&[...document.querySelectorAll('tr[data-stat]')].every(r=>r.querySelector('[data-layer="shared"]')));
  change(show,'council');check('Council-only filter has no shared edits',rowNames().length>0&&!document.querySelector('[data-layer="shared"]'));
  change(show,'all');search(name);change(input(),'0');
  change(show,'zero');
  const defaults=await(await fetch('data/perk_rating_defaults.json')).json(),cd=await(await fetch('data/council_stat_rating_defaults.json')).json();
  const ctx=C.createRatingContext(defaults,cd);
  check('Zero filter respects visible axes',rowNames().every(n=>C.AXES.every(a=>ctx.ratingOf(n,a)===0)));
  change(show,'all');search('');
  const bad=input();change(bad,'11');check('Out-of-range values cannot overwrite a saved zero',C.migrateRatings(C.loadRatingsRaw())[name].offensive===0);change(bad,'0');
  async function frame(url,predicate) {
    const f=document.createElement('iframe');f.src=url;f.style.display='none';document.body.append(f);
    await wait(()=>f.contentDocument&&predicate(f.contentDocument));return f;
  }
  const reload=await frame('council-ratings.html?reload-check=1',d=>d.querySelector('input[data-layer="council"]'));
  check('Existing Council overrides survive reload',input(name,'council','offensive',reload.contentDocument).value==='0');reload.remove();
  const artifact=await frame('ratings.html',d=>d.querySelector('[data-layer="profile"]'));
  check('Artifact editor sees the same shared rating',[...artifact.contentDocument.querySelectorAll('[data-layer="profile"]')].find(i=>i.dataset.key===name&&i.dataset.axis==='offensive').value==='8');
  const ranking=await frame('council.html',d=>d.querySelector('#tbody tr[data-id]'));
  const rw=ranking.contentWindow,rd=ranking.contentDocument;
  const data=(await(await fetch('data/councilors.json')).json()).councilors;
  function expectedScores() {
    const rc=rw.DNCouncil.createRatingContext(defaults,cd),prefs=rw.DNCouncil.loadPrefSortAxes(),state=rw.DNCouncil.loadUi(),showcase=rw.DNCouncil.loadScoreMode()==='maxrow';
    return new Map(data.map(r=>{
      const lines=rw.DNCouncil.bonusesOf(r,state.mode,state.rarity).map(b=>{
        const mag=rw.DNCouncil.bonusMagnitude(b.value),off=rc.ratingOf(b.stat,'offensive')*mag,def=rc.ratingOf(b.stat,'defensive')*mag;
        return prefs.offensive&&prefs.defensive?Math.max(off,def):prefs.offensive?off:def;
      });
      return [r.id,showcase?(lines.length?Math.max(...lines):0):lines.reduce((a,b)=>a+b,0)];
    }));
  }
  function scoresMatch() {
    const expected=expectedScores();
    return [...rd.querySelectorAll('#tbody tr[data-id]')].every(r=>(Number(r.querySelector('.council-preference').textContent.trim().replace('+',''))||0)===expected.get(r.dataset.id));
  }
  check('Hall scores choose the higher axis per stat',scoresMatch());
  check('Default ranks use the visible combined Score',rd.querySelector('[data-sort="preference"]').getAttribute('aria-sort')==='descending');
  const scores=[...rd.querySelectorAll('.council-preference')].map(c=>Number(c.textContent.trim().replace('+',''))||0);
  check('Default order follows combined scores',scores.every((n,i)=>i===0||scores[i-1]>=n));
  rd.getElementById('sort-def').click();
  check('Score remains the active sort with one axis',rd.querySelector('[data-sort="preference"]').getAttribute('aria-sort')==='descending'&&scoresMatch());
  rd.getElementById('sort-def').click();
  rd.getElementById('score-maxrow').click();check('Showcase scores choose one highest-axis line',scoresMatch());
  rd.getElementById('score-combined').click();
  rd.querySelector('[data-sort="stats"] button').click();
  const state=rw.DNCouncil.loadUi();
  const statKeys=[...rd.querySelectorAll('#tbody tr[data-id]')].map(r=>rw.DNCouncil.bonusesOf(data.find(item=>item.id===r.dataset.id),state.mode,state.rarity).map(b=>b.stat+' '+b.value).join('; ').toLowerCase());
  check('Stats sort follows names and bonuses',statKeys.every((n,i)=>i===0||statKeys[i-1]<=n));
  const deep=await frame(rd.querySelector('.council-stat-link').href,d=>d.querySelector('input[data-layer="council"]'));
  check('Stat links open a filtered Council rating',deep.contentDocument.getElementById('ratings-q').value===new URL(deep.src).searchParams.get('stat')&&deep.contentDocument.querySelectorAll('tr[data-stat]').length===1);deep.remove();
  const rankingsBefore=rd.querySelector('#tbody').textContent;
  const other=artifact.contentWindow.DN,bag=other.loadProfilePerkOverrides(other.activeProfileId());bag[name]={offensive:-7,defensive:6};
  other.saveProfilePerkOverrides(other.activeProfileId(),bag);
  await wait(()=>input(name,'shared').value==='-7');
  check('Shared edits from another page refresh Council placeholders',input().placeholder==='-7'&&input().value==='0');
  await wait(()=>rd.querySelector('#tbody').textContent!==rankingsBefore);
  check('Rankings refresh shared changes across pages',scoresMatch());
  change(input(),'5');
  await wait(()=>scoresMatch());check('Rankings refresh Council overrides across pages',scoresMatch());
  window.confirm=()=>true;document.getElementById('ratings-reset').click();
  check('Profile reset clears Council overrides and keeps shared ratings',Object.keys(C.migrateRatings(C.loadRatingsRaw())).length===0&&D.loadProfilePerkOverrides(D.activeProfileId())[name].offensive===-7);
  await wait(()=>scoresMatch());
  ranking.remove();artifact.remove();
  change(group,'family');scroller.scrollTop=0;scroller.scrollLeft=0;window.scrollTo(0,0);
  await new Promise(resolve=>setTimeout(resolve,250));
  check('Ratings fit the page width',document.documentElement.scrollWidth<=window.innerWidth);
  if (window.innerWidth>900) {
    scroller.scrollTop=150;
    check('Desktop header and controls stay visible while ratings scroll',scroller.scrollTop>0&&document.querySelector('.app-header').getBoundingClientRect().top===0&&document.getElementById('ratings-q').getBoundingClientRect().top>=0);
    scroller.scrollTop=0;
  }
  check('No page error',document.getElementById('error').hidden);
  return {passed:Object.values(ui).every(Boolean),ui};
})()
