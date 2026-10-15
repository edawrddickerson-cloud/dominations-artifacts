# Local OCR assets

Authority: Scanner brief requires browser-local OCR and no default cloud vision.
Ownership: Vendored, unmodified upstream assets; scanner-specific wrappers live outside this directory.
Invariants: Same-origin worker/core/language URLs; no screenshots transmitted; no runtime CDN dependencies.
History: Added for the first English crafted-artifact recognition fixture. No paid services or build tooling added.

- `tesseract.min.js` and `worker.min.js`: npm `tesseract.js@7.0.0`, from https://registry.npmjs.org/.
- `core/*.wasm.js`: npm `tesseract.js-core@7.0.0`. All six embedded-WASM variants are included so upstream chooses the supported SIMD/LSTM build. Only the selected variant is loaded per worker.
- `lang/eng.traineddata.gz`: https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz
- English model SHA-256: `ED350F3752F81EE8F38769EDC14D92D997DABABE23B565C59879372CC46A2468`.

Upstream Apache 2.0 licenses and bundled dependency notices are preserved in this directory. The English traineddata is distributed by the Tesseract project under Apache 2.0. Keep upstream notices when refreshing assets.

Current total assets: approximately 36.9 MB on disk. A session loads the API, worker, one selected core variant, and the English model; it does not download every core variant. The recognizer disables traineddata persistence (`cacheMethod: none`); ordinary browser HTTP caching may cache these public library/model assets, never captured images.
