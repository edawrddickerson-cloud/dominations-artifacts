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

The calibrated crafting path also vendors the fast integer English LSTM model from https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata, compressed locally as `lang-fast/eng.traineddata.gz` (1,977,247 bytes). Its uncompressed SHA-256 is `7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2`; compressed SHA-256 is `44502D85A12B9598D68A773D17C0949B52BCE2261387DE4C7719F1E4420D279D`. The upstream Apache 2.0 license applies. Original source: https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0.

Current total assets: approximately 38.9 MB on disk. A session loads the API, worker, one selected core variant, and the required English model. Calibrated crafting uses the fast model; an unclear calibrated read uses the original model for the standard fallback. Storage and text-only recognition retain the original model. At most two workers exist per engine, both terminated on close. Workers warm during capture stabilization. Only these public models may be cached in browser IndexedDB, under separate model/version keys; captured images and OCR output never enter that cache.
