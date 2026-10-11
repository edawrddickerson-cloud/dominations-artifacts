# Cloudflare Pages Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing `ui/` static app to Cloudflare Pages at a public `https://dominations-artifacts.pages.dev`-style URL for tester feedback.

**Architecture:** Connect a GitHub repo to Cloudflare Pages with build output directory `ui`, no framework build. Local `Open UI.bat` workflow stays unchanged. Tester state remains browser `localStorage` on the Pages origin.

**Tech Stack:** Static HTML/JS/CSS already in `ui/`; GitHub; Cloudflare Pages (no Workers required for v1).

**Spec:** `docs/superpowers/specs/2026-10-10-cloudflare-pages-deploy-design.md`

## Global Constraints

- Publish surface is **`ui/` only** — never deploy `data/temp/` as the site root.
- Framework preset: **None**; build command: **empty**; output directory: **`ui`**.
- No accounts, sync, PWA, password gate, or custom domain in this plan.
- Do not rename `localStorage` keys as part of deploy work.
- Do not commit secrets; static hosting needs none.
- Prefer project name **`dominations-artifacts`** so the URL is `https://dominations-artifacts.pages.dev`.
- Execute only when the user asks to run this plan (after further UI work).

---

## File structure (expected touchpoints)

| Path | Role |
|------|------|
| `ui/**` | Deployed site (unchanged structure) |
| `ui/data/**` | JSON/CSV the app fetches — must be current before share |
| `Open UI.bat` | Local-only; not the Pages entrypoint |
| `.gitignore` | Only touch if needed to keep junk out of GitHub |
| `docs/superpowers/specs/2026-10-10-cloudflare-pages-deploy-design.md` | Source of truth for decisions |

No new runtime app files required for v1.

---

### Task 1: Preflight — confirm `ui/` is share-ready

**Files:**
- Review: `ui/index.html`, `ui/collection.html`, `ui/army.html`, `ui/council.html`, `ui/council-collection.html`
- Review: `ui/data/artifacts.json`, `ui/data/councilors.json`, `ui/data/artifact_images.json`, `ui/data/army_unit_images.json`, `ui/data/perk_name_mapping.csv`, `ui/data/perk_rating_defaults.json`, `ui/data/council_stat_rating_defaults.json`

**Interfaces:**
- Consumes: existing relative fetches (`./data/...`) in `ui/*.js`
- Produces: go/no-go decision that `ui/data/` matches the intended tester snapshot

- [ ] **Step 1: Start local server and open Priority**

Run (from repo root, or use `Open UI.bat`):

```bat
Open UI.bat
```

Expected: browser opens `http://127.0.0.1:8765/`; Priority page shows artifact rows (not the “serve over HTTP” error).

- [ ] **Step 2: Smoke-check each page locally**

Open and confirm data loads (no failed `fetch` / empty main list):

- `http://127.0.0.1:8765/index.html`
- `http://127.0.0.1:8765/collection.html`
- `http://127.0.0.1:8765/army.html`
- `http://127.0.0.1:8765/council.html`
- `http://127.0.0.1:8765/council-collection.html`

Expected: each page renders its primary list/UI from `ui/data/`.

- [ ] **Step 3: Confirm publish boundary**

Run from repo root:

```powershell
Get-ChildItem ui -Name | Sort-Object
Get-ChildItem ui\data -Name | Sort-Object
```

Expected: site assets + `data\` under `ui\`; research dumps stay under `data\temp\` (not under `ui\`).

- [ ] **Step 4: Stop if `ui/data` is stale**

If canonical `data/artifacts.json` (or council build outputs) are newer than what testers should see, refresh `ui/data/` using the project’s existing copy/build helpers **before** any deploy task. Do not invent a new pipeline in this task.

---

### Task 2: Put the repo on GitHub

**Files:**
- Modify: git remotes only (no app code)
- Possibly modify: `.gitignore` if `data/temp/` or other bulky junk would otherwise be committed unintentionally

**Interfaces:**
- Consumes: local git repo on `master` (currently no `origin`)
- Produces: `origin` remote; GitHub repo the user can connect in Cloudflare

- [ ] **Step 1: Decide repo visibility with the user**

Ask once: **public** (simplest Pages connect) vs **private** (requires Cloudflare support for private repos on their plan). Record the choice before creating the repo.

- [ ] **Step 2: Create GitHub repo and set `origin`**

Use `gh` (user must be logged in). Use exactly one of these from Step 1:

```powershell
# Public (simplest Pages connect):
gh repo create dominations-artifacts --public --source=. --remote=origin --description "DomiNations artifacts / council tracker UI"

# Or private (confirm Cloudflare plan supports private GitHub repos):
gh repo create dominations-artifacts --private --source=. --remote=origin --description "DomiNations artifacts / council tracker UI"

git remote -v
```

Expected: `origin` points at `https://github.com/<user>/dominations-artifacts.git` (or SSH equivalent).

If `gh repo create` fails because the directory already has commits but create-from-source is awkward, create empty repo then:

```powershell
git remote add origin https://github.com/<user>/dominations-artifacts.git
```

- [ ] **Step 3: Commit only what should be on GitHub (user-approved)**

Do **not** commit unless the user explicitly asks in that session. When they do:

- Include `ui/` and whatever else they want versioned.
- Prefer excluding bulky `data/temp/` research artifacts via `.gitignore` if not already ignored.
- Do not add secrets or `.env` files.

Example `.gitignore` addition only if needed:

```gitignore
# Local research mines — not required for Pages (site is ui/)
data/temp/
```

- [ ] **Step 4: Push production branch**

```powershell
git push -u origin master
```

Expected: GitHub shows the branch; `ui/index.html` is visible in the repo browser.

---

### Task 3: Create Cloudflare Pages project

**Files:**
- None in repo (Cloudflare dashboard / wrangler config optional; dashboard is enough for v1)

**Interfaces:**
- Consumes: GitHub repo from Task 2
- Produces: live `https://dominations-artifacts.pages.dev` (or the closest available project name)

- [ ] **Step 1: Connect repo in Cloudflare**

In Cloudflare Dashboard:

1. Workers & Pages → Create → Pages → Connect to Git  
2. Authorize GitHub if needed; select `dominations-artifacts`  
3. Set project name to `dominations-artifacts` if available  

If the name is taken, use the nearest available name and record the actual URL in a short note at the bottom of the design spec Status line.

- [ ] **Step 2: Apply build settings**

| Setting | Value |
|---------|--------|
| Production branch | `master` |
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `ui` |
| Root directory (if asked) | `/` (repo root; output is still `ui`) |

Save and deploy.

- [ ] **Step 3: Wait for first deployment success**

In the deployment log, confirm output is served from `ui` (HTML at site root, not a nested `ui/` path on the public URL).

Expected production URL: `https://dominations-artifacts.pages.dev`

- [ ] **Step 4: Verify HTTPS fetch works**

Open:

- `https://dominations-artifacts.pages.dev/`
- `https://dominations-artifacts.pages.dev/data/artifacts.json`

Expected: Priority UI loads; JSON downloads as an array (`[` … `]`).

---

### Task 4: Production smoke test + redeploy check

**Files:**
- None required (optional tiny comment-only or cache-bust query already present via `?v=` on CSS — do not churn versions unless needed)

**Interfaces:**
- Consumes: live Pages URL
- Produces: confirmation that redeploy keeps `localStorage` on the same origin

- [ ] **Step 1: Full page smoke on desktop**

On the live origin, open Priority, Collection, Army, Council Priority, Council Collection. Confirm lists populate and nav links work.

- [ ] **Step 2: Mobile smoke**

On an Android or iOS browser, open the same URL. Confirm layout is usable and data loads (not a blank page / failed fetch).

- [ ] **Step 3: localStorage survival check**

1. On live site, change one rating or mark one item collected.  
2. Note the value.  
3. Make a trivial push that triggers redeploy (e.g. whitespace in a comment the user approved, or any pending UI change).  
4. After deploy Ready, hard-refresh the site.

Expected: the same origin still shows the rating/collection change from step 1.

- [ ] **Step 4: Share checklist for testers**

Send testers:

- The `https://…pages.dev` URL  
- Note: data is saved only in their browser on that device  
- Note: clearing site data resets their tracker  
- Ask them which page/device they used when reporting bugs  

---

### Task 5: Document the live URL (repo)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-cloudflare-pages-deploy-design.md` (Status + actual URL)
- Optionally modify: `AGENT_HANDOVER.md` with one line pointing at the live URL (only if user wants handover updated)

**Interfaces:**
- Consumes: final Pages URL from Task 3
- Produces: spec Status updated so future agents know where production is

- [ ] **Step 1: Update spec status**

Set Status to something like:

```markdown
**Status:** Live — https://dominations-artifacts.pages.dev
```

If the project name differed, use the real URL.

- [ ] **Step 2: Commit docs when the user asks**

```powershell
git add docs/superpowers/specs/2026-10-10-cloudflare-pages-deploy-design.md docs/superpowers/plans/2026-10-10-cloudflare-pages-deploy.md
git commit -m "docs: record Cloudflare Pages deploy design and plan"
git push
```

Only run commit/push when the user explicitly requests it.

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Host `ui/` on Cloudflare Pages | Task 3 |
| Public link for testers | Task 3–4 |
| Per-device localStorage only | Task 4 (verify); no backend added |
| Exclude `data/temp/` from site | Task 1 + Pages output `ui` |
| Local workflow unchanged | No changes to `Open UI.bat` |
| Redeploy keeps storage on same origin | Task 4 Step 3 |
| Out of scope items not built | No tasks for PWA/auth/sync/domain |

## Deferred (not in this plan)

- Build command to copy `data/*.json` → `ui/data/`
- PWA manifest / service worker
- Custom domain
- Private/password access
