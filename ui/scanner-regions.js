/* Authority: User-approved precise crafting scanner calibration, October 2026.
 * Ownership: One browser-local field template and panel-relative geometry only.
 * Invariants: No pixels persisted; every box must map inside the current source;
 * missing anchors, incompatible aspect ratios and invalid rows never read fields.
 * History: Crafting percentages follow names, so seed boxes deliberately overlap.
 * Constraints: A gold frame anchors the supported layout; no arbitrary UI tracking. */
(() => {
  'use strict';
  const KEY='dn-crafting-field-template-v1';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function validBox(box,external=false) {
    return !!box && ['x','y','width','height'].every(key=>Number.isFinite(box[key])) &&
      box.width>0 && box.height>0 && box.x>=(external?-2:0) && box.y>=(external?-2:0) &&
      box.x+box.width<=(external?3:1)+1e-9 && box.y+box.height<=(external?3:1)+1e-9;
  }
  function valid(template) {
    if(!template || template.version!==1 || !Number.isFinite(template.aspect) || template.aspect<.5 || template.aspect>6 ||
      !Array.isArray(template.rows) || template.rows.length!==5)return false;
    if(!['category','hall'].every(key=>template[key]===null || validBox(template[key],true)))return false;
    return template.rows.every((row,i)=>{
      if(!row || !['name','percentage','star'].every(key=>validBox(row[key])))return false;
      const center=box=>box.y+box.height/2;
      if(Math.abs(center(row.name)-center(row.percentage))>.055 || Math.abs(center(row.name)-center(row.star))>.065)return false;
      // Old v1 templates have no dice property. Optional controls may extend
      // beyond the gold stats panel, but must still be associated with this row.
      if(row.dice!=null && (!validBox(row.dice,true) || Math.abs(center(row.name)-center(row.dice))>.065))return false;
      if(i && row.dice && template.rows[i-1].dice && center(row.dice)<=center(template.rows[i-1].dice)+.04)return false;
      return !i || ['name','percentage','star'].every(key=>center(row[key])>center(template.rows[i-1][key])+.04);
    });
  }
  function defaults(aspect,category=false) {
    return {version:1,aspect,category:category?{x:-.3,y:-.31,width:.5,height:.2}:null,hall:null,
      rows:Array.from({length:5},(_,i)=>{
        const y=.275+.657*i/5,height=.657/5;
        return {name:{x:.115,y,width:.84,height},percentage:{x:.115,y,width:.84,height},
          star:{x:.062,y:y+height/2-.018,width:.022,height:.036},dice:null};
      })};
  }
  function fields(template) {
    return template.rows.flatMap((row,i)=>['name','percentage','star','dice'].map(kind=>({id:i+'-'+kind,label:'Row '+(i+1)+' '+(kind==='percentage'?'signed %':kind==='dice'?'dice button (optional)':kind),box:row[kind] || null,kind,index:i})))
      .concat(['category','hall'].map(kind=>({id:kind,label:kind==='category'?'Category':'Hall colour (optional)',box:template[kind],kind})));
  }
  function assign(template,id,box) {
    if(id==='category' || id==='hall')template[id]=box;
    else {const [row,kind]=id.split('-');if(template.rows[Number(row)] && ['name','percentage','star','dice'].includes(kind))template.rows[Number(row)][kind]=box;}
  }
  function toSource(box,panel) {
    if(!validBox(box,true) || !window.DNScannerCore.validRegion(panel))return null;
    const region={x:panel.x+box.x*panel.width,y:panel.y+box.y*panel.height,width:box.width*panel.width,height:box.height*panel.height};
    // Permit only floating point roundoff at the source boundary, never clipping.
    for(const key of ['x','y'])if(region[key]<0 && region[key]>-1e-9)region[key]=0;
    return window.DNScannerCore.validRegion(region)?region:null;
  }
  function fromSource(box,panel) {
    if(!window.DNScannerCore.validRegion(box) || !window.DNScannerCore.validRegion(panel))return null;
    return {x:(box.x-panel.x)/panel.width,y:(box.y-panel.y)/panel.height,width:box.width/panel.width,height:box.height/panel.height};
  }
  function resolve(template,panel,source) {
    if(!valid(template))return {valid:false,reason:'Saved boxes are invalid. Recalibrate fields.'};
    if(!window.DNScannerCore.validRegion(panel) || !source?.width || !source?.height)return {valid:false,reason:'Panel anchor missing. Find the panel or recalibrate.'};
    const aspect=panel.width*source.width/(panel.height*source.height);
    if(Math.abs(aspect/template.aspect-1)>.08)return {valid:false,reason:'Panel shape changed. Recalibrate fields.'};
    const boxes={},unavailable={};
    for(const field of fields(template).filter(field=>field.box)) {
      const normalized=toSource(field.box,panel),rect=normalized && window.DNScannerCore.cropPixels(normalized,source.width,source.height);
      if(!rect || rect.width<2 || rect.height<2) {
        if(field.kind==='dice'){unavailable[field.id]='clipped-or-too-small';continue;}
        return {valid:false,reason:field.label+' is outside the source or too small. Recalibrate fields.'};
      }
      boxes[field.id]=rect;
    }
    return {valid:true,boxes,unavailable};
  }
  function load(storage=localStorage) {
    try {const raw=storage.getItem(KEY);if(!raw)return null;const value=JSON.parse(raw);if(!valid(value))return null;value.rows.forEach(row=>{if(row.dice===undefined)row.dice=null;});return value;}catch{return null;}
  }
  function save(template,storage=localStorage) {
    if(!valid(template))return false;
    try {storage.setItem(KEY,JSON.stringify(template));return true;}catch{return false;}
  }
  function reset(storage=localStorage) {try {storage.removeItem(KEY);return true;}catch{return false;}}
  window.DNScannerRegions={KEY,copy,validBox,valid,defaults,fields,assign,toSource,fromSource,resolve,load,save,reset};
})();
