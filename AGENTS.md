# AGENTS.md

Read this before you change anything. `CLAUDE.md` is the longer narrative
version of the same rules for Claude Code sessions; this file is the one
build and review agents follow, and it is self-contained.

## What this is

A privacy-setup monorepo. The core is **Hush**, a cross-browser (Firefox +
Chrome) Manifest V3 extension that hides Reddit posts, X tweets, YouTube
videos and Google search results whose text contains a user-defined keyword.
Around it live the pieces that reproduce the whole setup on a Linux machine:
`setup.sh`, the uBlock Origin config and filter lists (`browser/`,
`filters/`) and the home-server docs (`infra/`). Those non-extension folders
are docs and config only; nothing in them is loaded by the extension or the
tests.

## Stack

- Plain JavaScript (CommonJS guards), HTML and CSS under `src/`, loaded
  directly by the browser. **No build step, no bundler, no runtime
  dependencies**, and no `npm install`: `package.json` has no dependencies
  and is not shipped.
- Manifest V3. The background is declared as both `service_worker` (Chrome)
  and `scripts` (Firefox); each browser reads its own key. Firefox
  `strict_min_version` is 115.
- Node >= 18 for the tests (`node --test`, built in). `web-ext` runs through
  `npx --yes`, so lint downloads it on first use; that needs network access.
- Formatting: `.editorconfig` (2 spaces, LF, final newline, UTF-8). There is
  no formatter or JS linter; match the surrounding style.

## Layout

- `src/` — everything that ships (the `web-ext` source dir):
  - `manifest.json`, `background.js`, `content.js`
  - `lib/words.js` (matching engine, the `=` whole-word convention),
    `lib/format.js` (number and duration formatting)
  - `data/packs.js` (starter packs, `PACKS`), `data/sites.js` (curated site
    registry, `SITES` + `siteIdForHost`)
  - `popup/` — `panel.html` plus per-feature classic scripts and stylesheets
    sharing one global scope. JS load order: `panel-core.js` →
    `panel-keywords.js` → `panel-packs.js` → `panel-sites.js` → `panel.js`
    (entry, **always last**). CSS load order: `panel-theme.css` (first, it
    defines the custom properties) → `panel-header.css` → `panel-hero.css` →
    `panel-list.css` → `panel-packs.css` → `panel-sites.css` →
    `panel-misc.css` (last, its reduced-motion rule blankets earlier
    animations).
- `test/` — `node --test` unit tests for `src/lib/` and `src/data/`
  (`words.test.js`, `format.test.js`, `packs.test.js`, `sites.test.js`).
- `browser/` — Firefox managed-storage manifests for uBO and Hush that
  `setup.sh` installs, and the locked-device enterprise policies.
- `filters/` — uBlock Origin filter lists, fetched by raw GitHub URL. Not
  shipped.
- `infra/` — home server docs (Tailscale, Pi-hole). Secrets never go here.
- `docs/` — `extension.md` (the full extension README; the root `README.md`
  is the repo umbrella) and `plans/`.
- Root — `setup.sh`, `package.json`, `README.md`, `CONTRIBUTING.md`,
  `LICENSE`, `.env.example`, this file.

Files in `src/lib/` and `src/data/` end with a
`if (typeof module !== "undefined" && module.exports) { ... }` guard so they
work as a plain browser `<script>` and as a `require()`d module in the tests.
Keep that guard on every file in those folders.

## Commands

```sh
npm test          # node --test; nothing to install
npm run lint      # npx --yes web-ext lint --source-dir src
npm start         # web-ext run in Firefox with auto-reload (needs a desktop)
npm run sign      # builds a signed .xpi; needs WEB_EXT_API_KEY/SECRET in .env
```

Run `npm test` and `npm run lint` before you finish; both must be clean. Add
or update tests for any logic you change in `src/lib/` or `src/data/`.
Logic in `content.js`, `background.js` and `popup/` has no automated tests;
say in your result what you verified by hand and what you could not.

Do not run `npm run sign` and do not touch `.env`. Do **not** bump
`"version"` in `src/manifest.json` unless the ticket asks for it: releases
are versioned by the maintainer, because Mozilla rejects re-signing an
existing version.

## Verifying in a container

There is no desktop browser session in the agent container, so the
extension cannot be loaded into Firefox or Chrome there and the content
scripts cannot be exercised against the live sites. What you can do:

- `npm test` for everything in `src/lib/` and `src/data/`.
- `npm run lint` to validate the manifest and that every referenced file
  exists.
- For popup changes, open `src/popup/panel.html` as a `file://` URL in
  Playwright Chromium to screenshot the layout. The `api` shim will be
  `chrome` without extension APIs, so storage calls fail; the page still
  renders. Keep screenshots under `/tmp/screens`, never in the repository.
- For selector changes in `content.js`, state which element and
  `data-testid` you targeted and why; the reviewer cannot load the site.

## Architecture

Three execution contexts talk over `api.runtime` / `api.storage` messaging.
Every context file starts with
`const api = typeof browser !== "undefined" ? browser : chrome;`.

Shared logic in `src/lib/` and `src/data/` is loaded as plain `<script>`s
**before** the context file that uses it (in `manifest.json`
`content_scripts` for the content script, in `panel.html` for the popup), so
its top-level functions and `const`s are simply in scope. `PACKS` and
`SITES` must stay top-level `const`s for that reason.

- **`src/lib/words.js`** — single source of truth for matching and the `=`
  whole-word convention: `escapeRegex`, `parseWord`, `composeWord`,
  `compileRule`, `matchesAny`, `dedupeWords`, `resolvePackWords`,
  `buildRules(customWords, packs, enabledPacks, siteWords?)`. Both
  `content.js` and the popup call these; never re-implement `=` parsing in
  a second place.
- **`src/content.js`** — injected into the four site groups.
  `rebuildRules()` compiles the union of custom words, enabled packs' words
  and the current site's per-site words into `{needle, re}` rules.
  `currentSite()` delegates to `siteIdForHost`. `getSelectors()` returns the
  per-site CSS selectors for a "post unit"; a `MutationObserver` rescans on
  every DOM change (sites lazy-load on scroll). Reports hidden counts to the
  background. `maybeRedirectHome()` implements the `ytHomeRedirect` option.
- **`src/background.js`** — non-persistent event page. Owns the per-tab
  badge and the persisted all-time total. Loads no lib. Runs
  `seedFromManaged()` on every wake: copies `storage.managed` defaults into
  `storage.local` once, only when `blockWords` is still undefined and
  `seededFromManaged` is unset.
- **`src/popup/`** — the toolbar popup: on/off toggle, per-tab and all-time
  counts with a time-saved estimate, keyword editor (whole-word pill,
  double-click rename, bulk paste, undo toast), starter packs and advanced
  mode. `panel-core.js` holds the shim, cached DOM refs and the shared state
  `let`s; each feature file owns its storage write chain; `panel.js` owns
  the toggle, stats, onboarding, the **single** `storage.onChanged` listener
  and the `init()` IIFE. Top-level code may only refer to earlier-loaded
  files; cross-file calls inside function bodies are fine.
- **Starter packs** are persistent on/off toggles (`enabledPacks`), never
  one-shot adds, and their words are never listed among the custom words. A
  pack's `name` is its stable id; renaming it drops its toggle state.
- **Advanced mode** (`advanced` bool) recolours the panel through the
  `--adv*` / `--accent*` variables in `panel-theme.css` and reveals the
  per-site word editor. Per-site words (`siteWords`) always apply to
  matching regardless of the toggle; advanced mode is only their editor.
- **Per-site option switches** (`SITE_OPTIONS` in `panel-sites.js`) are
  plain boolean storage keys written with a simple `set`, so they need no
  write chain. Adding one = an entry in `SITE_OPTIONS` plus handling the key
  in `content.js`. The one today is `ytHomeRedirect` (sends `youtube.com/`
  to `/feed/subscriptions` on exact `www.`/`m.`/bare hosts only;
  `music.youtube.com` would loop).

State in `storage.local`: `blockWords` (custom words only), `enabledPacks`
(default `[]`), `siteWords` (`{siteId: [raw,...]}`, default `{}`), `enabled`
(default ON), `advanced` (default OFF), `ytHomeRedirect` (default OFF),
`lifetimeHidden`, `seenOnboarding`, `seededFromManaged`. All three contexts
react live to `storage.onChanged`.

## How to add work

- **A new site** is three coordinated edits: a `SITES` entry in
  `src/data/sites.js`, its `matches` pattern(s) in `manifest.json`, and its
  selectors in `getSelectors()` in `content.js`. Add a case to
  `test/sites.test.js`. A site's `id` is the stable key in `siteWords`;
  renaming it drops that site's saved words.
- **A new starter pack** is an entry in `src/data/packs.js`; `npm test`
  checks pack integrity (unique names, non-empty, deduped words). Local data
  only, no fetch, to keep the manifest's `data_collection_permissions`
  promise that nothing leaves the browser.
- **A broken site** (posts no longer hidden) is almost always a selector
  change: inspect the element wrapping the whole post and add its tag or
  `data-testid` to that site's array in `getSelectors()`.
- **A new popup feature** gets its own `panel-<feature>.js` and
  `panel-<feature>.css`, linked from `panel.html` in the right position of
  the load order, with its own write chain and echo counter if it owns a
  read-modify-write key.
- **A new storage key** is documented in the state list above and, if it is
  seeded from managed storage, added to `seedFromManaged()` and to
  `browser/hush/managed-storage.json`.
- A change to the stack, a command, the layout or an invariant comes with
  the matching update to this file and to `CLAUDE.md`.

## Invariants to preserve

Breaking these causes lost counts, double counts or "message port closed"
errors.

- **`lifetimeHidden` increments exactly once per hidden post.**
  `storage.local` has no atomic increment, so all writes funnel through the
  single promise chain `writeChain` / `addToLifetime` in `background.js`.
- **DOM dataset flags drive counting:** `data-kb-hidden` = currently hidden
  (cleared on unhide or route change); `data-kb-counted` = already counted
  toward the lifetime total (**never cleared**). Keep them distinct.
- **Content → background deltas are at-least-once-guarded:** `content.js`
  keeps one delta-bearing message in flight (`pendingDelta` /
  `deltaInFlight`) and requeues on send failure. The badge `tabCount` is
  idempotent; the delta must not be lost.
- **SPA navigation is detected by URL change inside the observer tick**
  (`lastUrl` in `scheduleScan` / `handleRouteChange`), never by wrapping
  `history.pushState` (unreliable on Firefox because of Xray isolation).
  Route change clears `kbHidden` but keeps `kbCounted`.
- **`runtime.onMessage` listeners return `undefined` for unhandled
  messages.** Returning a value or promise for another listener's message
  is the documented cause of Firefox "message port closed" errors.
- **Every `blockWords` mutation goes through `queueWrite`** in the popup
  (add, `addMany`, remove, clear-all, undo, mode-pill toggle, inline
  rename), which bumps `pendingEchoes` so the single `storage.onChanged`
  listener ignores the echo of its own optimistic write but re-renders on
  another popup's edit. The only other writer is `seedFromManaged` in
  `background.js`, which writes only when the key does not exist yet.
- **`enabledPacks` has its own chain and echo counter** (`queuePackWrite` /
  `packWriteChain`, `pendingPackEchoes`). Echo suppression is required
  because `togglePack` reads the in-memory array to decide the next click;
  a stale echo would flip an intended on → off. Never fold pack words into
  `blockWords`.
- **`siteWords` has its own chain and echo counter** (`queueSiteWrite` /
  `siteWriteChain`, `pendingSiteEchoes`). Every mutation reads the whole
  object, returns a new object with that site's array replaced, and
  repaints only that site (`paintSite`). Never fold per-site words into
  `blockWords`. In `content.js` only the current site's slice is folded into
  the rules; an edit to any site triggers `rebuildRules` and a rescan.
- **No new runtime dependencies**, and no code that fetches remote data.
