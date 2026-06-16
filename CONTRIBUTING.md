# Contributing to Word Block

Thanks for your interest in improving Word Block! This is a small, dependency-free
browser extension, so getting started is quick.

## Project philosophy

- **No build step, no bundler, no runtime dependencies.** The files in `src/` are
  loaded directly by the browser. Please keep it that way — vanilla JS, HTML, CSS.
- **Cross-browser.** It runs on both Firefox and Chrome (Manifest V3). Every
  execution context starts with the shim
  `const api = typeof browser !== "undefined" ? browser : chrome;`.
- **Privacy first.** Nothing is fetched and nothing leaves the browser; the
  manifest promises `data_collection: none`. Don't add network calls or trackers.
- **Readable over clever.** Comments explain the *why* of non-obvious code. Match
  the surrounding style when you edit.

## Getting set up

You need **Node 18+** to run the tests. That's it — there is nothing to install
(no `npm install` required; the test runner is built into Node).

```bash
git clone <your-fork-url>
cd word-block
npm test          # runs the unit tests (node --test)
```

### Load the extension while developing

- **Firefox:** open `about:debugging#/runtime/this-firefox` → **Load Temporary
  Add-on…** → pick `src/manifest.json`. (Removed when Firefox restarts.)
- **Chrome / Edge:** open `chrome://extensions` → enable **Developer mode** →
  **Load unpacked** → select the `src/` folder.

Or, with [`web-ext`](https://github.com/mozilla/web-ext) (fetched on demand):

```bash
npm start            # launches Firefox with the extension loaded + auto-reload
npm run start:chromium
npm run lint         # web-ext lint: validates the manifest and file references
```

## Project layout

```
src/
├── manifest.json        # MV3 manifest (declares all the files below)
├── background.js        # event page: toolbar badge + persisted all-time total
├── content.js           # injected into sites: hides matching posts, reports counts
├── popup/
│   ├── panel.html       # popup markup
│   ├── panel.css        # popup styles
│   └── panel.js         # popup UI logic
├── lib/
│   ├── words.js         # matching engine + the "=" whole-word convention (shared)
│   └── format.js        # number / duration formatting (popup)
└── data/
    └── packs.js         # starter-pack definitions (local data)

test/                    # node --test unit tests for the pure logic in lib/ + data/
```

The pure, browser-agnostic logic lives in `src/lib/` and `src/data/`. Those files
use a `module.exports` guard at the bottom so they can be both loaded as a plain
`<script>` in the browser **and** `require()`d by the Node tests — that's how we
test without a build step.

## Common changes

### A site stopped hiding posts

These sites change their HTML often. Open the browser inspector, find the element
that wraps the whole post/tweet/video/result, and add its tag or `data-testid` to
the matching list in `getSelectors()` (`src/content.js`).

### Add or edit a starter pack

Edit `src/data/packs.js`. Each pack is `{ name, words: [...] }`. A pack's `name`
is its stable id (renaming it drops users' toggle state). Prefix a word with `=`
for whole-word matching. `npm test` validates pack integrity (unique names,
non-empty words, everything compiles).

### Change matching behavior

The `=` whole-word convention and all matching live in `src/lib/words.js` — the
single source of truth shared by the content script and the popup. Update it
there (and the tests in `test/words.test.js`); never re-implement the convention
in a second place.

## Before you open a pull request

1. **`npm test` passes.** Add tests for any logic you add or change.
2. **`npm run lint` is clean** (runs `web-ext lint`).
3. **Respect the correctness invariants.** Counting, message delivery, and the
   storage write-chains are subtle. The non-obvious rules are documented in
   [`CLAUDE.md`](./CLAUDE.md) under "Invariants to preserve when editing" — please
   read that section before touching `background.js`, `content.js`, or the write
   chains in `panel.js`.
4. **Keep it dependency-free.** No new runtime dependencies.
5. **Don't bump `manifest.json` `version`** in your PR unless asked — releases are
   versioned by the maintainer (Mozilla rejects re-signing an existing version).

## Good first issues

- **Toolbar / store icons.** The extension currently ships without `icons` in the
  manifest. Adding a clean PNG icon set (16/32/48/96/128) would be a great first
  contribution.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
