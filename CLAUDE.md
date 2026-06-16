# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A cross-browser (Firefox + Chrome) **MV3** browser extension that hides Reddit posts, X tweets, YouTube videos, and Google search results whose text contains a user-defined keyword. No build step, no bundler, **no runtime dependencies** — the plain JS/HTML/CSS files in `src/` are loaded directly by the browser. Pure, browser-agnostic logic is split into `src/lib/` + `src/data/` and unit-tested with Node's built-in test runner (no `npm install` needed).

## Project layout

- `src/` — everything that ships in the extension (the `web-ext` source dir):
  - `manifest.json`, `background.js`, `content.js`
  - `popup/` — `panel.html`, `panel.css`, `panel.js`
  - `lib/` — `words.js` (matching engine + the `=` whole-word convention), `format.js` (number/duration formatting)
  - `data/packs.js` — starter-pack definitions
- `test/` — `node --test` unit tests for the pure logic in `src/lib/` and `src/data/`
- Repo root — `package.json`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`, this file. `package.json` is **not** shipped (it's outside `src/`).

The files in `src/lib/` and `src/data/` end with a `if (typeof module !== "undefined" && module.exports) { ... }` guard so they work both as a plain browser `<script>` (the guard is a no-op there) **and** as a `require()`d CommonJS module in the Node tests. This is how the project tests without a build step.

## Commands

- **Run tests:** `npm test` (alias for `node --test`). Needs Node ≥18; nothing to install.
- **Lint:** `npm run lint` (`web-ext lint` via npx — validates the manifest and that referenced files exist).
- **Load for dev (Firefox):** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `src/manifest.json`. Or `npm start` (web-ext, with auto-reload). Removed on restart.
- **Load for dev (Chrome):** `chrome://extensions` → Developer mode → Load unpacked → pick the `src/` folder.
- **Sign / build a permanent `.xpi`:** `npm run sign` (runs `web-ext sign --source-dir src --channel=unlisted`). Credentials come from `.env` env vars (`WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`; see `.env.example`) — `.env` is git-ignored, never commit it. Output lands in `web-ext-artifacts/`. Mozilla rejects re-signing an existing version, so **bump `src/manifest.json` `version` before every sign.**

## Architecture

Three execution contexts talk over `api.runtime`/`api.storage` messaging. Every context file starts with `const api = typeof browser !== "undefined" ? browser : chrome;` — the Firefox/Chrome shim. The manifest declares background as **both** `service_worker` (Chrome) and `scripts` (Firefox); each browser reads its own key.

Shared, browser-agnostic logic lives in `src/lib/` and is loaded as plain `<script>`s **before** the context file that uses it (content scripts share an isolated-world scope; the popup shares the document's script scope), so the lib's top-level functions are simply in scope:

- **`src/lib/words.js`** — the matching engine and **single source of truth** for the `=` whole-word convention: `escapeRegex`, `parseWord`, `composeWord`, `compileRule`, `matchesAny`, `dedupeWords`, `resolvePackWords`, `buildRules`. Both `content.js` and `popup/panel.js` use it, so they can never disagree about what a stored word means.
- **`src/lib/format.js`** — `formatNumber`, `formatDuration` (popup display only).

The execution contexts:

- **`src/content.js`** — injected into the four site groups. `rebuildRules()` calls `buildRules(customWords, PACKS, enabledPacks)` (from `lib/words.js`) to compile the **union** of custom words and the words of every enabled pack into `{needle, re}` rules. It hides matching "post units" (`getSelectors()` returns per-site CSS selectors), tests text with `matchesAny`, and re-scans on every DOM mutation via a `MutationObserver` (sites lazy-load on scroll). Reports counts to the background.
- **`src/background.js`** — non-persistent event page. Owns the per-tab toolbar badge and the persisted all-time total. Wakes on incoming messages. (Uses only the `api` shim + storage; loads no lib.)
- **`src/popup/panel.html` / `panel.css` / `panel.js`** — the toolbar popup UI: on/off toggle, per-tab + all-time counts (incl. a "time saved" estimate), keyword list editor (per-row whole-word pill, double-click rename, bulk paste, undo toast), and starter packs. **Starter packs are persistent on/off toggles** (membership in `enabledPacks`), not one-shot "add" buttons — enabling a pack activates its words for matching but **never** lists them among the custom words. The "Blocked words" list shows custom words (`blockWords`) only. CSS is in `panel.css` (linked from `panel.html`), no longer inline.
- **`src/data/packs.js`** — `const PACKS = [{name, words}]`, loaded by `panel.html` **before** `panel.js` and by `content.js` (manifest `content_scripts`, listed before `content.js`). Must stay a top-level `const` so the next script in the shared scope sees it. Local data only (no fetch), so it keeps the `data_collection: none` promise. A pack's `name` is its stable id in `enabledPacks`; renaming a pack drops its toggle state. It carries the same `module.exports` guard as the lib files so the tests can validate it.

State lives in `storage.local`: `blockWords` (array, custom words only), `enabledPacks` (array of pack names, default `[]`), `enabled` (bool, default ON), `lifetimeHidden` (number), `seenOnboarding` (bool). All three contexts react live to `storage.onChanged`.

**Whole-word convention:** a `blockWords` entry with a leading `=` (e.g. `=cat`) means whole-word; a bare word stays case-insensitive substring. This convention now lives in **one place**, `src/lib/words.js`: `compileRule` turns each entry into `{needle, re}` (the `=` compiles to a Unicode `\p{L}\p{N}_`-boundary regex, falling back to substring if it can't build); `parseWord`/`composeWord` split/join the `=` for display vs storage. Both `content.js` (matching) and `panel.js` (the row UI) call these same functions, and `test/words.test.js` covers them — never re-implement the `=` parsing in a second place.

## Invariants to preserve when editing

These are the non-obvious correctness rules the code is built around — breaking them causes lost counts, double-counts, or "message port closed" errors:

- **`lifetimeHidden` must increment exactly once per hidden post.** `storage.local` has no atomic increment, so all writes funnel through a single promise chain (`writeChain` / `addToLifetime` in `background.js`). `panel.js` has a parallel `writeChain` for `blockWords` read-modify-writes. Don't write these keys from multiple places.
- **DOM dataset flags drive counting:** `data-kb-hidden` = currently hidden (cleared on unhide/route change); `data-kb-counted` = already counted toward lifetime total (**never cleared**, so toggling off/on or editing words never re-counts). Keep these distinct.
- **Content→background delta delivery is at-least-once-guarded:** `content.js` keeps one delta-bearing message in flight (`pendingDelta`/`deltaInFlight`) and requeues on send failure. The badge (`tabCount`) is idempotent and self-heals; the delta must not be lost.
- **SPA navigation is detected by URL change inside the observer tick** (`lastUrl` in `scheduleScan`/`handleRouteChange`), not by wrapping `history.pushState` — that's unreliable on Firefox due to Xray isolation. Route change clears `kbHidden` but keeps `kbCounted`.
- **`runtime.onMessage` listeners must return `undefined` for unhandled messages.** Returning a value/promise for messages meant for another listener is the documented cause of Firefox "message port closed" errors.
- **`panel.js` uses `pendingEchoes`** to ignore `storage.onChanged` echoes of its own optimistic `blockWords` writes (preserving row animations) while still re-rendering when another popup edits the list. **Every** `blockWords` mutation — add, `addMany` (bulk paste), remove, clear-all, undo, mode-pill toggle, inline rename — must go through `queueWrite` (which bumps `pendingEchoes`) and update the DOM optimistically; never write `blockWords` from a second path. Undo stashes the pre-change array and restores it via `queueWrite(() => snapshot)`.
- **`enabledPacks` has its own serialized chain (`queuePackWrite` / `packWriteChain`) and its own echo counter (`pendingPackEchoes`)** — separate from `blockWords`'s, so the two keys never share a read-modify-write. Echo suppression **is** required even though pack toggles have no row animations: the in-memory `enabledPacks` is what `togglePack` reads to compute the next click's action (`turningOn`), so a stale `storage.onChanged` echo of an in-flight write would corrupt that decision (flip an intended on→off). `queuePackWrite` bumps `pendingPackEchoes` before the write (decrements if it throws); the `onChanged` handler swallows one echo per pending self-write and only re-syncs/repaints — and auto-opens the section — for **another** popup's edit. Pack toggles must go only through `queuePackWrite`; never fold pack words into `blockWords`.

## DOM selector maintenance

These sites change their markup regularly. When posts stop being hidden, the fix is almost always updating the per-site selector arrays in `getSelectors()` (`src/content.js`) — inspect the element wrapping the whole post and add its tag or `data-testid`. Matching is **case-insensitive substring** (`matchesAny` in `src/lib/words.js`); `cat` matches "category". On X, blocking a user works via `@handle` since the handle is in the tweet text.
