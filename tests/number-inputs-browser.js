(async()=>{
  const checks=[],check=(name,passed)=>{checks.push({name,passed:!!passed});if(!passed)throw Error(name);};
  const panel=document.createElement('div');
  panel.style.cssText='position:fixed;inset:0;z-index:99999;background:#222;color:white;padding:20px;overflow:auto';
  panel.innerHTML='<p>Number control regression</p>'+[
    ['rating','rating-input','','6','1',-10,10],
    ['collection','collection-perk-value','-17','','1',-40,40],
    ['scanner','scanner-perk-value','37','','any',-40,40],
    ['level','scanner-perk-level','5','','1',1,10],
  ].map(([id,cls,value,placeholder,step,min,max])=>`<label style="display:flex;align-items:center;gap:1rem;margin:12px">${id}<input id="number-test-${id}" type="number" class="${cls}" style="width:100px" value="${value}" placeholder="${placeholder}" step="${step}" min="${min}" max="${max}" /></label>`).join('');
  document.body.appendChild(panel);
  const input=id=>panel.querySelector('#number-test-'+id);
  const heights=['rating','collection','scanner','level'].map(id=>input(id).getBoundingClientRect().height);
  check('Perk-number controls use the same input and stepper height',heights.every(height=>Math.abs(height-heights[0])<1));
  const changed=[];panel.addEventListener('change',event=>changed.push(event.target.value));
  function nativeAction(request){return new Promise(resolve=>{window.DNRegionPointerDone=()=>{window.DNRegionPointerRequest=null;resolve();};window.DNRegionPointerRequest=request;});}
  async function clickArrow(id,direction){const rect=input(id).getBoundingClientRect(),x=rect.right-8,y=rect.top+rect.height*(direction==='up'?.25:.75);await nativeAction({x0:x,y0:y,x1:x,y1:y});}
  const rating=input('rating');
  rating.focus();check('Focusing an inherited number leaves its value blank',rating.value==='');
  await clickArrow('rating','up');rating.blur();
  check('Native up arrow starts at inherited 6 and saves 7',rating.value==='7' && changed.includes('7'));
  rating.value='';rating.placeholder='6';await clickArrow('rating','down');rating.blur();
  check('Native down arrow starts at inherited 6 rather than zero',rating.value==='5');
  rating.value='';rating.placeholder='6';rating.focus();await nativeAction({key:'ArrowUp'});rating.blur();
  check('Keyboard up starts at the displayed inherited rating',rating.value==='7');
  rating.value='';rating.placeholder='-4';rating.focus();await nativeAction({key:'ArrowDown'});rating.blur();
  check('Keyboard down preserves negative inherited ratings',rating.value==='-5');
  rating.value='';rating.placeholder='0';await clickArrow('rating','up');rating.blur();
  check('An inherited zero steps normally to one',rating.value==='1');
  rating.value='9';await clickArrow('rating','up');rating.blur();
  check('A new odd rating of nine can step to ten',rating.value==='10');
  await clickArrow('rating','up');rating.blur();check('Rating stepper respects the ten-point maximum',rating.value==='10');
  await clickArrow('collection','up');input('collection').blur();check('Collection percentages step from their signed current value',input('collection').value==='-16');
  await clickArrow('scanner','up');input('scanner').blur();check('Scanner percentage steppers increase the displayed value',input('scanner').value==='38');
  await clickArrow('level','down');input('level').blur();check('Scanner level steppers decrease the displayed level',input('level').value==='4');
  panel.remove();delete window.DNRegionPointerDone;delete window.DNRegionPointerRequest;
  return {passed:checks.every(check=>check.passed),checks};
})();
