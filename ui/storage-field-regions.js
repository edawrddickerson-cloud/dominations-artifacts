/* Storage field geometry: separate five/six-row templates, coordinates only.
 * The user's selected complete dialog is the anchor; no frame detector required. */
(() => {
  'use strict';
  const B=window.DNScannerRegions,C=window.DNScannerCore,KEY='dn-storage-field-templates-v1';
  const count=value=>Number(value)===6?6:5,copy=B.copy;
  function defaults(aspect,rows=5) {
    rows=count(rows);const area={x:.303,y:.151,width:.568,height:rows===6?.785:.659},h=area.height/rows;
    const rect=(i,x,w,y,height)=>({x:area.x+x*area.width,y:area.y+(i+y)*h,width:w*area.width,height:height*h});
    return {version:1,kind:'storage',aspect,
      title:{x:.31,y:.018,width:.553,height:.110},category:{x:.072,y:.439,width:.2,height:.058},
      hall:{x:.015,y:.44,width:.04,height:.05},artwork:{x:.037,y:.067,width:.226,height:.295},
      rows:Array.from({length:rows},(_,i)=>({name:rect(i,.15,.665,.12,.31),percentage:rect(i,.85,.15,.20,.60),
        level:rect(i,.40,.14,.51,.32),star:rect(i,.043,.048,.40,.30),dice:{x:.886,y:area.y+(i+.18)*h,width:.075,height:h*.70}}))};
  }
  function fields(template) {
    return template.rows.flatMap((row,i)=>['name','percentage','level','star','dice'].map(kind=>({id:i+'-'+kind,label:'Row '+(i+1)+' '+(kind==='percentage'?'signed %':kind==='level'?'upgrade level /10':kind==='dice'?'dice button (optional)':kind),box:row[kind] || null,kind,index:i})))
      .concat(['title','category','hall','artwork'].map(kind=>({id:kind,label:kind==='title'?'Artifact name':kind==='hall'?'Hall colour (optional)':kind==='artwork'?'Artifact picture': 'Category',box:template[kind] || null,kind})));
  }
  function valid(template) {
    if(template?.kind!=='storage' || template.version!==1 || !Number.isFinite(template.aspect) || template.aspect<.3 || template.aspect>6 || ![5,6].includes(template.rows?.length) || !template.rows.every(row=>row && typeof row==='object'))return false;
    const optional=new Set(['dice','hall','artwork']);
    return fields(template).every(field=>field.box==null?optional.has(field.kind):B.validBox(field.box));
  }
  function assign(template,id,box) {
    if(['title','category','hall','artwork'].includes(id))template[id]=box;
    else {const [index,kind]=id.split('-');if(template.rows[Number(index)] && ['name','percentage','level','star','dice'].includes(kind))template.rows[Number(index)][kind]=box;}
  }
  function resolve(template,panel,source) {
    if(!valid(template))return {valid:false,reason:'Saved storage boxes are invalid. Recalibrate fields.'};
    if(!C.validRegion(panel) || !source?.width || !source?.height)return {valid:false,reason:'Select the complete storage dialog first.'};
    const aspect=panel.width*source.width/(panel.height*source.height);
    if(Math.abs(aspect/template.aspect-1)>.08)return {valid:false,reason:'Storage dialog shape changed. Recalibrate fields.'};
    const boxes={};
    for(const field of fields(template).filter(field=>field.box)) {
      const region=B.toSource(field.box,panel),rect=region && C.cropPixels(region,source.width,source.height);
      if(!rect || rect.width<2 || rect.height<2)return {valid:false,reason:field.label+' is outside the source or too small.'};
      boxes[field.id]=rect;
    }
    return {valid:true,boxes,unavailable:{}};
  }
  function load(rows=5) {try{const value=JSON.parse(localStorage.getItem(KEY) || '{}')[count(rows)];return valid(value)?value:null;}catch{return null;}}
  function save(template) {if(!valid(template))return false;try{let all;try{all=JSON.parse(localStorage.getItem(KEY) || '{}');}catch{all={};}all[template.rows.length]=copy(template);localStorage.setItem(KEY,JSON.stringify(all));return true;}catch{return false;}}
  function reset(rows=5) {try{const all=JSON.parse(localStorage.getItem(KEY) || '{}');delete all[count(rows)];localStorage.setItem(KEY,JSON.stringify(all));return true;}catch{return false;}}
  window.DNStorageRegions={KEY,copy,validBox:B.validBox,valid,defaults,fields,assign,toSource:B.toSource,fromSource:B.fromSource,resolve,load,save,reset};
})();
