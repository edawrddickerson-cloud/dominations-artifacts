# Storage Mythical category correction

Two paths caused the reported behaviour: an exact Mythical category label below the OCR confidence cutoff selected five-row geometry, and changing Category updated metadata without updating the row editor or recognition options. An unread category could also reuse the previous selection and link a five-row default to the Legendary catalog edition.

Category text now normalizes whitespace. An exact Mythical label uses six-row geometry even at low confidence, while retaining the raw text, confidence and a review warning. An unread category remains unselected and cannot mark a default Legendary owned or save its stats/artwork.

Choosing Mythical or War Mythical immediately shows six editor slots and automatically rereads the current image with the selected category and Hall, including with automatic scanning disabled. The old layout's observations are discarded before rereading. An in-flight OCR result cannot overwrite the correction, the worker is reused only after its current call ends, and the override survives a matching calibration row-count refresh. The choice is scoped to the current artifact, session and profile. Selecting Legendary returns to five rows. Saved calibration is unchanged.

Validation passed:

- Storage category state unit test and OCR adapter tests, including low-confidence/whitespace labels and conflicting manual/OCR categories.
- Eight real-browser category checks: immediate row-count changes, stale worker rejection, corrected automatic reread, unknown fields before rereading, and reset for the next artifact.
- Sixteen checks using the supplied Main and War Mythical screenshots: all six signed stats recovered after an initial wrong-edition result, including calibration refresh, editable sixth row and correct Hall.
- The independent Main/War Mythical automatic OCR cases recovered all six labelled rows exactly.
- Storage catalog ownership and image-save browser checks, passive storage saving, scanner recognition, comparison, strategy, reading, stored-artifact persistence and design ownership.
- Required desktop glance and provisional-colour browser checks passed with zero external requests/browser errors.

The existing calibrated-fields fixture fails at `actual OCR uses calibrated storage boxes` both here and on the unchanged deployed commit `d332534`. The broad storage-layout fixture also encounters a missing legacy label in a geometry assertion before its end; the focused category and real-image fixtures verify this change directly. No scanner styles or calibration baselines were changed.

The fix does not alter existing inventories, stats, cloud data or the 18 public game-image mappings.
