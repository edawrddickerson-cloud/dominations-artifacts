/*
 * Authority: Museum scanner Phase 2 capture and calibration verification.
 * Ownership: Standalone Node VM tests; no dependencies or real screen capture.
 * Invariants: Exercise production scripts through their public DOM events.
 * Constraints: Mocks verify lifecycle logic, not browser permission or timing behavior.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'ui', name), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function target() {
  return { listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, fire(name, event = {}) { return this.listeners[name]?.(event); } };
}
function harness({calibrated=false}={}) {
  const elements = {}, timers = new Map(), captureRequests = [], bitmapRequests = [], readings=[];
  const detection={panel:null},store=new Map();
  let timerId = 0;
  const ids=['connect', 'stop', 'source', 'select', 'retry', 'status', 'message', 'freshness', 'meta', 'frame', 'crop', 'video', 'file', 'apply', 'x', 'y', 'width', 'height','image-refresh'];
  if(calibrated)ids.push('layout','rows',...['enabled','edit','reset','status','editor','field','canvas','x','y','width','height','optional-label','optional','preview','preview-label','feedback','save','cancel','fit'].map(id=>'fields-'+id));
  for (const id of ids) {
    const draws = [];
    elements[id] = Object.assign(target(), {
      value: '', files: [], textContent: '', disabled: false, width: 640, height: 360,
      attributes: {}, classList: { toggle() {} }, draws,
      setAttribute(k, v) { this.attributes[k] = v; },
      getContext() { return { clearRect() {}, drawImage(...args) { draws.push(args); }, strokeRect() {},fillRect(){},fillText(){},measureText(){return {width:50};} }; },
      replaceChildren(...children){this.children=children;},
      getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 360 }; },
      focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    });
  }
  elements.source.value = 'window';
  Object.assign(elements.video, { videoWidth: 1920, videoHeight: 1080, readyState: 2, currentTime: 1, srcObject: null, pauses: 0,
    pause() { this.pauses++; }, async play() {} });
  const window = Object.assign(target(), { isSecureContext: true });
  const document = Object.assign(target(), { hidden: false, getElementById: id => elements[id.replace('scanner-', '')],createElement:()=>({...elements.frame}) });
  window.dispatchEvent=event=>window.fire(event.type);
  const context = { window, document, navigator: { mediaDevices: { getDisplayMedia(options) { const request = deferred(); captureRequests.push({ ...request, options }); return request.promise; } } },
    performance: { now: () => 1000 }, Date,Event:class {constructor(type){this.type=type;}},
    localStorage:{getItem:key=>store.get(key) || null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    createImageBitmap(file) { const request = deferred(); bitmapRequests.push({ ...request, file }); return request.promise; },
  };
  vm.createContext(context);
  vm.runInContext(read('scanner-core.js'), context);
  if(calibrated){
    elements.layout.value='panel';elements.rows.value='5';elements['fields-enabled'].checked=true;
    vm.runInContext(read('scanner-regions.js'),context);
    window.DNScannerRecognition={detectPanel:()=>detection.panel};
    window.DNScannerReading={update:(canvas,state)=>readings.push(state),reset(){},invalidate(){}};
    vm.runInContext(read('scanner-calibration.js'),context);
  }
  vm.runInContext(read('scanner.js'), context);
  return { elements, timers, captureRequests, bitmapRequests, window, document, core: window.DNScannerCore,detection,readings };
}
function capture() {
  function track(kind) { return Object.assign(target(), { kind, readyState: 'live', muted: false, stops: 0, stop() { this.stops++; this.readyState = 'ended'; } }); }
  const video = track('video'), audio = track('audio'), tracks = [video, audio];
  return { video, audio, getTracks: () => [...tracks], getVideoTracks: () => tracks.filter(t => t.kind === 'video'), getAudioTracks: () => tracks.filter(t => t.kind === 'audio'), removeTrack(t) { tracks.splice(tracks.indexOf(t), 1); } };
}
async function start(h) {
  const done = h.elements.connect.fire('click'); const stream = capture();
  h.captureRequests.at(-1).resolve(stream); await done; return stream;
}
async function main() {
  const h = harness(), e = h.elements;
  assert.equal(h.captureRequests.length, 0, 'initialization never asks permission');
  assert.equal(e.status.textContent, 'Disconnected');
  assert.equal(e['image-refresh'].hidden,true,'image refresh stays hidden without live capture');
  assert.equal(h.core.regionBetween({ x: 0, y: 0 }, { x: 0, y: 1 }), null);
  assert.equal(h.core.regionBetween({ x: NaN, y: 0 }, { x: 1, y: 1 }), null);
  const region = h.core.regionBetween({ x: 1.2, y: .8 }, { x: -.1, y: .2 });
  assert.equal(region.x, 0); assert.equal(region.width, 1);
  assert.equal(h.core.validRegion({ x: .9, y: 0, width: .2, height: 1 }), false);
  assert.equal(h.core.cropPixels(region, 0, 1080), null);
  const crop = h.core.cropPixels({ x: .1, y: .2, width: .5, height: .5 }, 1920, 1080);
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), { x: 192, y: 216, width: 960, height: 540 });
  let done = e.connect.fire('click');
  assert.equal(e.status.textContent, 'Waiting for browser permission');
  assert.equal(h.captureRequests[0].options.audio, false);
  h.captureRequests[0].reject(Object.assign(new Error(), { name: 'NotAllowedError' })); await done;
  assert.equal(e.status.textContent, 'Not connected'); assert.equal(e.connect.disabled, false);
  done = e.connect.fire('click'); e.stop.fire('click');
  const late = capture(); h.captureRequests.at(-1).resolve(late); await done;
  assert.equal(late.video.stops, 1); assert.equal(late.audio.stops, 1);
  assert.equal(e.video.srcObject, null); assert.equal(h.timers.size, 0);
  const live = await start(h);
  assert.equal(live.audio.stops, 1, 'unexpected audio is stopped');
  assert.equal(e.video.srcObject, live); assert.equal(h.timers.size, 1);
  assert.equal(e['image-refresh'].hidden,false,'image refresh appears after connecting');
  Object.assign(e.x, { value: '10' }); e.y.value = '20'; e.width.value = '50'; e.height.value = '50';
  e.apply.fire('click'); assert.equal(e.crop.width, 960); assert.equal(e.crop.height, 540);
  assert.equal(e.status.textContent, 'Region preview active');
  e.x.value = ''; e.apply.fire('click'); assert.equal(e.status.textContent, 'Invalid region');
  e.video.videoWidth = 1280; e.video.videoHeight = 720; e.retry.fire('click');
  assert.equal(e.crop.width, 640); assert.equal(e.freshness.textContent, 'No calibrated region.');
  assert.equal(e.select.attributes['aria-pressed'], 'true');
  live.video.muted = true; live.video.fire('mute'); assert.equal(e.status.textContent, 'Capture interrupted');
  live.video.muted = false; live.video.fire('unmute'); e.retry.fire('click');
  assert.equal(e.status.textContent, 'Select artifact region');
  live.video.fire('ended'); assert.equal(e.status.textContent, 'Capture ended');
  assert.equal(e['image-refresh'].hidden,true,'ending capture hides image refresh');
  assert.equal(live.video.stops, 1); assert.equal(e.video.srcObject, null); assert.equal(h.timers.size, 0);
  const next = await start(h); e.stop.fire('click');
  assert.equal(next.video.stops, 1); assert.equal(e.status.textContent, 'Disconnected');
  assert.equal(e.stop.disabled, true); assert.equal(h.timers.size, 0);
  // A late local decode must not replace a newer screenshot or survive Stop.
  const bitmap = () => ({ width: 1920, height: 1080, closed: 0, close() { this.closed++; } });
  e.file.files = [{ type: 'image/png', size: 100 }]; const first = e.file.fire('change');
  e.file.files = [{ type: 'image/jpeg', size: 100 }]; await e.file.fire('change');
  assert.equal(h.bitmapRequests.length, 1, 'overlapping image loads are blocked');
  assert.equal(e.stop.disabled, false, 'pending decode remains cancellable');
  e.stop.fire('click');
  e.file.files = [{ type: 'image/jpeg', size: 100 }]; const second = e.file.fire('change');
  const old = bitmap(), current = bitmap();
  h.bitmapRequests[1].resolve(current); await second;
  h.bitmapRequests[0].resolve(old); await first;
  assert.equal(old.closed, 1); assert.equal(current.closed, 0);
  e.stop.fire('click'); assert.equal(current.closed, 1);
  e.file.files = [{ type: 'image/png', size: 100 }]; const pending = e.file.fire('change');
  e.stop.fire('click'); const stopped = bitmap(); h.bitmapRequests[2].resolve(stopped); await pending;
  assert.equal(stopped.closed, 1); assert.equal(e.status.textContent, 'Disconnected');
  const closing = await start(h); h.window.fire('pagehide');
  assert.equal(closing.video.stops, 1); assert.equal(h.timers.size, 0);

  const recovery=harness({calibrated:true}),r=recovery.elements;
  await start(recovery);
  assert.equal(r['fields-edit'].disabled,true,'no calibration without a panel');
  recovery.detection.panel={x:.2,y:.2,width:.5,height:.4};
  r.video.currentTime++;
  [...recovery.timers.values()].at(-1)();
  assert.equal(r.select.attributes['aria-pressed'],'false','a panel appearing after connection is selected automatically');
  assert.equal(r['fields-edit'].disabled,false,'late automatic detection enables calibration');
  assert.equal(recovery.readings.at(-1).current,true);
  assert.equal(recovery.readings.at(-1).itemPresent,true);
  r['fields-edit'].fire('click');r['fields-save'].fire('click');
  assert.equal(recovery.window.DNScannerCalibration.hasTemplate,true);
  recovery.detection.panel=null;r.retry.fire('click');
  assert.equal(recovery.readings.at(-1).current,false,'automatic anchor loss still pauses saved-field reads');
  assert.equal(r['fields-edit'].disabled,true);
  r.select.fire('click');
  r.frame.fire('pointerdown',{button:0,clientX:128,clientY:72,pointerId:1});
  r.frame.fire('pointerup',{clientX:448,clientY:216,pointerId:1});
  assert.equal(r['fields-edit'].disabled,false,'manual drawing enables calibration when detection misses');
  assert.equal(recovery.readings.at(-1).current,true,'manual drawing resumes reads with saved fields');
  assert.ok(recovery.readings.at(-1).fields,'saved fields resolve against the manual anchor');
  assert.equal(recovery.readings.at(-1).itemPresent,undefined,'a missed automatic border cannot veto an explicit selection');
  recovery.detection.panel={x:.1,y:.1,width:.6,height:.5};r.retry.fire('click');
  assert.equal(recovery.readings.at(-1).fields.panel.x,.2,'automatic detection cannot replace an explicit calibration anchor');
  recovery.detection.panel=null;
  r['fields-edit'].fire('click');
  assert.equal(r['fields-editor'].hidden,false,'manual anchor opens the real field editor');
  assert.equal(recovery.readings.at(-1).current,false,'field editing still pauses reads');
  r['fields-cancel'].fire('click');
  assert.equal(recovery.readings.at(-1).current,true,'cancel resumes the manually anchored read');
  r.video.videoWidth=1280;r.video.videoHeight=720;r.retry.fire('click');
  assert.equal(r['fields-edit'].disabled,true,'dimension changes discard the manual anchor');
  r.stop.fire('click');await start(recovery);
  assert.equal(r['fields-edit'].disabled,true,'manual anchor cannot leak into another capture');
  r.stop.fire('click');
  console.log('Scanner geometry, permission, capture cleanup, calibration, and local decode races passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
