/* Shared ownership guard. Parse declarations; whitespace/comments do not form a baseline. */
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), ui = path.join(root,'ui');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'docs/design/consumers.json'),'utf8'));
const failures = [];
const themeLiterals=new Set([...Object.values(manifest.theme.tokens),'#1a1d21','#24282e','#2a2e34','#3a4048','#c4a35a']);
function rules(source) {
  const result=[];let token='',quote='',comment=false,depth=0,selector='';
  for(let i=0;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
    if(quote){token+=c;if(c==='\\'){token+=source[++i]||'';}else if(c===quote)quote='';continue;}
    if(c==='/'&&next==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;token+=c;continue;}
    if(c==='{') {selector=token.trim();token='';depth++;continue;}
    if(c==='}') {if(token.trim()&&selector&&!selector.startsWith('@'))result.push({selector:selector.replace(/\s+/g,' '),declarations:token.split(';').filter(d=>d.includes(':')).map(d=>{const n=d.indexOf(':');return [d.slice(0,n).trim(),d.slice(n+1).trim()];})});token='';selector='';depth--;continue;}
    token+=c;
    if(c===';'&&depth===0)token='';
  }
  if(depth||quote||comment)throw Error('Unbalanced CSS');
  return result;
}
const presentation = new Set(['background','background-color','border','border-color','border-radius','color','font','font-family','font-size','padding','box-shadow']);
for(const file of fs.readdirSync(ui).filter(f=>f.endsWith('.css')&&!['components.css','design-tokens.css'].includes(f))){
  for(const rule of rules(fs.readFileSync(path.join(ui,file),'utf8'))){
    for(const [property]of rule.declarations)if(property.startsWith('--')&&Object.hasOwn(manifest.theme.tokens,property.slice(2)))failures.push(`${file}: ${rule.selector} overrides ${property}; Slate theme values belong in design-tokens.css`);
    for(const [property,value]of rule.declarations)for(const literal of value.matchAll(/#[\da-f]{6}\b/gi))if(themeLiterals.has(literal[0].toLowerCase()))failures.push(`${file}: ${rule.selector} repeats theme colour ${literal[0]} in ${property}; use the shared Slate token`);
    // Scope to native field and migrated picker owners, not domain layouts or colours.
    if(!/(^|[\s,>+~])(select|textarea|input)(?=[\s.#:[,>+~]|$)|^\.(btn|seg-btn|th-sort|crafted-stats-sort|perk-filter-panel|strategy-comparison-options|probability-perk-menu)(?=[\s:[,]|$)/.test(rule.selector))continue;
    const values=rule.declarations.filter(([prop])=>presentation.has(prop));
    if(!values.length)continue;
    const exception=manifest.exceptions.find(e=>e.file===file&&e.selector===rule.selector);
    for(const [property,value]of values){
      if(!exception||exception.declarations[property]!==value)failures.push(`${file}: ${rule.selector} sets ${property}: ${value}; use the shared owner or document a verified domain exception`);
    }
  }
}
for(const [file,recipe]of Object.entries(manifest.routes)){
  const source=fs.readFileSync(path.join(ui,file),'utf8');
  if(!source.includes('styles.css?v='+manifest.assetVersion))failures.push(file+' must load the current shared stylesheet version');
  if(!['redirect','entry'].includes(recipe)&&!source.includes('design-ui.js'))failures.push(file+' must load shared interaction behaviour');
  if(!['shell','redirect','entry'].includes(recipe)&&!/<main\b|role="main"/.test(source))failures.push(file+' needs a main landmark');
}
for(const file of fs.readdirSync(ui).filter(f=>f.endsWith('.html')))if(!manifest.routes[file])failures.push(file+' needs a route recipe in docs/design/consumers.json');
const shared=fs.readFileSync(path.join(ui,'styles.css'),'utf8');
if(!shared.startsWith('@import url("design-tokens.css')||!shared.includes('@import url("components.css'))failures.push('styles.css must import shared foundations first');
if(!fs.existsSync(path.join(root,'tests/design/gallery.html')))failures.push('Shared component gallery is missing');
const tokens=Object.fromEntries([...fs.readFileSync(path.join(ui,'design-tokens.css'),'utf8').matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(m=>[m[1],m[2]]));
for(const [name,value]of Object.entries(manifest.theme.tokens))if(tokens[name]!==value)failures.push(`${manifest.theme.name} requires --${name}: ${value}; update the documented theme contract deliberately when changing foundations`);
function luminance(hex){const channels=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
for(const [foreground,background,minimum]of [['text','bg',4.5],['text','panel',4.5],['muted','panel',4.5],['muted','surface-raised',4.5],['accent','bg',4.5],['accent','surface-raised',4.5],['accent','selected-bg',4.5],['bg','accent',4.5],['success','success-bg',4.5],['danger','danger-bg',4.5],['warning','warning-bg',4.5],['control-edge','bg',3],['control-edge','panel',3],['focus','bg',3],['focus','panel',3]]){
  const a=luminance(tokens[foreground]),b=luminance(tokens[background]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  if(ratio<minimum)failures.push(`${foreground}/${background} contrast ${ratio.toFixed(2)} is below ${minimum}:1`);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Design ownership passed: '+Object.keys(manifest.routes).length+' routes, shared fields/pickers, documented domain exceptions.');
