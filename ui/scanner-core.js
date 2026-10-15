/*
 * Authority: Untitled-1.md, approved Phase 2 capture/calibration scope.
 * Ownership: Scanner only; no game control, rating calculation, or persistent state.
 * Invariants: Regions use normalized frame coordinates; invalid regions never crop.
 * History: No real game fixtures exist yet. Automatic panel anchors are unverified.
 */
(() => {
  "use strict";
  const clamp = value => Math.max(0, Math.min(1, value));
  function regionBetween(a, b) {
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    const x = Math.min(clamp(a.x), clamp(b.x));
    const y = Math.min(clamp(a.y), clamp(b.y));
    const width = Math.abs(clamp(a.x) - clamp(b.x));
    const height = Math.abs(clamp(a.y) - clamp(b.y));
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  }
  function validRegion(region) {
    return !!region && [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
      region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 &&
      region.x + region.width <= 1 + 1e-9 && region.y + region.height <= 1 + 1e-9;
  }
  function cropPixels(region, width, height) {
    if (!validRegion(region) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const x = Math.floor(region.x * width);
    const y = Math.floor(region.y * height);
    const right = Math.min(width, Math.ceil((region.x + region.width) * width));
    const bottom = Math.min(height, Math.ceil((region.y + region.height) * height));
    return { x, y, width: right - x, height: bottom - y };
  }
  window.DNScannerCore = { regionBetween, validRegion, cropPixels };
})();
