# MSF War Defense Browser

A fast, mobile-friendly browser for aggregate **Marvel Strike Force Alliance War defense** results. It helps players compare defensive squads by defend rate, defensive wins, and battle volume, then narrow the field with exact character includes, exclusions, thresholds, and `ALL` / `ANY` matching.

The site is a static React application. It never receives an MSF API credential and never calls an authenticated MSF API from a player's browser.

The published site includes a plain-language [`privacy.html`](public/privacy.html) explaining that it does not request player or account information, use first-party analytics, or intentionally collect personal information. It also identifies the external hosting and portrait services that may receive ordinary web-request information.

## How the data path works

```text
Documented character API ──┐
                           ├── scheduled GitHub Action ── validated static JSON ── React app
Provisional War service ───┘
```

- Character names and portrait URLs come from the documented [`GET /game/v1/characters`](https://developer.marvelstrikeforce.com/beta/msf-api.json) Developer API.
- Aggregate defensive-team statistics come from the official site's [`getWarMeta?type=defense`](https://api-prod.marvelstrikeforce.com/services/getWarMeta?type=defense) service.
- The aggregate War service is **not present in the documented Developer API**. It is an undocumented, provisional dependency that may change or disappear. Confirmation from Scopely or the official MSF API community is prudent before treating it as permanent.
- The frontend reads only [`public/data/war-defense.json`](public/data/war-defense.json). Raw upstream response shapes stop at the ingestion layer.

The snapshot tracks War-result freshness separately from character-metadata freshness. If the authenticated character request is unavailable, the pipeline can still update War results while retaining the last validated character names and portraits.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Vite serves the app locally and uses `/msf_war_defense/` as its production base path for GitHub Pages. Filter selections are reflected in URL parameters, so a filtered view can be bookmarked or shared.

Useful checks:

```bash
npm test
npm run lint
npm run validate-data
npm run build
npm run preview
```

## Refreshing data

### Fetch current data

Create a local `.env` or export these values in the shell that runs the command. `.env*` files are ignored except for the blank `.env.example` template.

```text
MSF_CLIENT_ID
MSF_CLIENT_SECRET
MSF_API_KEY
```

Then run:

```bash
npm run refresh-data
```

The command uses the OAuth client-credentials flow, fetches every character page, fetches the aggregate War response once, joins the two sources, validates the result, and atomically replaces the static snapshot only after every check passes. Secret values are never printed or written to output.

### Refresh War results without OAuth

If the character credentials are temporarily unavailable, the operator can still fetch current aggregate War results and reuse the character catalog from the last-known-good snapshot:

```bash
npm run refresh-data -- --war-only
```

This mode keeps the two source dates separate in the snapshot and in the UI. New character IDs that are not yet in the retained catalog receive readable names and portrait fallbacks until a full credentialed refresh succeeds.

For a reviewed one-time bootstrap, an operator can merge a small set of current records from the official public character directory:

```bash
npm run refresh-data -- --war-only \
  --character-overrides-file data/bootstrap-character-overrides.json
```

The override file must include `meta.observedAt`, and the snapshot records its source, observation time, and record count separately. This is a temporary enrichment path, not a replacement for the documented character API. A successful full authenticated refresh removes the bootstrap annotation and replaces the catalog with API data.

### Build from operator-provided files

This is the manual fallback when a live source is unavailable:

```bash
npm run refresh-data -- \
  --war-file /absolute/path/to/war-response.json \
  --characters-file /absolute/path/to/characters-response.json \
  --character-overrides-file data/bootstrap-character-overrides.json \
  --war-source-as-of 2026-08-30T12:00:00Z \
  --character-source-as-of 2026-05-17T08:24:58Z
```

The War and character files are required together. The override file is optional and must carry its own observation timestamp. Use the source-specific timestamp options when the main files' dates differ; `--source-as-of` remains a shorthand when both files share the same date.

## Validation and last-known-good behavior

Before writing, the ingestion code verifies that:

- the War payload contains an array with at least 50 normalized squads;
- every squad has one to five non-empty character IDs;
- totals and defensive wins are non-negative integers, with wins no greater than total battles;
- calculated defend rates are finite and between 0% and 100%;
- the character payload contains at least 100 usable character records;
- unmapped character IDs are counted and receive readable names plus portrait fallbacks;
- bootstrap character overrides retain their own source, record count, and observation timestamp;
- a refresh does not suddenly lose more than 40% of squads or 30% of portrait coverage compared with the last snapshot;
- reordered duplicate squads are collapsed deterministically, retaining the record with the greatest battle count (then the greatest defensive-win count);
- the checked-in content hash matches the team data.

If fetching, parsing, joining, validation, testing, linting, or building fails, the workflow exits without committing. The prior checked-in snapshot remains the runtime data. Snapshot timestamps change only when team content or the schema changes, avoiding daily timestamp-only commits.

## Scheduled refresh

[`update-data.yml`](.github/workflows/update-data.yml) runs once daily at 12:17 UTC and can also be dispatched manually. It first attempts a full refresh. If character authentication fails, it automatically attempts the validated War-only fallback so current aggregate results are not unnecessarily blocked. A full refresh requires these GitHub Actions secrets:

- `MSF_CLIENT_ID`
- `MSF_CLIENT_SECRET`
- `MSF_API_KEY`

After a valid refresh it runs tests, linting, and the production build. It commits only a meaningful change to `public/data/war-defense.json`. Do not place secrets in repository variables, frontend environment variables, fixtures, screenshots, or generated files.

## GitHub Pages deployment

[`deploy-pages.yml`](.github/workflows/deploy-pages.yml) validates and builds the static site, uploads `dist`, and deploys with GitHub's official Pages actions. It runs for changes on `main`, after a successful scheduled refresh, or by manual dispatch.

One repository-owner step is still required before first deployment:

1. Add the three Actions secrets above.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. Review and merge the feature branch.
4. Watch both workflows once and verify the published `/msf_war_defense/` path.

Changing repository settings, adding secrets, merging, pushing, and deploying are intentionally outside the local build process and should be approval-gated.

## Troubleshooting

### Missing credential

`Missing required environment variable` means the refresh shell or Actions environment lacks one of the three required values. Confirm the name; do not print the value.

### OAuth or Developer API error

Check the client credentials, API key, developer-portal access, and API status. The error reports only the HTTP status, route, and a short upstream response. The previous snapshot is safe.

### War endpoint timeout or schema error

The aggregate endpoint is provisional. Retry once later, inspect its response outside the browser, and update normalization/tests only after confirming an intentional format change. Never weaken validation merely to force a refresh through.

### Suspicious record or portrait drop

Compare the current upstream payload with the checked-in snapshot. A legitimate large roster or service change may require a reviewed threshold adjustment; a transient partial response should simply be rejected.

### Portrait does not load

The UI automatically falls back to character initials for a missing, new, or failed portrait URL. The data pipeline also reports portrait coverage and unmapped IDs so recurring gaps can be investigated.

### Published site is blank or data returns 404

Confirm Pages is deploying the `dist` artifact and that the repository path is exactly `/msf_war_defense/`. The Vite base path and runtime snapshot request both use that prefix in production.

## Project layout

```text
data/                 reviewed temporary bootstrap source records
src/components/       portrait cards, filters, and results controls
src/hooks/            static snapshot loading
src/utils/            pure filtering, sorting, and URL-state logic
scripts/lib/          fetching, normalization, joining, and validation
public/data/          checked-in frontend-ready snapshot
test/                 high-risk data and filter coverage
.github/workflows/    validated refresh and Pages deployment
```

This is a community analysis tool and is not affiliated with or endorsed by Scopely.
