# Hush

A privacy-focused setup for my Linux machines, reproducible from one clone.
Three layers, versioned together:

| Layer | What | Where |
|---|---|---|
| **Browser** | uBlock Origin with a fixed baseline + the **Hush** extension (hides Reddit/X/YouTube/Google posts by keyword) with default words | [`browser/`](browser/README.md), [`filters/`](filters/README.md), [`src/`](docs/extension.md) |
| **Network** | Tailscale tailnet, every device resolving DNS through a Pi-hole on the home server | [`infra/`](infra/README.md) |
| **Locked devices** | Firefox policy + un-stoppable Tailscale for a kid PC; Pi-hole kid mode (draft) | [`browser/firefox/`](browser/firefox/policies.json), [`infra/tailscale/`](infra/tailscale/) |

## New Linux machine

```bash
git clone git@github.com:Heymanuel303/hush.git && cd hush
./setup.sh                 # uBO baseline into every Firefox found; Hush defaults where Hush is installed
./setup.sh --tailscale     # join the tailnet, DNS via the Pi-hole (sudo)
./setup.sh status          # what's active on this machine
```

Then install the two extensions if they aren't yet: uBlock Origin from
[addons.mozilla.org](https://addons.mozilla.org/firefox/addon/ublock-origin/),
Hush from a signed `.xpi` (`npm run sign`, see [docs/extension.md](docs/extension.md#permanently-on-firefox-signed-xpi)).
Re-run `./setup.sh` after installing Hush so its defaults get picked up, and
restart Firefox.

Kid PC: `sudo ./setup.sh --locked --harden` on top.

## Layout

```
setup.sh            bootstrap a Linux machine (see --help)
browser/            uBO + Hush managed-storage manifests, locked-device policies
filters/            uBlock Origin filter lists (YouTube/social cleanup, strict mode), fetched by URL
infra/              server at 192.168.1.11: Tailscale, Pi-hole, kid mode, client hardening
src/                the Hush extension (Firefox + Chrome, MV3, no build step)
test/               node --test unit tests for src/lib and src/data
docs/               extension docs and plans
```

## The Hush extension

Hides posts on **Reddit**, tweets on **X**, videos on **YouTube** and results on
**Google Search** whose text contains a word you choose. Whole-word mode,
starter packs, per-site words, hidden-post counter, light/dark, nothing leaves
the browser. Full docs, install and Android notes: [docs/extension.md](docs/extension.md).

```bash
npm test          # unit tests (Node 18+, nothing to install)
npm run lint      # web-ext lint
npm start         # Firefox with the extension + auto-reload
npm run sign      # signed .xpi (needs .env, bump src/manifest.json version first)
```

Contributions to the extension: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Emmanuel Janssens
