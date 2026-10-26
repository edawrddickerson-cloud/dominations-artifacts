# Static site build and caching

The editable site remains in `ui/`. Production uses the generated `dist/` directory:

```powershell
node scripts/build_site.cjs
node scripts/test_site_build.cjs
node scripts/test_site_build_browser.cjs
node scripts/test_site_build_browser.cjs --clean-urls
```

The build needs only Node.js. Browser checks need Chrome (`CHROME_PATH` can select another Chromium executable) and use a disposable local profile. They block external HTTPS and never sign in, request capture permissions or publish.

The builder hashes the source tree and builder code, then writes assets to `/static/<content-hash>/`. An unchanged source tree produces identical output; changing JavaScript, CSS, datasets, images, OCR models or page references changes the release URL. This deliberately versions the complete dependency tree together, including CSS imports, dynamic script loads, `data/` fetch prefixes, generated artwork URLs and Tesseract worker/core/language paths. Vendor files remain byte-for-byte unchanged inside that tree. `asset-manifest.json` records source names, public URLs and output SHA-256 values. Only files already under `ui/` are published; `AGENTS.md` and dotfiles are excluded.

Generated `_headers` gives only `/static/*` a one-year immutable browser lifetime. HTML, the manifest, stable compatibility aliases and `service-config.js` retain Cloudflare's default `public, max-age=0, must-revalidate`. Configuration is loaded from `/service-config.js` and does not change the immutable release hash. Static dataset fetches use the browser's ordinary HTTP cache; they no longer force `no-store` or `no-cache`. Live account and user data continue through their existing services.

Page links and shell routes stay at the site root; HTML is never placed in the immutable tree. Old manually maintained `?v=` labels are removed from rewritten asset URLs. Stable asset aliases support saved script URLs and previously opened source pages, while the built application requests the versioned tree. Source previews can still serve `ui/` directly.

The builder retains prior `/static/<hash>/` directories in its output so open tabs can finish loading their original release. Keep the previous `dist/static/` as a build artifact when using clean CI workers, then restore it before the next build. The output directory belongs to this build; do not use it for unrelated files. Removed source files lose their stable aliases on the next build. To choose a different output directory, use `node scripts/build_site.cjs --out data/temp/site-preview`.

## Cloudflare Workers

`wrangler.jsonc` configures the existing `dominations-planner` Worker as a static asset site, builds `dist/`, and keeps Cloudflare's clean HTML routing. For a local preview or configuration check, use the pinned CLI version:

```powershell
npx --yes wrangler@4.153.0 dev
npx --yes wrangler@4.153.0 deploy --dry-run --outdir data/temp/wrangler-dry-run
```

Deployment requires separate authorization. Once authorized, the release command is `npx --yes wrangler@4.153.0 deploy`; Wrangler runs the build first. For dashboard/Git integration, set the build command to `node scripts/build_site.cjs` and serve the `dist` asset directory using this configuration. Uploading `ui/` directly does not install the versioned release or immutable cache policy.

After an authorized rollout, run `node scripts/check_site_release.cjs --origin=https://dominations-planner.ededed84.workers.dev` against the exact `dist/` used for that release. It compares deployed versioned assets and stable HTML/configuration with the built bytes and verifies their cache headers. It is read-only. The older `check_*_release` and `check_crafting_v1_deployment` scripts compare raw source bytes and need migration before use with transformed deployment output; their account/API acceptance checks remain separate.

Then check a new browser session and navigation back to an already visited page. Previously cached HTML must revalidate and discover the new release; repeated immutable assets should be served from the browser cache. Local checks do not establish actual public-origin latency or the deployed header policy.

Cloudflare documents [static asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/), [HTML routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), and [custom/default response headers](https://developers.cloudflare.com/workers/static-assets/headers/). Header rules can combine, so the generated policy avoids a blanket custom revalidation rule overlapping the immutable tree.
