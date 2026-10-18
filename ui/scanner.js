/*
 * Authority: Untitled-1.md, approved capture and subsequent recognition integration.
 * Ownership: Independent passive scanner; existing scoring/data remain authoritative.
 * Invariants: Explicit browser permission; audio disabled; pixels stay in memory;
 * no uploads, recording, game interaction, or rating edits; only field coordinates persist.
 * History: Phase 2 calibration extended using the user's five-row gold-panel fixture.
 * Constraints: Hidden-page timing and capture-source freshness are not guaranteed.
 */
(() => {
  "use strict";
  const core = window.DNScannerCore;
  const get = id => document.getElementById("scanner-" + id);
  const el = Object.fromEntries(["connect", "stop", "source", "select", "retry", "status", "message", "freshness",
    "meta", "frame", "crop", "video", "file", "apply", "x", "y", "width", "height"].map(id => [id, get(id)]));
  const frameContext = el.frame.getContext("2d");
  const cropContext = el.crop.getContext("2d");
  const calibration=window.DNScannerCalibration;
  const captureSession=window.parent && window.parent!==window?window.parent.DNScannerSession:null;
  const nativeFrame=calibration?document.createElement('canvas'):null;
  let stream = null, track = null, image = null, region = null, drag = null;
  let trackListeners = [];
  let generation = 0, timer = null, selecting = false, pending = false, locatePending = false;
  let dimensions = "", lastSample = 0, lastProgress = 0, lastMediaTime = -1;
  const supported = window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;

  function status(title, message) {
    if(el.status.classList?.contains?.('scanner-connection-label')) {
      const connected=!!stream || !!image;
      const routine=['Region preview active','Local screenshot preview'].includes(title);
      el.status.textContent=window.DNStorageRecognition && !routine?title:stream?'Connected':image?'Local screenshot':'Disconnected';
      el.status.classList.toggle('is-connected',connected);
      el.status.classList.toggle('is-disconnected',!connected);
      if(!window.DNStorageRecognition)el.status.title=title+'. '+message;
    } else el.status.textContent=title;
    el.message.textContent=message;
  }
  function controls() {
    el.connect.disabled = !supported || pending || !!stream;
    el.source.disabled = pending || !!stream;
    el.stop.disabled = !(pending || stream || image);
    el.select.disabled = !(stream || image) || pending;
    el.retry.disabled = !(stream || image) || pending;
    el.apply.disabled = !(stream || image) || pending;
    el.file.disabled = pending || !!stream;
    el.select.setAttribute("aria-pressed", selecting ? "true" : "false");
    el.frame.classList.toggle("is-selecting", selecting);
  }
  function blank(canvas, context) {
    canvas.width = 640; canvas.height = 360;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  function clearRegion() {
    region = null; drag = null;
    blank(el.crop, cropContext);
    el.freshness.textContent = "No calibrated region.";
    window.DNScannerReading?.update(el.crop,{session:generation,current:false});
  }
  function release(preserveCapture = false) {
    window.DNScannerReading?.reset();
    calibration?.resetCapture();
    if(nativeFrame)nativeFrame.width=nativeFrame.height=0;
    generation++;
    clearTimeout(timer); timer = null;
    for (const [name, listener] of trackListeners) track?.removeEventListener?.(name, listener);
    trackListeners = [];
    if (!preserveCapture) {
      if (captureSession) captureSession.stop();
      else if (stream) stream.getTracks().forEach(t => t.stop());
    }
    stream = null; track = null; pending = false;
    el.video.pause(); el.video.srcObject = null;
    if (image) image.close(); image = null;
    dimensions = ""; lastSample = 0; lastProgress = 0; lastMediaTime = -1;
    selecting = false; clearRegion();
    locatePending=false;
    blank(el.frame, frameContext);
    el.meta.textContent = "No source connected.";
    el.file.value = "";
    controls();
  }
  function endCapture(title, message) { release(); status(title, message); }
  function sourceSize() {
    return image ? {width: image.width, height: image.height} : {width: el.video.videoWidth, height: el.video.videoHeight};
  }
  function renderFrame() {
    const source = image || el.video;
    const size = sourceSize();
    if (!size.width || !size.height || (!image && (el.video.readyState < 2 || track?.muted))) return false;
    const nextDimensions = size.width + "x" + size.height;
    if (dimensions && dimensions !== nextDimensions) {
      clearRegion(); selecting = true;
      locatePending=true;
      status("Select artifact region", "Capture dimensions changed. Select the panel again.");
      controls();
    }
    dimensions = nextDimensions;
    const scale = Math.min(1, 1280 / size.width);
    const width = Math.round(size.width * scale), height = Math.round(size.height * scale);
    if (el.frame.width !== width || el.frame.height !== height) { el.frame.width = width; el.frame.height = height; }
    frameContext.drawImage(source, 0, 0, width, height);
    if(locatePending){locatePending=false;if(findPanel())return true;}
    let fieldState=null,focusPanel;
    const storage=!!window.DNStorageRecognition;
    if(calibration) {
      if(nativeFrame.width!==size.width || nativeFrame.height!==size.height){nativeFrame.width=size.width;nativeFrame.height=size.height;}
      nativeFrame.getContext('2d').drawImage(source,0,0,size.width,size.height);
      const layout=document.getElementById('scanner-layout')?.value || 'panel';
      if(!storage)focusPanel=window.DNScannerRecognition?.detectPanel(nativeFrame);
      const candidate=storage && layout==='storage'?region:layout==='panel'?(storage?window.DNScannerRecognition?.detectPanel(nativeFrame):focusPanel):null;
      if(calibration.hasTemplate && candidate && !selecting && !calibration.editing) {
        const moved=!region || ['x','y','width','height'].some(key=>Math.abs(region[key]-candidate[key])>.002);
        if(moved){region=candidate;window.DNScannerReading?.invalidate('Panel moved or resized. Checking its saved field boxes.',{preserveDisplay:true});}
      }
      fieldState=calibration.update(nativeFrame,calibration.hasTemplate && candidate && region && !selecting?region:candidate,{layout});
    }
    const activeRegion = drag ? core.regionBetween(drag.start, drag.end) : region;
    if (activeRegion) {
      frameContext.strokeStyle = "#c4a35a"; frameContext.lineWidth = 3;
      frameContext.strokeRect(activeRegion.x * width, activeRegion.y * height, activeRegion.width * width, activeRegion.height * height);
    }
    const crop = core.cropPixels(region, size.width, size.height);
    if (crop) {
      // Keep the crop at native resolution. The display is scaled by CSS only.
      if (el.crop.width !== crop.width || el.crop.height !== crop.height) { el.crop.width = crop.width; el.crop.height = crop.height; }
      cropContext.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      el.freshness.textContent = image ? "Local screenshot crop; not a live capture." : "Preview sampled at " + new Date().toLocaleTimeString() + ". Source freshness is not independently verified.";
      el.meta.textContent = "Source " + nextDimensions + " · crop " + crop.width + "×" + crop.height + " pixels";
      if(!storage && !calibration)focusPanel=window.DNScannerRecognition?.detectPanel(el.frame);
      const focusObserved=!storage && !selecting && !calibration?.editing && !document.hidden && (image || !track?.muted && el.video.currentTime!==lastMediaTime);
      window.DNScannerReading?.update(el.crop, {session:generation,live:!!stream,current:!selecting && !fieldState?.paused && !document.hidden && (image || !track?.muted),itemPresent:focusObserved && focusPanel!==undefined?!!focusPanel:undefined,categorySource:el.frame,panelRegion:region,fields:fieldState?.fields || null});
    } else el.meta.textContent = "Source " + nextDimensions + " pixels · select the complete artifact panel";
    return true;
  }
  function sample(session) {
    if (session !== generation || !stream) return;
    const now = performance.now();
    const stalled = lastSample && now - lastSample > 2500;
    lastSample = now;
    try {
      if (track.readyState === "ended") { endCapture("Capture ended", "Sharing ended. Connect Game to start another session."); return; }
      if (track.muted) {
        window.DNScannerReading?.update(el.crop,{session:generation,current:false});
        status("Capture interrupted", "The shared source is unavailable. Preview is no longer current.");
        el.freshness.textContent = "Preview unconfirmed while capture is interrupted.";
      } else if (!renderFrame()) {
        window.DNScannerReading?.update(el.crop,{session:generation,current:false});
        status("Waiting for frames", "The capture has not supplied a readable frame yet.");
        el.freshness.textContent = "Preview unconfirmed; waiting for frames.";
      } else {
        if (el.video.currentTime !== lastMediaTime) { lastMediaTime = el.video.currentTime; lastProgress = now; }
        if (!lastProgress) lastProgress = now;
        if (now - lastProgress > 5000) {
          window.DNScannerReading?.update(el.crop,{session:generation,current:false});
          status("Capture may be stalled", "The video timeline has stopped progressing. Check the shared window or reconnect.");
          el.freshness.textContent = "Preview unconfirmed; capture may be stalled.";
        } else if (document.hidden || stalled) {
          window.DNScannerReading?.update(el.crop,{session:generation,current:false});
          status("Monitoring may be delayed", "Keep the planner visible beside the game. Background execution is not guaranteed.");
          el.freshness.textContent = "Preview sampled, but continuous monitoring is unconfirmed.";
        } else if (region) status("Region preview active", "All visible perk rows count, including locked rows. Verify the crop and recognised values.");
        else status("Select artifact region", "Try Find Panel, or drag over the full artifact panel. Text-only calibration is available for other layouts.");
      }
    } catch {
      window.DNScannerReading?.update(el.crop,{session:generation,current:false});
      status("Capture interrupted", "Could not read the shared frame. Check the source, then retry or reconnect.");
      el.freshness.textContent = "Preview unconfirmed; frame read failed.";
    }
    timer = setTimeout(() => sample(session), window.DNStorageRecognition?350:100);
  }
  async function connect(existingCapture = null) {
    if (!supported || pending || stream) return;
    release(!!existingCapture); pending = true; controls();
    const session = generation;
    status("Waiting for browser permission", "Choose the game window, tab, or screen in the browser dialog. Audio is disabled.");
    try {
      const capture = existingCapture || await (captureSession ? captureSession.capture.bind(captureSession) : navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices))({
        video: { displaySurface: el.source.value }, audio: false, selfBrowserSurface: "exclude",
      });
      if (session !== generation) { capture.getTracks().forEach(t => t.stop()); return; }
      // Defensive cleanup if a browser nevertheless supplies an audio track.
      capture.getAudioTracks().forEach(t => { t.stop(); capture.removeTrack(t); });
      stream = capture; track = stream.getVideoTracks()[0];
      captureSession?.retain(capture);
      if (!track || track.readyState === "ended") throw new Error("missing-video");
      function listen(name, listener) { track.addEventListener(name, listener); trackListeners.push([name, listener]); }
      listen("ended", () => {
        if (session === generation) endCapture("Capture ended", "Sharing ended. Connect Game to start another session.");
      });
      listen("mute", () => {
        if (session === generation) { status("Capture interrupted", "The shared source is unavailable. Preview is no longer current."); el.freshness.textContent = "Preview unconfirmed while capture is interrupted."; }
      });
      listen("unmute", () => {
        if (session === generation) { lastProgress = performance.now(); lastMediaTime = -1; }
      });
      el.video.srcObject = stream;
      await el.video.play();
      if (session !== generation) return;
      pending = false; selecting = true; locatePending=true; controls(); sample(session);
      try{window.DNTelemetry?.event('scanner_session_started',{source:window.DNStorageRecognition?'storage':'crafting'},true);window.DNTelemetry?.milestone('first-capture-connected');}catch{}
    } catch (error) {
      if (session !== generation) return;
      try{window.DNTelemetry?.event('capture_failed',{reason:['NotAllowedError','NotFoundError','InvalidStateError'].includes(error.name)?error.name:'other'});}catch{}
      const message = error.name === "NotAllowedError" ? "Screen sharing was declined or blocked. You can try Connect Game again." :
        error.name === "NotFoundError" ? "No screen-sharing source is available." :
        error.name === "InvalidStateError" ? "Return to this page and click Connect Game again." :
        "The browser could not start screen sharing. Check its screen-recording permissions and try again.";
      endCapture("Not connected", message);
    }
  }
  function setRegion(next) {
    if (!core.validRegion(next)) { status("Invalid region", "Enter percentages within the source; width and height must be positive and fit inside it."); return; }
    const size = sourceSize(), crop = core.cropPixels(next, size.width, size.height);
    if (!crop || crop.width < 32 || crop.height < 32) { status("Region too small", "Select a larger panel region. Readable game text is required for later recognition."); return; }
    window.DNScannerReading?.invalidate('Panel selection changed. Checking the selected artifact.');
    region = next; selecting = false; drag = null;
    for (const key of ["x", "y", "width", "height"]) el[key].value = String(Math.round(region[key] * 10000) / 100);
    controls(); renderFrame();
    status(image ? "Local screenshot preview" : "Region preview active", "Check the panel crop. All visible perk rows count, including locked and duplicate rows.");
  }
  function findPanel() {
    if(!window.DNScannerRecognition || !(image || stream))return false;
    const size=sourceSize();if(!size.width || !size.height || track?.muted)return false;
    const source=document.createElement("canvas");
    const scale=Math.min(1,1280/size.width);source.width=Math.round(size.width*scale);source.height=Math.round(size.height*scale);
    source.getContext("2d").drawImage(image || el.video,0,0,source.width,source.height);
    const storage=!!window.DNStorageRecognition;
    const candidate=storage?window.DNStorageRecognition.detectPanel(source):window.DNScannerRecognition.detectPanel(source);
    if(storage && candidate) {
      const rect=core.cropPixels(candidate,source.width,source.height),panel=document.createElement('canvas');
      panel.width=rect.width;panel.height=rect.height;panel.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      const info=window.DNStorageRecognition.inspect(panel);panel.width=panel.height=0;
      document.getElementById('scanner-rows').value=String(info.expectedRows);
      if(info.hall)document.getElementById('scanner-hall').value=info.hall;
    }
    source.width=source.height=0;
    if(!candidate)return false;
    const layout=document.getElementById("scanner-layout");if(layout)layout.value=storage?"storage":"panel";
    window.DNScannerReading?.invalidate("Panel selection changed. Reading the new region.");
    setRegion(candidate);return true;
  }
  const find=document.getElementById("scanner-find");
  find?.addEventListener("click",()=>{if(!findPanel())status("Panel not found","Select the full panel manually, or choose Text rows only and select the perk text without headings or stars.");});
  function point(event) {
    const rect = el.frame.getBoundingClientRect();
    return {x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))};
  }
  el.frame.addEventListener("pointerdown", event => {
    if (!selecting || !(image || stream) || event.button !== 0 || !dimensions) return;
    drag = {start: point(event), end: point(event)};
    el.frame.setPointerCapture(event.pointerId); renderFrame();
  });
  el.frame.addEventListener("pointermove", event => { if (drag) { drag.end = point(event); renderFrame(); } });
  el.frame.addEventListener("pointerup", event => {
    if (!drag) return;
    const next = core.regionBetween(drag.start, point(event)); drag = null;
    if (el.frame.hasPointerCapture(event.pointerId)) el.frame.releasePointerCapture(event.pointerId);
    setRegion(next);
  });
  el.frame.addEventListener("pointercancel", () => { drag = null; renderFrame(); });
  el.frame.addEventListener("keydown", event => { if (event.key === "Escape") { drag = null; selecting = false; controls(); renderFrame(); } });
  el.connect.addEventListener("click", () => {
    if (!supported || pending || stream) return;
    if (window.DNScannerProfile) window.DNScannerProfile.confirm(() => connect());
    else return connect();
  });
  el.stop.addEventListener("click", () => endCapture("Disconnected", "Capture stopped and previews cleared."));
  el.select.addEventListener("click", () => { selecting = !selecting; drag = null; controls(); if (selecting) el.frame.focus(); });
  el.apply.addEventListener("click", () => setRegion(Object.fromEntries(["x", "y", "width", "height"].map(key => [key, el[key].value.trim() === "" ? NaN : Number(el[key].value) / 100]))));
  el.retry.addEventListener("click", () => {
    if (image) { renderFrame(); return; }
    if (stream) { clearTimeout(timer); sample(generation); }
  });
  el.file.addEventListener("change", async () => {
    const file = el.file.files[0]; if (!file || stream || pending) return;
    release(); const session = generation;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) { status("Unsupported image", "Choose a PNG, JPEG, or WebP screenshot under 20 MB."); return; }
    pending = true; controls();
    status("Opening local screenshot", "The image stays on this device.");
    try {
      const bitmap = await createImageBitmap(file);
      if (session !== generation) { bitmap.close(); return; }
      if (bitmap.width * bitmap.height > 32000000) { bitmap.close(); pending = false; controls(); status("Image too large", "Choose a screenshot under 32 megapixels."); return; }
      image = bitmap; pending = false; selecting = true; locatePending=true; controls(); renderFrame();
      if(!region)status("Select artifact region", "Drag over the artifact panel in this local screenshot. Nothing is uploaded.");
    } catch { if (session === generation) { pending = false; controls(); status("Could not open image", "Choose another supported screenshot."); } }
  });
  document.addEventListener("visibilitychange", () => {
    if (!stream) return;
    if (document.hidden) { window.DNScannerReading?.update(el.crop,{session:generation,current:false}); status("Monitoring may be delayed", "Keep the planner visible beside the game. Background execution is not guaranteed."); el.freshness.textContent = "Continuous preview monitoring is unconfirmed while hidden."; }
    else { lastSample = 0; clearTimeout(timer); sample(generation); }
  });
  document.addEventListener("freeze", () => { if (stream) { window.DNScannerReading?.update(el.crop,{session:generation,current:false}); status("Monitoring paused", "Browser suspended this page. Resume it to refresh the preview."); el.freshness.textContent = "Preview unconfirmed while suspended."; } });
  document.addEventListener("resume", () => { if (stream) { clearTimeout(timer); sample(generation); } });
  window.addEventListener("pagehide", () => release(!!captureSession));
  window.addEventListener('dn-scanner-fields-change',()=>{if(image || stream)renderFrame();});
  document.getElementById('scanner-layout')?.addEventListener('change',()=>{if(calibration && (image || stream))renderFrame();});
  document.getElementById('scanner-rows')?.addEventListener('change',()=>{if(calibration && (image || stream))renderFrame();});
  const existingCapture=captureSession?.current();
  release(!!existingCapture);
  status(supported ? "Disconnected" : "Unsupported browser", supported ? "Connect Game to share its window, or open a local screenshot to test calibration." : "Screen capture requires a supported desktop browser on HTTPS or localhost. Local screenshot calibration is still available.");
  if(existingCapture)connect(existingCapture);
  else if(window.DNScannerProfile?.resume)el.connect.click();
})();
