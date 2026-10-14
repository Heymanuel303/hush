# AGENTS.md: Hush

Read this in full before every ticket. It is the source of truth for stack, commands and
conventions. If your change alters any of them, update this file in the same change.
`CLAUDE.md` is the longer narrative of the extension rules; this file is self-contained.

## What this is

A privacy-setup monorepo. The core is **Hush**, a cross-browser (Firefox + Chrome) Manifest V3
extension that hides Reddit posts, X tweets, YouTube videos and Google search results whose
text contains a user-defined keyword. Next to it lives the **Hush Household Hub**: a
self-hosted console (NestJS + Prisma on PostgreSQL, Vue 3 + shadcn-vue) that a parent runs on
the home server over the tailnet to define profiles and pair browsers; every enrolled Hush
pulls its profile's config. Around both live the pieces that reproduce the setup on a Linux
machine: `setup.sh`, the uBlock Origin config and filter lists (`browser/`, `filters/`) and
the home-server docs (`infra/`), which are docs and config only.

The hub's `apps/`, `packages/`, `e2e/` and `scripts/` form the pnpm workspace. The extension
(`src/`, `test/`) stays **outside** it: dependency-free, no build step, tested by
`pnpm ext:test` without any `pnpm install`.

## Product rules

- Config flows down, nothing flows up. No API route accepts device data except
  `POST /api/devices/pair` and the `GET /api/device/config` request whose arrival sets
  `lastSeenAt`. There is no stats endpoint, ever.
- The extension never imports from the workspace. Matching lives only in `src/lib/words.js`.
  The hub stores words as opaque strings and never interprets the `=` prefix; contracts check
  shape and length caps only.
- `blockWords`, `enabledPacks` and `siteWords` are never folded into one another, on either
  side.
- One admin account, configured from env. The Pi-hole secret is encrypted at rest
  (`SecretsService`, AES-256-GCM with `HUB_ENCRYPTION_KEY`) and never returned by any route
  (`hasSecret` only). Secrets never land in the repository.
- A locked profile makes the popup read-only. The Devices screen says that a device without
  the `policies.json` force-install can remove the extension.
- Every `RuleSet` write goes through `ProfileVersionService` inside a transaction; never write
  `RuleSet` elsewhere.
- No pricing claims in any copy.
- The extension gets no new runtime dependency and fetches only from the hub the user named.

## Stack

| Area      | Choice                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| Runtime   | Node 22.23 (`engines.node`, `engine-strict`), pnpm 12.9.1 through corepack       |
| Language  | TypeScript 6, strict, one version across the workspace                           |
| API       | NestJS 12 (ESM), Prisma 7 (`prisma-client`, `@prisma/adapter-pg`), PostgreSQL 17 |
| Web       | Vue 3.5 with Vite 8, Pinia 4, Vue Router 5                                       |
| UI        | Tailwind CSS 4, shadcn-vue 2 on reka-ui, `@lucide/vue`, IBM Plex Sans            |
| Contracts | Zod 4 schemas in `packages/contracts` (package `contracts`), for api and web     |
| Tests     | Vitest 4 everywhere, API tests against PostgreSQL, Playwright 1.63.0 exactly     |
| Lint      | api: oxlint 1 (Nest 12 default); web: ESLint 10 flat config + oxlint; Prettier 3 |
| Extension | Plain JS/HTML/CSS in `src/`, MV3, `node --test`, `web-ext` via `npx`; no deps    |

Playwright is baked into the agent container with its Chromium; never bump it alone.

## Layout

```
apps/api/                 NestJS API, every route under the global prefix /api
  src/health/             GET /api/health (from the starter kit)
  src/prisma/             global PrismaModule + PrismaService (driver adapter, DATABASE_URL)
  src/packs/              PacksSeed: upserts the built-in packs on bootstrap
  src/profiles/           profiles API (If-Match rule-set writes) + ProfileVersionService (the one Profile.version bump)
  src/devices/            pairing codes, POST /devices/pair, devices admin, DeviceGuard + GET /device/config (ETag)
  src/pihole/             Pi-hole connection routes, PiholeClient (one session per process), summary cache
  src/common/             Zod pipes, SecretsService (encrypt/decrypt with HUB_ENCRYPTION_KEY)
  src/templates/          TEMPLATES constant (young-kid, teen, calm-adult), served by GET /api/templates
  src/generated/          Prisma client output (git-ignored, `pnpm --filter api generate`)
  prisma/                 schema.prisma and migrations/; prisma.config.ts reads DATABASE_URL
  test/                   db.ts harness (createTestApp, resetDb), fake-pihole.ts (startFakePihole), schema.spec.ts, *.e2e-spec.ts
apps/web/                 Vue single-page app (Vite)
  src/assets/theme.css    every design token (light + dark), imported once in main.ts
  src/components/ui/      shadcn-vue primitives (CLI-generated, restyled once to the direction)
  src/components/layout/  AppShell.vue (header, nav, gutters), HushMark.vue
  src/components/state/   EmptyState, LoadingState, ErrorState
  src/components/pihole/  PiholeConnectionForm (shared by the Pi-hole screen and the setup wizard)
  src/components/words/   WordListEditor.vue: the only word editor in the web app (reuse it, never write a second)
  src/components/packs/   PackEditorDialog.vue (create/edit a household pack)
  src/lib/                api.ts (typed fetch client), utils.ts
  src/stores/             Pinia stores (auth, packs, pihole)
  src/router/             route table + the global auth guard
  src/views/              one <Name>View.vue per route (SignInView, stubs for the rest)
  src/components/layout/  also PageHeader.vue (title, description, action slot)
packages/contracts/       Zod schemas and inferred types shared by api and web
e2e/                      Playwright specs
scripts/                  db-init and the design lint (starter kit)
.github/workflows/        CI and docker-smoke workflows
src/                      the Hush extension (outside the workspace, see "The extension")
test/                     node --test unit tests for src/lib and src/data
browser/ filters/ infra/  uBO + Hush managed storage and policies, filter lists, home-server docs
docs/                     extension.md (full extension README) and plans/
```

## Commands

Run from the repository root (scripts of the root `package.json`).

| Task                 | Command                                                        |
| -------------------- | -------------------------------------------------------------- |
| Install              | `pnpm install`                                                 |
| Dev (api + web)      | `pnpm dev` (api :3000, web :5173 proxying `/api`)              |
| Lint                 | `pnpm lint`                                                    |
| Design lint          | `pnpm lint:design`                                             |
| Format               | `pnpm format`                                                  |
| Typecheck            | `pnpm typecheck`                                               |
| Unit + API tests     | `pnpm test` (also runs `pnpm ext:test`)                        |
| Browser tests        | `pnpm e2e`                                                     |
| Build                | `pnpm build`                                                   |
| Extension tests      | `pnpm ext:test` (`node --test "test/*.test.js"`, no install)   |
| Extension lint       | `pnpm ext:lint` (`web-ext lint`, needs network on first use)   |
| Extension in Firefox | `pnpm ext:start` / `pnpm ext:start:chromium` (needs a desktop) |
| Signed `.xpi`        | `pnpm ext:sign` (maintainer only, needs `.env`)                |

`node --test test/` fails on Node 22 (it loads `test` as a module); keep the glob form.
The api `build`, `dev`, `typecheck` and `test` scripts run `prisma generate` first.

## Services for tests

- **In the agent container:** `aib-start-postgres hush` prints the `DATABASE_URL` to export before
  running the api or its tests (the name accepts letters, digits and underscores only: write `-` as `_`).
- **On a developer machine:** `docker compose up -d` (the platform's PostgreSQL; `db-init` creates
  the role and database), with `DATABASE_URL` from `.env`. Without the platform, the overlay's
  `docker compose up -d postgres`.

Then apply the migrations: `pnpm --filter api exec prisma migrate deploy` (the api `pretest`
script does this itself when `DATABASE_URL` is set; without it, specs that touch the database fail).

The API test harness is `apps/api/test/db.ts`: `createTestApp()` builds the Nest app with the
`/api` prefix and shutdown hooks, `resetDb(prisma)` truncates every table (`RESTART IDENTITY CASCADE`)
so each spec starts clean. Specs share one database, so vitest runs files serially; call `resetDb`
in `beforeEach` (it also removes the built-in packs, which return on the next app boot).

## How to add

- **A Nest feature module:** `apps/api/src/<feature>/` with module, controller and service,
  imported in `app.module.ts`; `.js` suffixes on relative imports (ESM). Validate bodies with the
  Zod schema from `contracts`, never class-validator. Tests as `*.spec.ts` (unit) and
  `test/*.e2e-spec.ts` (through HTTP); both run in `pnpm test`. Reference: `src/packs/`
  (`packs.module.ts` imports `AuthModule`; `packs.controller.ts` has `@UseGuards(AdminGuard)`,
  `@ZodBody(PackCreate)` and `@Param(new ZodPipe(IdParam))`; `packs.service.ts` throws Nest
  exceptions with `{ error, message }` bodies; `test/packs.spec.ts` logs in and goes through HTTP).
  Any write to a `RuleSet` runs in `prisma.$transaction` and calls `ProfileVersionService`
  (`src/profiles/profile-version.service.ts`) with the transaction client to bump `Profile.version`.
- **A protected controller:** `@UseGuards(AdminGuard)` (from `src/auth/admin.guard.js`) on the
  controller or route, `AuthModule` imported in your feature module, and `@CurrentAdmin()` for the
  signed-in admin. Unauthenticated calls get 401 `unauthenticated`. Only `GET /api/health`,
  `GET /api/setup/status`, `POST /api/devices/pair` and `GET /api/device/config` skip the guard.
  Env is read once through `APP_CONFIG` (`src/config/config.ts`), never `process.env` in services.
- **A contract schema:** `packages/contracts/src/<area>.ts`, re-exported from `src/index.ts`, with
  a `*.test.ts` next to it. Export the schema and its `z.infer` type under the same name.
- **A contract (request/response body or route):** the Zod schema in `packages/contracts/src/<area>.ts`
  (shape and length caps only, never parse the `=` prefix), the route in `ROUTES` in
  `src/routes.ts`, and a case in the area's test. Controllers validate with `@ZodBody(Schema)` /
  `@ZodQuery(Schema)` from `apps/api/src/common/zod.pipe.ts`. Shared fixtures live under
  `test/fixtures/` (`device-config/`, `schedule/`); the extension tests read the same files.
  Constants mirrored from `src/` (packs, site ids, option keys) are pinned by tests: change both.
- **A Prisma migration:** edit `apps/api/prisma/schema.prisma`, then
  `pnpm --filter api exec prisma migrate dev --name <change>` with `DATABASE_URL` set; commit the
  generated `prisma/migrations/` folder.
- **A Vue view with its route:** `apps/web/src/views/<Name>View.vue`, a route in
  `src/router/index.ts`, a nav entry in `AppShell.vue` if it is top level; it renders inside the
  AppShell and handles loading, empty and error with the `components/state` components.
- **An API call from the web:** a function in `apps/web/src/lib/api.ts` named after the route in
  `contracts` `ROUTES` (`api.<area>.<verb>`); it parses the response with the contract schema and
  throws `ApiError {status, error, message, details}` on non-2xx (status 0 = network). Never call
  `fetch` from a view or store. Edits to a profile's rules pass the version through
  `api.profiles.putRules(id, version, rules)` (`If-Match`). Views are code-split and public routes
  (`meta: { public: true }`) render without the AppShell.
- **A Pinia store:** `apps/web/src/stores/<area>.ts` with `defineStore('<area>', ...)` (setup
  syntax), types from `contracts`, all fetches through the store.
- **A shadcn-vue primitive:** `cd apps/web && npx shadcn-vue@2 add <name>`, then restyle it to the
  Design direction (typeface, 6px radius, 36px height, no blur) in the same change.
- **A scheduled job:** a provider in the module that owns it, started from `onApplicationBootstrap`
  only when `config.workerEnabled` (`WORKER_ENABLED=true`, the `worker` service), never on the api
  replicas. Read time through an injectable clock (reference: `src/kid-mode/kid-mode.worker.ts`,
  `KID_MODE_CLOCK`) and expose a `tick()` so tests drive it with a fake clock instead of timers.
  The pass never throws: log, store the error on the row, retry next tick.

## Design rules

- Build app screens only from `apps/web/src/components/ui` and the `AppShell` layout.
- Use the theme tokens; never ad-hoc colors or inline styles.
- Every screen handles its loading, empty and error states.
- Every screen works at 375px and at 1280px wide.
- Public marketing pages (landing, pricing, anything a visitor sees before signing up) are
  the exception: custom section components under `apps/web/src/marketing` with their own
  layout, not held to the `components/ui` rule. They keep the theme's colour and font tokens
  so site and app read as one brand, and must not look assembled from a kit.
- `pnpm lint:design` must be green on every change; a hit is fixed, not ignored.
- An exception is a `design-lint-ignore <rule> <reason>` comment on the line, or declared once
  in the `Allowed:` line of the Design direction below.

## Design direction

Audience: technical parents and homelab households who already run Pi-hole and Tailscale; the tone is calm, plain and exact, like a well-kept admin console, never playful and never alarmist.
Typeface: IBM Plex Sans from Fontsource (`@fontsource/ibm-plex-sans`, weights 400, 500, 600) for everything; pairing codes, IP addresses and ETags use the system monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`).
Base: warm paper and ink. Light: background `#fbfaf8`, foreground `#1a1a1c`, card/surface `#ffffff`, muted surface `#f3f1ec`, muted text `#6b6b73`, border `rgba(26, 26, 28, 0.12)`. Dark: background `#1c1c1e`, foreground `#f2f2f5`, surface `#2a2a2d`, muted text `#9a9aa3`, border `rgba(255, 255, 255, 0.12)`. These are the extension popup's neutrals (`src/popup/panel-theme.css`).
Accent: Hush orange, `#d93a00` in light and `#ff5a1f` in dark (the extension's badge colour), used for primary buttons, the active side of switches, focus rings, the "paired" status dot and the pairing-code tiles. No second accent: locked and kid-mode states use the foreground colour plus a lucide icon (`lock`, `shield`). The extension's violet advanced-mode accent is **not** used in the hub.
Radius: 6px (`--radius: 0.375rem`) on buttons, inputs, badges, table cells and cards; 12px is allowed only on dialogs and on the pairing-code card.
Density: a 4px scale (4, 8, 12, 16, 24, 32); 40px table rows on Devices, Profiles and Packs; 36px inputs and buttons; 12px horizontal cell padding; page gutter 24px at 1280px and 16px at 375px; content column max 1120px.
Signature: the pairing code, six uppercase letter tiles in the accent on the monospace stack with a thin countdown bar beneath that drains over the ten minutes, together with the slashed-circle Hush mark in the header, so the console and the popup read as one product.

Allowed: none

## Per-replica state

The api runs with `API_REPLICAS` containers. In-memory state such as rate limits or timers is per
replica; anything that must be shared goes through the database.

- The pairing rate limit is in memory, per replica.
- Pairing codes, device tokens, profile versions and kid-mode state live in PostgreSQL.
- The admin session is the stateless signed cookie `hush_session` (HMAC with `SESSION_SECRET`,
  7 days); there is no server-side session state, so any replica validates any cookie.
- The login rate limit (10 attempts per minute per client IP, then 429) is in memory, per replica.
  The client IP is the first `X-Forwarded-For` entry: Caddy overwrites the header with the real
  peer, and nginx appends the Caddy address after it (the last entry is the same for everyone).
- Kid-mode schedules run only in the `worker` service, gated by `WORKER_ENABLED`.
- Each api or worker process holds its own Pi-hole session id (`PiholeClient`: one sid per
  process, renewed before `validity` runs out, re-authenticated once on 401, `DELETE /api/auth`
  on shutdown and when the stored connection changes). Pi-hole's default of 16 sessions is ample
  for api + worker; a 429 surfaces as `pihole_no_seats`.
- The `GET /api/pihole/summary` result is cached in memory for 30 s per replica, and dropped when
  the connection changes.

## Deployment

- `docker-compose.yml` (including its `db-init` service), `docker-compose.local.yml`,
  `.env.example`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf.template` and
  `scripts/db-init.mjs` come from the starter kit and keep their structure. Explain a deviation in a
  comment next to it.
- Migrations run in the `migrate` service, never at api start.
- On the platform the `db-init` service creates the role and database before `migrate`; the overlay
  (no platform) skips it.
- The api is `hush-api` and the web `hush-web` on the shared `apps` network. No service
  publishes a host port: the platform's Caddy serves the web container, locally at
  `http://hush.localhost`. Only the overlay publishes `WEB_PORT`.
- A new environment variable or service lands in `.env.example`, `docker-compose.yml` and the README
  configuration table in the same change.

## The extension

### Stack and rules

- Plain JavaScript (CommonJS guards), HTML and CSS under `src/`, loaded directly by the browser.
  **No build step, no bundler, no runtime dependencies.** It is not a workspace package and never
  imports from `apps/` or `packages/`. `pnpm ext:test` and `pnpm ext:lint` work before any
  `pnpm install`; the root `package.json` sets no `"type"` because the tests are CommonJS.
- Manifest V3. The background is declared as both `service_worker` (Chrome) and `scripts`
  (Firefox); each browser reads its own key. Firefox `strict_min_version` is 115.
- Formatting: `.editorconfig` (2 spaces, LF). Prettier ignores `src/`, `test/` and the config
  folders; there is no JS linter for the extension, so match the surrounding style.
- Files in `src/lib/` and `src/data/` end with a
  `if (typeof module !== "undefined" && module.exports) { ... }` guard so they work as a plain
  `<script>` and as a `require()`d module in the tests. Keep it on every file there.

### Layout

- `src/manifest.json`, `background.js`, `content.js`.
- `src/lib/words.js` (matching engine, `=` whole-word convention), `lib/format.js`,
  `lib/schedule.js` (quiet hours), `lib/hubconfig.js` (hub config validator).
- `src/data/packs.js` (`PACKS`), `data/sites.js` (`SITES` + `siteIdForHost`).
- `src/popup/` — `panel.html` plus per-feature classic scripts and stylesheets sharing one
  global scope. JS load order: `panel-core.js` → `panel-keywords.js` → `panel-packs.js` →
  `panel-sites.js` → `panel-hub.js` → `panel.js` (entry, **always last**). CSS: `panel-theme.css`
  (first, defines the custom properties) → `panel-header.css` → `panel-hero.css` →
  `panel-list.css` → `panel-packs.css` → `panel-sites.css` → `panel-hub.css` → `panel-misc.css` (last, its reduced-motion rule
  blankets earlier animations).
- `test/` — `words.test.js`, `format.test.js`, `packs.test.js`, `sites.test.js`,
  `schedule.test.js`, `hubconfig.test.js` (the last two read `test/fixtures/` JSON with `fs`).

### Checks and verifying in a container

Run `pnpm ext:test` and `pnpm ext:lint` before finishing any extension change. Add or update
tests for logic you change in `src/lib/` or `src/data/`; `content.js`, `background.js` and
`popup/` have none, so say what you verified by hand. The extension cannot be loaded in the
agent container: for popup changes, screenshot `src/popup/panel.html` as a `file://` URL in
Playwright Chromium (storage calls fail; the page renders) into `/tmp/screens`; for selector
changes, state which element and `data-testid` you targeted and why. Do not run `pnpm ext:sign`
or touch `.env`. Do **not** bump `"version"` in `src/manifest.json` unless the ticket asks:
Mozilla rejects re-signing an existing version.

### Architecture

Three execution contexts talk over `api.runtime` / `api.storage`. Every context file starts with
`const api = typeof browser !== "undefined" ? browser : chrome;`. Shared logic in `src/lib/` and
`src/data/` is loaded as plain `<script>`s **before** the file that uses it (manifest
`content_scripts`, `panel.html`), so its top-level functions and `const`s are in scope; `PACKS`
and `SITES` must stay top-level `const`s.

- **`src/lib/words.js`** — single source of truth for matching and the `=` whole-word
  convention: `escapeRegex`, `parseWord`, `composeWord`, `compileRule`, `matchesAny`,
  `dedupeWords`, `resolvePackWords`, `buildRules(customWords, packs, enabledPacks, siteWords?, hub?)`
  (`hub` = `{blockWords, packs, enabledPacks, siteWords}`, the hub profile's slice with its own packs).
  Never re-implement `=` parsing in a second place.
- **`src/lib/schedule.js`** — pure, guarded, tested. The single definition of quiet-hour
  semantics on the extension side (the api's `schedule.ts` mirrors it through the same
  `test/fixtures/schedule/cases.json`): `isQuiet(quietHours, now)`, `nextBoundary(quietHours, now)`.
  Hub rules apply inside the windows; no `quietHours` means always. Never throws.
- **`src/lib/hubconfig.js`** — pure, guarded, tested. `HUB_CAPS` (pinned to
  `test/fixtures/device-config/caps.json`) and `validateDeviceConfig(obj, siteIds, compile?)`;
  any violation rejects the whole config so the previous one stays. Uses `compileRule` from the
  shared scope (load `words.js` first).
- **`src/content.js`** — `rebuildRules()` compiles the union of **four sources**: custom words,
  enabled packs' words, the current site's per-site words and the hub profile (`hubConfig`;
  never written into the three local keys; hub packs use their own words, not `PACKS`).
  Quiet hours: hub rules (and hub `siteOptions`) apply only while `hubActive` = no `quietHours`
  or `isQuiet(...)`; local rules always. A single timeout at `nextBoundary` re-runs
  rebuild/unhide/scan/report so an edge applies without reload. Locked rule: when `hub.locked`,
  hub rules apply even if `enabled` is false; local rules and an unlocked hub still follow
  `enabled`. `ytHomeRedirect` = local || hub option (exact-host guard kept). `getCount` also
  replies `managed` (hub present). `currentSite()` delegates to `siteIdForHost`;
  `getSelectors()` returns per-site post-unit selectors; a `MutationObserver` rescans on every
  DOM change. Reports hidden counts to the background. `maybeRedirectHome()` implements
  `ytHomeRedirect`.
- **`src/lib/hubsync.js`** — pure, guarded, tested. `decideSync({status, body, etag, previous, now, siteIds, validate?})`
  → `{hubConfig, hubStatus, clearHub}`: the hub failure table. 200 valid → store config + etag;
  200 invalid → keep previous, `invalid`; 304 → `lastSync` only; 401 → drop `hub`+`hubConfig`,
  `revoked` (device falls back to local config); network/5xx → keep everything, `offline`
  (`offlineSince` set once). A failure never clears `locked` or the config.
- **`src/background.js`** — non-persistent event page. Owns the per-tab badge, the persisted
  all-time total and the **hub client**: the only place that talks to the hub and the only writer
  of the hub keys (on its own serialized `syncChain`, beside `writeChain`). Messages `hubPair`,
  `hubSync`, `hubDisconnect`; sync runs on the 15-minute `hub-sync` alarm, on `onInstalled`/
  `onStartup`, and on any wake when `hubStatus.lastAttempt` is older than 5 minutes (10 s fetch
  timeout, conditional GET with `If-None-Match`). Loads `lib/words.js`, `hubconfig.js`,
  `hubsync.js`, `data/sites.js` (Firefox `background.scripts`; Chrome `importScripts`).
  The extension fetches only from the hub origin the user named, config only, never uploads.
  `seedFromManaged()` copies `storage.managed` defaults into
  `storage.local` once, only when `blockWords` is undefined and `seededFromManaged` is unset.
- **`src/popup/`** — toggle, counts with a time-saved estimate, keyword editor, starter packs and
  advanced mode. `panel-core.js` holds the shim, DOM refs and shared state `let`s; each feature
  file owns its write chain; `panel.js` owns the toggle, stats, onboarding, the **single**
  `storage.onChanged` listener and the `init()` IIFE. Top-level code may only refer to
  earlier-loaded files.
- **Hub section and locked UI** (`panel-hub.js` / `panel-hub.css`): a collapsible "Household hub"
  section, shown only in advanced mode below the per-site editor: connect form (address, code,
  device label), connected status, Sync now, Disconnect (arm/confirm), and the line "Hush
  downloads rules from this hub. It never sends what you read or hide." The Connect click calls
  `permissions.request` **synchronously** before any `await` (Chrome requires it) and then sends
  `hubPair`. `hub`/`hubConfig`/`hubStatus` are read-only in the popup (no echo counter);
  `hubState`/`hubConfigState`/`hubStatusState`/`lockedState` live in `panel-core.js`. When
  `hubConfig.locked`, `body.locked` + `setLockedUI` disable every editing control through
  `controlsOff()` (`!enabledState || lockedState`; use it, never bare `!enabledState`) and show
  "Managed by <hub>". Disconnect is disabled while locked and `hubDisconnect` refuses in
  `background.js` (a locked device is released by revoking it on the hub). A revoked status shows a no-Undo toast once per `revokedAt` (the popup's
  only hub-related write is `hubRevokedSeen`). The site pill adds "· managed" from `getCount`.
- **Starter packs** are persistent toggles (`enabledPacks`); their words are never listed among
  custom words. A pack's `name` is its stable id.
- **Advanced mode** (`advanced`) recolours the panel via `--adv*` / `--accent*` and reveals the
  per-site editor. `siteWords` always apply to matching regardless of the toggle.
- **Per-site option switches** (`SITE_OPTIONS` in `panel-sites.js`) are plain boolean keys
  written with a simple `set`. Today: `ytHomeRedirect` (exact `www.`/`m.`/bare `youtube.com`
  only; `music.youtube.com` would loop).

State in `storage.local`: `blockWords` (custom words only), `enabledPacks` (default `[]`),
`siteWords` (`{siteId: [raw,...]}`, default `{}`), `enabled` (default ON), `advanced` (default
OFF), `ytHomeRedirect` (default OFF), `lifetimeHidden`, `seenOnboarding`, `seededFromManaged`, plus the hub keys: `hub` (`{url, deviceId, token, profileName, hubName, pairedAt}`), `hubConfig` (last validated `DeviceConfig` + `etag`) and `hubStatus` (`{lastSync, lastAttempt, error: null|'offline'|'invalid'|'revoked', offlineSince, revokedAt}`) — **written only by `background.js`** on `syncChain`; the popup and content script only read them.
All three contexts react live to `storage.onChanged`.

### How to add work

- **A new site:** a `SITES` entry in `src/data/sites.js`, its `matches` in `manifest.json`, its
  selectors in `getSelectors()`, a case in `test/sites.test.js`. A site's `id` is the stable key
  in `siteWords`. The hub mirrors site ids in `packages/contracts`, pinned by a test.
- **A new starter pack:** an entry in `src/data/packs.js`; `pnpm ext:test` checks integrity.
  Local data only, no fetch.
- **A broken site** is almost always a selector change in `getSelectors()`.
- **A new popup feature** gets its own `panel-<feature>.js` / `.css` in the right load-order
  position, with its own write chain and echo counter if it owns a read-modify-write key.
- **A new storage key** goes in the state list above and, if seeded, in `seedFromManaged()` and
  `browser/hush/managed-storage.json`.
- A change to the extension's stack, commands, layout or invariants updates this file and
  `CLAUDE.md`.

### Invariants to preserve

- **`lifetimeHidden` increments exactly once per hidden post.** All writes funnel through the
  single promise chain `writeChain` / `addToLifetime` in `background.js`.
- **DOM dataset flags drive counting:** `data-kb-hidden` = currently hidden (cleared on unhide or
  route change); `data-kb-counted` = already counted (**never cleared**). Keep them distinct.
- **Content → background deltas are at-least-once-guarded:** one delta-bearing message in flight
  (`pendingDelta` / `deltaInFlight`), requeued on send failure. `tabCount` is idempotent; the
  delta must not be lost.
- **SPA navigation is detected by URL change inside the observer tick** (`lastUrl` in
  `scheduleScan` / `handleRouteChange`), never by wrapping `history.pushState`. Route change
  clears `kbHidden` but keeps `kbCounted`.
- **`runtime.onMessage` listeners return `undefined` for unhandled messages** (else Firefox
  "message port closed" errors).
- **Every `blockWords` mutation goes through `queueWrite`** (add, `addMany`, remove, clear-all,
  undo, mode-pill toggle, inline rename), which bumps `pendingEchoes`. The only other writer is
  `seedFromManaged`, which writes only when the key does not exist yet.
- **`enabledPacks` has its own chain and echo counter** (`queuePackWrite` / `packWriteChain`,
  `pendingPackEchoes`); a stale echo would flip `togglePack`'s next decision. Never fold pack
  words into `blockWords`.
- **`siteWords` has its own chain and echo counter** (`queueSiteWrite` / `siteWriteChain`,
  `pendingSiteEchoes`). Each mutation replaces one site's array in a new object and repaints only
  that site (`paintSite`). In `content.js` only the current site's slice is folded into the rules.
- **No new runtime dependencies.** The only remote fetch the extension may make is to the hub
  the user named; nothing else.
