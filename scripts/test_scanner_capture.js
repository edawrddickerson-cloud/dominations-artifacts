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
function harness() {
  const elements = {}, timers = new Map(), captureRequests = [], bitmapRequests = [];
  let timerId = 0;
  for (const id of ['connect', 'stop', 'source', 'select', 'retry', 'status', 'message', 'freshness', 'meta', 'frame', 'crop', 'video', 'file', 'apply', 'x', 'y', 'width', 'height']) {
    const draws = [];
    elements[id] = Object.assign(target(), {
      value: '', files: [], textContent: '', disabled: false, width: 640, height: 360,
      attributes: {}, classList: { toggle() {} }, draws,
      setAttribute(k, v) { this.attributes[k] = v; },
      getContext() { return { clearRect() {}, drawImage(...args) { draws.push(args); }, strokeRect() {} }; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 360 }; },
      focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    });
  }
  elements.source.value = 'window';
  Object.assign(elements.video, { videoWidth: 1920, videoHeight: 1080, readyState: 2, currentTime: 1, srcObject: null, pauses: 0,
    pause() { this.pauses++; }, async play() {} });
  const window = Object.assign(target(), { isSecureContext: true });
  const document = Object.assign(target(), { hidden: false, getElementById: id => elements[id.replace('scanner-', '')] });
  const context = { window, document, navigator: { mediaDevices: { getDisplayMedia(options) { const request = deferred(); captureRequests.push({ ...request, options }); return request.promise; } } },
    performance: { now: () => 1000 }, Date,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    createImageBitmap(file) { const request = deferred(); bitmapRequests.push({ ...request, file }); return request.promise; },
  };
  vm.createContext(context);
  vm.runInContext(read('scanner-core.js'), context);
  vm.runInContext(read('scanner.js'), context);
  return { elements, timers, captureRequests, bitmapRequests, window, document, core: window.DNScannerCore };
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
  console.log('Scanner geometry, permission, capture cleanup, calibration, and local decode races passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
