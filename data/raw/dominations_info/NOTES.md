# dominations-info.com capture notes

Checked: 2026-09-05

- Homepage changelog: `[1.2ver / 2026-04-25] 유물 및 협의회 정보 최신화`
- Main: https://dominations-info.com/main_artifacts.html → loads `main_artifacts.js`
- War: https://dominations-info.com/war_artifacts.html → loads `war_artifacts.js`
- API (404 as of check):
  - `.../exec?tab=Main`
  - `.../exec?tab=War`
  - Full ID: `AKfycbwIDx-aPZ7Uy285yUHq2eDnjs5CzAwHZiauYrbghoirGTGhx0aaZsKbG8GJRp2yYbwMAw`
- Upgrade display rule in JS: magnitude +9 (+1 archaeology); non-% special ints unchanged
- Direct site HTML fetch via urllib → 403; use browser fetch for JS
