# Cloudflare Pages deploy (tester share)

**Date:** 2026-10-10  
**Status:** Approved design — execute after more UI development  
**Target URL shape:** `https://dominations-artifacts.pages.dev` (exact subdomain = Pages project name)

## Goal

Share the existing static `ui/` app so others can test and give feedback on PC, Android, and iOS browsers — without accounts, sync, or native apps.

## Decisions

| Topic | Choice |
|--------|--------|
| Distribution | Cloudflare Pages static site |
| Access | Public URL (anyone with the link) |
| User data | Per-device `localStorage` only (no cloud sync) |
| Publish root | `ui/` only |
| Local workflow | Unchanged (`Open UI.bat` / `python -m http.server` on `127.0.0.1:8765`) |
| Redeploys | Push to connected Git branch → CDN updates; browser storage on same origin kept |

## Publish surface

**Included (site root = `ui/`):**

- HTML / JS / CSS pages (`index.html`, `collection.html`, `army.html`, `council*.html`, shared assets)
- `ui/data/*` consumed by the app (`artifacts.json`, `councilors.json`, image maps, perk mapping, rating defaults, etc.)

**Excluded from the public site:**

- Repo root research: `data/temp/`, agent notes, draft CSVs, mining scripts
- `Open UI.bat` (local-only helper)

Canonical datasets remain under `data/` + `scripts/build_canonical.py`. Before a deploy meant for testers, ensure `ui/data/` reflects the intended snapshot (same discipline as local testing today).

## Deploy architecture

1. Put the repo on GitHub (no git remote today).
2. Cloudflare Pages → Connect to Git → select repo.
3. Project settings:
   - Framework preset: **None**
   - Build command: **empty** (static files as-is)
   - Build output directory: **`ui`**
   - Production branch: **`master`** (or the branch chosen at connect time)
4. Production URL: `https://<project-name>.pages.dev` — aim for project name `dominations-artifacts`.
5. Each push to the production branch triggers a new deployment.

Optional later (not required for first share): a small copy/sync step from `data/` → `ui/data/` as a build command so deploy always matches canonical JSON.

## localStorage / redeploy behavior

- Storage is keyed by **origin** (`https://dominations-artifacts.pages.dev`).
- Redeploying HTML/JS/JSON does **not** clear tester data on that origin.
- Data is lost or invisible if the tester uses another browser/device, clears site data, the Pages project/URL (origin) changes, or app code renames storage keys without migration.
- A future custom domain is a **new origin** unless migration is planned separately.

## Tester experience

- One shared HTTPS link; works in desktop and mobile browsers.
- Each tester’s ratings, collection, profiles, and council state stay on their device.
- Feedback collected out-of-band (chat/Discord/etc.) — not part of hosting.

## Out of scope (v1)

- PWA / Add to Home Screen
- Accounts, cloud sync, shared multi-user data
- Native wrappers / app stores
- Password or invite-only access
- Custom domain

## Risks / checks

- First deploy: verify `ui/data/` is the intended tester snapshot.
- Smoke-test Priority, Collection, Army, Council pages on phone after go-live.
- Public GitHub repo is the simplest Pages connect path; private repo needs a Cloudflare plan that supports it.
- No secrets required for static hosting; do not add API keys to `ui/`.

## Success criteria

- Testers open the `*.pages.dev` URL on PC and phone without local Python.
- Core pages load data via `fetch` (no `file://` issues).
- A code/data push updates the live site; existing tester `localStorage` on that origin remains usable.
