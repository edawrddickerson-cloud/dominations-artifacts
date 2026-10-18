# Accounts analytics and research setup

The browser application remains the source of local saves. Supabase adds optional account storage through a versioned workspace; PostHog receives explicit, consented usage and diagnostic events. OCR, scoring and local collection writes never wait for either service.

The configuration has `cloudEnabled: false`, `privacyReady: true` and `researchEnabled: false`. Operator account testing is enabled only at `http://127.0.0.1:8765` using `localCloudTesting: true` in the development environment. Product analytics and diagnostics can be selected in Account & privacy, and default off. The privacy notice identifies the confirmed PostHog Free one-year analysis window; that window is not a physical-deletion guarantee. Research and public cloud rollout remain disabled.

## Local configuration

Put browser-safe values in `C:\Projects\Dominations Artifacts\data\temp\service-credentials.txt`:

```text
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
POSTHOG_PROJECT_TOKEN=
```

`data/temp/` is Git-ignored and outside the published `ui/` directory. Leave PostHog blank until its EU project exists. Do not put privileged keys in this file. The following command validates the key types and updates `ui/service-config.js` without printing their values:

```powershell
node scripts/configure_services.cjs --apply
node scripts/check_service_connection.cjs
```

The public configuration deliberately contains the publishable key and project token; they are intended for browser use. Server secrets belong only in Supabase function secrets or an ignored server-only environment file. The connectivity command reads public Auth settings, reports whether Discord is enabled and probes anonymous table access; it does not start a sign-in or change data.

## Install the database

Use a Supabase project for this application. In its SQL Editor, run the complete file:

```text
C:\Projects\Dominations Artifacts\supabase\migrations\202610180001_planner_backend.sql
```

The migration is one transaction. It creates planner-prefixed tables/functions, ownership policies, bounded workspace history and restricted research views. It does not alter the local planner format, scoring, catalog or existing application files. Apply it once; future database changes must be separate numbered migrations. If using the Supabase CLI instead, use its migration workflow and retain migration history.

The publishable key cannot install migrations. An operator must use the SQL Editor, an authenticated CLI or the Management API. Do not grant browser roles DDL access.

After installation, run the connectivity command again. Public Auth should be reachable, the schema should be present, and anonymous workspace reads should be denied. Live acceptance must additionally exercise two signed-in users: an anonymous denial alone does not prove isolation.

## Configure Discord sign-in

Discord is the chosen sign-in method. In Supabase Authentication, enable the Discord provider with its client ID and secret. Those Discord credentials stay in Supabase. The app only needs the existing Supabase URL and publishable key. See [Supabase Discord setup](https://supabase.com/docs/guides/auth/social-login/auth-discord).

The Discord developer application's OAuth redirect must point to the Supabase provider callback, normally `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. This differs from the planner's return page. Keep the provider callback shown by Supabase if the project uses a custom auth domain.

In **Supabase Authentication → URL Configuration**, set the Site URL to the deployed planner origin and allow its exact `config.html` return URL. For local testing, also allow `http://127.0.0.1:8765/config.html`. If you actually use a different local hostname, port or path, add its exact return URL too. The browser sends a fixed same-origin return page rather than accepting an arbitrary destination from URL parameters. See [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

The browser uses PKCE and exchanges the one-time code on return. `auth-return.js` removes auth parameters before navigation, telemetry or other application scripts run. Cancelled or expired returns show a generic retry message and leave local planner data intact. The flow returns to the same browser and origin where it started. See [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

Test first sign-in, returning sign-in, cancellation, sign-out and signing in again for account deletion. SMTP and email templates are not prerequisites for this Discord flow. If the project also has email authentication enabled, manage that separately; the planner does not expose an email login form.

## Deploy account deletion

Deploy the function named `delete-account` from `supabase/functions/delete-account/`. Keep `index.ts` and `handler.mjs` together for CLI deployment.

For the [Supabase Dashboard editor](https://supabase.com/docs/guides/functions/quickstart-dashboard), first run `node scripts/prepare_supabase_dashboard.cjs`. This creates one pasteable file from the tested sources at `C:\Projects\Dominations Artifacts\data\temp\supabase-dashboard\delete-account.ts`. In **Edge Functions → Deploy a new function → Via Editor**, replace the example code with that file's complete source, name the function `delete-account` and deploy it. Regenerate the file whenever its canonical source changes; it contains no credentials.

CLI users can run:

```powershell
supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF
```

Configure these function secrets in Supabase:

| Setting | Value |
| --- | --- |
| `APP_ORIGINS` | Comma-separated exact application origins, including the local testing origin when needed. |
| `APP_SUPABASE_PUBLISHABLE_KEY` | Optional override if the runtime does not provide a default entry in `SUPABASE_PUBLISHABLE_KEYS`; use this project's browser-safe key. |
| `APP_SUPABASE_SECRET_KEY` | Optional override if the runtime does not provide a default entry in `SUPABASE_SECRET_KEYS`; never place it in `ui/`. |
| `APP_ANALYTICS_ENABLED` | `false` until PostHog is enabled; then `true`. |
| `POSTHOG_PROJECT_ID` | Required when analytics is enabled. |
| `POSTHOG_PERSONAL_API_KEY` | Server-only key with the permissions needed to find/delete people and associated events in this project. |
| `POSTHOG_API_HOST` | `https://eu.posthog.com` for the EU project. |

Gateway JWT verification is disabled in `config.toml`; when deploying through the Dashboard, also turn off its gateway JWT verification setting. The handler itself verifies the bearer token through Supabase Auth. It checks the request origin and explicit deletion confirmation, and requires a sign-in within 15 minutes. Request JSON cannot select another user. Provider failures return an error; they do not report successful account deletion. Database foreign keys remove that user's workspace, history, research and consent records after Auth deletion.

Account-linked product events create a pseudonymous PostHog person so the function can request deletion of the associated events. PostHog deletion is asynchronous. Separate local-browser analytics references can be handled through the privacy contact. See [PostHog people and deletion](https://posthog.com/docs/data/persons).

## Retention and backups

Enable Supabase Cron and schedule `select public.planner_prune_expired_data();` daily, for example at `15 3 * * *` UTC. The function removes workspace history older than 30 days and research sessions older than 730 days, including their outcomes. Each workspace save also limits prior cloud versions to three. Verify the job runs successfully in the [Cron dashboard](https://supabase.com/docs/guides/cron).

Local replacement recovery keeps the three most recent safety copies in a separate IndexedDB database. The Account & privacy panel offers importable planner backups from those copies. These remain on the device until replaced or browser site data is cleared. They are not uploaded by normal workspace sync.

Arrange independent database backups and perform a restore drill before public release. Supabase recommends off-site exports for free projects; managed backup access depends on the selected plan. Database backups do not include Storage objects. This release uploads no artwork and creates no image bucket. See [database backups](https://supabase.com/docs/guides/platform/backups).

Record deletion requests that affect retained operational backups, and reapply them after restoring a backup before reopening service. Do not silently reintroduce deleted accounts from a restored database.

## Enable optional analytics

Create PostHog in its EU region. Configure project IP capture off, provider retention and the server deletion credentials above. Set the ingestion host to `https://eu.i.posthog.com`. Product/diagnostic capture uses the documented [Capture API](https://posthog.com/docs/api), with no browser autocapture or session-replay SDK.

Publish a working privacy contact and complete the operator privacy notice, processor agreements and retention arrangements. PostHog currently documents a one-year event window on Free and seven years on paid plans, and says that window cannot be shortened to remove data. It is not a physical-deletion guarantee. The original 30-day diagnostic target therefore cannot be enabled just by changing a project retention setting. Keep optional collection off until the actual policy and deletion arrangements are agreed, and make the published configuration match them. See [event retention](https://posthog.com/docs/data/events-retention) and [data deletion](https://posthog.com/docs/privacy/data-storage#data-deletion).

Set `privacyContact` and `privacyReady: true` only after those checks. Users still need to choose each optional purpose. Product analytics and diagnostics can become available while `researchEnabled` stays false. Enable research separately only after its scheduled retention and operational checks pass. An existing local scanner-log preference never enables remote sharing.

In Account & privacy, checkbox changes remain a draft until **Save preferences** is selected. Success changes the button to **Saved** and shows each saved choice below it; both survive a reload. Preferences apply to this browser. A storage failure shows an error, leaves the previous consent in effect and permits retry. Banner choices also leave visible confirmation. After updating the application, reload once to load the versioned service scripts; clearing browser data is unnecessary.

Use [backend-events.md](backend-events.md) to configure dashboards in PostHog. Ingestion tokens cannot create dashboards; dashboard administration requires the operator's project UI or an appropriately scoped management key. Keep account and local-browser populations separate in headline usage metrics.

For automated setup, the Git-ignored local file `C:\Projects\Dominations Artifacts\data\temp\posthog-admin.txt` holds `POSTHOG_API_HOST`, the numeric `POSTHOG_PROJECT_ID`, and a `POSTHOG_PERSONAL_API_KEY` beginning `phx_`. Use a key restricted to this project, with Project, Dashboard and Insight Read/Write plus Query Read. This key is separate from the public `phc_` project token and is never copied to `ui/`.

```powershell
node scripts/setup_posthog.cjs --plan
node scripts/setup_posthog.cjs --check
node scripts/setup_posthog.cjs --validate
node scripts/setup_posthog.cjs --apply --smoke
node scripts/setup_posthog.cjs --audit
```

`--plan` writes the four dashboards and 20 insight definitions to ignored `data/temp/posthog-dashboards.json` without contacting PostHog. `--check` verifies that the selected project matches the configured public token and region. Validation executes each query before provisioning writes. Applying configures IP discard and disables autocapture, then creates or updates only the planner's tagged resources, preserving unrelated dashboards and existing links. Repeated runs reuse those resources. The synthetic smoke check uses the actual telemetry transport with isolated memory, an explicitly enabled test preference and no personal browser/account data. It verifies capture receipts and queryable ingestion; test events are excluded from all production dashboards. Reports contain only safe setup status and dashboard URLs in ignored `data/temp/posthog-setup.json`.

Provisioning does not enable user sharing or configure the server-side deletion key. Before activation, put a separate key restricted to Person Read/Write in ignored `C:\Projects\Dominations Artifacts\data\temp\posthog-deletion.txt`, alongside the selected project ID and EU API host. Run `node scripts/check_posthog_deletion.cjs` to verify the real handler's PostHog calls using one synthetic person; Supabase Auth is stubbed, so it cannot delete a real account. The check keeps a failed test's synthetic ID for safe cleanup on retry. Provider deletion is asynchronous; acceptance is not proof of completed physical erasure.

After verification, add the four values from that file to the deployed deletion function's secrets, including `APP_ANALYTICS_ENABLED=true`. Secret updates apply without redeploying the function. Keep the broader provisioning key local and revoke it when setup is finished if it is no longer needed. Confirm the privacy contact and retention wording before changing `privacyReady`. Analytics, diagnostics and research stay off by default; scanner access does not depend on agreeing to optional sharing.

For the completed local setup, refresh `http://127.0.0.1:8765/config.html#account-privacy`, choose the analytics/diagnostics purposes to enable, and save preferences. Local events carry `environment=development`; the production dashboards deliberately exclude them. Live browser opt-in/withdrawal can be checked with `node scripts/run_live_account_browser.cjs --control-smoke-test --headless --analytics-roundtrip`. It uses fresh browser storage, no real account, and actual PostHog capture. It never changes the operator's preferences. Its separate report is `data/temp/backend-control-browser.json`.

## Activate cloud sync

For the first real sign-in test, use the existing `Open UI.bat` server and open `http://127.0.0.1:8765/config.html#account-privacy`. The local testing switch uses the real Supabase project while leaving optional sharing disabled. Export a planner backup before linking existing browser data. A test account and a separate browser profile make account switching and deletion easier to verify. No master push is required for these checks.

After schema, Discord provider/return URLs, account deletion, privacy information and backup checks pass, set `cloudEnabled: true`. This is independent of the PostHog token; accounts can be enabled while PostHog remains off.

First sign-in does not adopt browser data automatically. Users choose whether to upload this browser or use an existing account workspace. A committed safety copy precedes either replacement. Conflicting edits produce a choice; independent changes are not automatically merged. Stop scanning and close other planner tabs before replacing local data, as with existing backup restore.

Sync includes profiles, canonical ownership flags, scanned collections, ordered perk attributes, strategy layouts/weights/inheritance, Council and score/filter preferences. Capture calibration, artwork, raw OCR logs, consent, auth tokens and integration state remain outside workspace documents. Local artwork is retained when applying the same account's cloud version and matching existing item IDs. Workspace documents are limited to approximately 16 MB; exceeding the limit must leave the full local data intact rather than truncate it.

## Validation and rollout

Run the dedicated checks from the repository root:

```powershell
node scripts/test_local_backup.js
node scripts/test_backend_core.js
node scripts/test_telemetry.js
node scripts/test_account_deletion.mjs
node scripts/test_auth_return.cjs
node scripts/test_local_test_session.cjs
node scripts/test_posthog_setup.cjs
node scripts/check_service_connection.cjs
node scripts/check_account_deletion.cjs
npm.cmd install --prefix data/temp/backend-tests --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.10
node scripts/test_backend_database.cjs
node scripts/run_backend_browser.js --summary --report
node scripts/run_backend_browser.js --summary --viewport=480x900 --report
```

Database tests execute the actual migration and RLS roles in embedded PostgreSQL; Auth's JWT-to-role mapping is represented by `auth.uid()`. Browser tests use real DOM/IndexedDB, a simulated Discord redirect/PKCE exchange and mock Supabase/PostHog transports. They do not verify actual Discord authorization, deployed gateway configuration or actual vendor ingestion/deletion. Complete those checks with dedicated test users and a staging environment before public rollout.

For automated recovery checks against the live project, keep the local app server running and use `node scripts/run_live_account_browser.cjs --use-existing-session`. It opens a helper page in the normal browser. Click **Connect read-only test** in the same browser/profile where the local planner is already signed in. No additional Discord login is needed. The explicit, single-use hand-off uses an expiring access token through a nonce-protected loopback listener; it does not read personal browser files or transfer a password, refresh token or provider token. The temporary helper page is removed after connection.

The script checks empty-browser cloud adoption, reload, recovery in a second isolated browser, account/local export, unchanged cloud revision and local sign-out retaining data. Collection/settings writes and account deletion are blocked at the test browser's network boundary. In existing-session mode, refresh and server logout are also blocked so the normal browser remains signed in; this mode does not test server session revocation. Downloads are inspected in memory, tokens are never logged or saved by the harness, and test contexts are disposed when it finishes. The ignored report is `data/temp/backend-live-browser.json`. Authenticated writes and successful account deletion require separate acceptance tests. Running without `--use-existing-session` instead requires a Discord login in the isolated test browser; private/automated-browser login restrictions can prevent that flow from completing.

Required live checks: import twice without duplicates; compare two users; make conflicting changes on two devices; disconnect during crafting, keep/edit items, reopen and reconnect; verify no local data loss; export both account and local backups; request deletion after a fresh Discord sign-in; restore a database backup; confirm no optional requests before consent or after withdrawal.

For rollback, disable `cloudEnabled` and `localCloudTesting` and optional capture in `service-config.js`. Keep the additive database intact and restore application files only through the normal reviewed deployment workflow. Existing browser formats and local saves remain usable. Never drop tables as a routine frontend rollback.
