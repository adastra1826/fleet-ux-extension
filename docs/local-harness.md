# Local harness

A fake Fleet you can run on your laptop. It serves stand-in pages for every archetype, answers
the API calls the extension makes, and hosts the plugins itself — so you can click through
`fleet.user.js` and run automated checks without the real site, without Tampermonkey, and
without touching production data.

All of its data is invented. See [Data](#data).

## Run the GUI

```bash
cd test
npm install
npm start
```

Open <http://127.0.0.1:8787>. You land on the main dashboard with the extension already
running. The strip across the top switches archetypes, personas, theme, whether the
extension itself is loaded, and Normal vs Dev plugin loading.

Docker instead, if you would rather not install Node locally:

```bash
cd test
npm run up        # docker compose up --build harness
npm run down
```

The container bind-mounts the repository, so editing a plugin and reloading the page is enough
— no rebuild.

## Run the tests

```bash
cd test
npx playwright install chromium   # first time only
npm test
```

Playwright starts the harness itself when nothing is listening on 8787. Point it at an
already-running instance with `HARNESS_BASE_URL=http://127.0.0.1:8787 npm test`.

| Command | What it does |
| --- | --- |
| `npm test` | Whole suite, headless |
| `npm run test:headed` | Same, with a visible browser |
| `npm run test:ui` | Playwright's interactive runner |
| `npm run docker:test` | Suite inside Compose |

Specs live in `test/e2e`. Each one covers a single concern, so a new flow should be a new
file rather than an edit to an existing one.

| Spec | Covers |
| --- | --- |
| `api.spec.js` | Fleet web, internal and orchestrator endpoints |
| `postgrest.spec.js` | Filters, embeds, ordering, counts, pagination |
| `permissions.spec.js` | QA-only flagging, resolver-only resolution |
| `seed.spec.js` | Production column coverage, lifecycle/QA/dispute shapes |
| `archetypes.spec.js` | Detection per URL, plugin loading, no page errors |
| `attach.spec.js` | Core chrome and per-archetype modules reaching the DOM; raw vs injected attach contracts |
| `theme.spec.js` | Design tokens and light/dark switching |
| `extension.spec.js` | Harness bar Extension and Normal/Dev toggles |

## People

Ten generated people, all task writers. The first six are also QA; the first two of those also
resolve disputes and senior-review flags. Each page response sets `current-user-id`,
`current-team-id` and `current-team-role` for the acting persona (first resolver unless you
already picked someone). Changing the top-bar picker rewrites those cookies and the fake JWT,
so the extension and the fake APIs agree on who you are.

| Persona | Can write tasks | Can QA and flag | Can resolve |
| --- | --- | --- | --- |
| 1–2 | yes | yes | yes |
| 3–6 | yes | yes | no |
| 7–10 | yes | no | no |

Permission rules are enforced server-side, not just hidden in the UI. A writer who posts to
`/api/task-flags` or `/api/flag-bugged/...` gets a 403; a non-resolver who tries to resolve a
dispute or flag gets a 403.

## Ops dashboard

The harness serves its own encrypted ops bundle with invented team UUIDs and tiny rating
baselines. Unlock it with the password `harness`. That password is deliberately public and
only ever opens harness ciphertext — the committed production `ops-secrets.enc.json` is never
read or written here.

## How it fits together

```
test/harness/
  seed/      generated people, tasks, QA, disputes, flags + harness ops bundle
  server/    pages, fake APIs, PostgREST layer, plugin CDN
  client/    page shells, design tokens, GM polyfill, harness top bar
test/e2e/    Playwright specs
```

The page loads a small `GM_*` polyfill and then `fleet.user.js` as an ordinary script. The
**Extension** control in the harness bar writes a `fleet-ux-extension` cookie; when it is `0`
the userscript tag is omitted so you can see the reconstructed page without injected chrome.
The **Normal** / **Dev** control writes `fleet-ux-dev` (`0` by default). Reload applies it:
Normal matches a `main` build (no `dev/` plugins). Dev sets `Context.isDevBranch` and loads
`devPlugins` plus each archetype’s `dev/` list from the local `archetypes.json`.

Raw page HTML is the host DOM plugins query — `data-ui` hooks, heading text, table columns —
with no extension chrome (`data-wf-*`, Settings, counters). Those injected nodes appear only
after the userscript attaches. Per-archetype lists live in `test/harness/client/attach-contracts.js`.

The polyfill backs `GM_getValue` and friends with `localStorage` and rewrites requests aimed at
GitHub, Supabase and the Fleet APIs to the local origin. `fleet.user.js` recognises the
harness (`window.__FLEET_UX_HARNESS__`, or the `fleet-ux-harness=1` cookie) and treats the
local origin as its base URL, `/__harness/cdn/` as the plugin source, and `/__harness/rest/v1`
as the PostgREST base.

Harness-only endpoints:

| Path | Returns |
| --- | --- |
| `/__harness/health` | Seed counts, useful as a readiness check |
| `/__harness/personas` | The roster the top bar renders |
| `/__harness/seed` | The whole generated dataset |
| `/__harness/theme.json` | Design tokens for light and dark |
| `/__harness/fleet-css/…` | Captured Fleet stylesheets from `local/context/css/` when those files exist |
| `/__harness/cdn/…` | `archetypes.json` and plugin files, straight from the repo |
| `/__harness/vendor` | Catalog of packaged jsDelivr files (Chart.js, highlight.js, Deep Chat) |
| `/__harness/vendor/…` | Those files, served locally so plugin loaders never leave the container |
| `/__harness/rest/v1/…` | PostgREST-shaped reads (Fleet names like `eval_tasks` alias onto the seed tables) |

In harness mode the host also publishes `window.__FLEET_UX_HARNESS_STATE__` with the detected
archetype and the plugins that loaded, which is how the tests assert detection without
scraping the console.

Everything is regenerated from a fixed seed, so IDs and text are the same on every boot and
tests can assert on specific records.

## Data

Nothing here comes from a production database, an ingest DB, or a page dump. The names, emails,
UUIDs, task text, QA comments and dispute notes are all generated in
`test/harness/seed/` from an invented vocabulary. The design tokens are the only thing taken
from the real site, and only as the `:root` and `.dark` custom-property values, so injected
chrome resolves the same colours it would in production.

### Shapes are real, the words are not

The seed builds 10 people and 90 tasks. Statuses, enum values and proportions are copied from
production and live in `test/harness/seed/distributions.js`; everything a human would read is
invented in `test/harness/seed/words.js`.

That means plugins see the values they actually branch on:

- **Lifecycle statuses** are the real ones — `production` (about three quarters of tasks),
  `staging`, `development`, `discarded`, `dismissed`, `bugged`, `disputed`,
  `escalated-fleet-review`, `recovery-verifier`. There is no `APPROVED` or `RETURNED`.
- **Version histories** are mostly a single version, with a tail of revised tasks up to five.
- **QA rows** land on about half the tasks, split near evenly between approvals and discards,
  with a small slice of negative system rows that have no author.
- **`feedback_data`** uses the documented payloads: `qa_checklist` and
  `prompt_quality_rating` on approvals, `rejection_reason` keys with matching labels on
  discards, and `bug_reason` / `bug_description` on bug flags.
- **Disputes** use the real `dispute_data.category` values and resolve either way, with
  several left pending so the queue has work in it.

A task's history agrees with where it ended up: a discarded task never sits under an approval,
and a revised task that shipped ends on one. `test/e2e/seed.spec.js` guards these shapes, so
retuning the generator will tell you if a proportion drifts far enough to matter.

**Column names and enums match production.** The harness uses the same field names the
extension queries (`task_id`, `version_no`, `eval_task`, `resolution`, `env_key`,
`display_src`, numeric `qa_feedback.id`, `dispute_status` values like `approved`/`rejected`,
and so on). Version 1 rows carry `metadata.problem_creation_time` (seconds) for the V1
Creation Time rating axis. `test/harness/seed/schema.js` lists every documented column per
table; the seed spec fails if any row is missing one.

Proportions come from a large offline sample, but no record, prompt, or piece of feedback prose
is copied from it. Discard-reason weights are an estimate, since those are not retained
offline; the reason keys themselves are the real ones.

## What is faked rather than real

- **Page shells** reconstruct Fleet chrome (logo, Work tabs, panel cards, QA header) from the
  `local/context` dumps, filled with synthetic seed data. Dumps are never served as-is — they
  contain Next.js payloads and live personal data. Plugin hooks (`data-ui`, panel ids, the
  prompt editor, disambiguation text) are still required; add one if a plugin cannot find it.
  When `local/context/css/` is present, those stylesheets are linked in addition to the
  committed theme tokens. CI without that folder uses the expanded `theme.css` fallback.
- **Server Actions** (`/dashboard/team` and friends) answer a stable harness protocol instead
  of Next.js action ids, which change on every deploy.
- **FOS and noVNC** are stub frames. No real VM, no VNC.
- **Chat providers** return empty. There is no OpenRouter call. Deep Chat itself still
  loads from the local vendor catalog so the widget can mount.
- **jsDelivr libraries** (Chart.js, highlight.js, Deep Chat) are packaged under
  `test/harness/vendor/` and rewritten onto `/__harness/vendor/…`. Add a new URL to
  `test/harness/server/vendor.js` and run `node test/harness/vendor/fetch.js`.
- **JWTs** are structurally valid but unsigned. Nothing verifies a signature.
- **PostgREST** implements the operators, embeds, ordering and counts the extension's queries
  need, not the full specification.
