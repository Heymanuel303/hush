# Hush

A privacy-focused setup for my Linux machines, reproducible from one clone.
Three layers, versioned together:

| Layer              | What                                                                                                                              | Where                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Browser**        | uBlock Origin with a fixed baseline + the **Hush** extension (hides Reddit/X/YouTube/Google posts by keyword) with default words  | [`browser/`](browser/README.md), [`filters/`](filters/README.md), [`src/`](docs/extension.md) |
| **Network**        | Tailscale tailnet, every device resolving DNS through a Pi-hole on the home server                                                | [`infra/`](infra/README.md)                                                                   |
| **Household Hub**  | Self-hosted console on the home server: profiles, browser pairing, Pi-hole kid mode; every paired Hush pulls its profile's config | [`docs/hub.md`](docs/hub.md), [`apps/`](#household-hub)                                       |
| **Locked devices** | Firefox policy + un-stoppable Tailscale for a kid PC; Pi-hole kid mode through the hub                                            | [`browser/firefox/`](browser/firefox/policies.json), [`infra/tailscale/`](infra/tailscale/)   |

## New Linux machine

```bash
git clone git@github.com:Heymanuel303/hush.git && cd hush
./setup.sh                 # uBO baseline into every Firefox found; Hush defaults where Hush is installed
./setup.sh --tailscale     # join the tailnet, DNS via the Pi-hole (sudo)
./setup.sh status          # what's active on this machine
```

Then install the two extensions if they aren't yet: uBlock Origin from
[addons.mozilla.org](https://addons.mozilla.org/firefox/addon/ublock-origin/),
Hush from a signed `.xpi` (`pnpm ext:sign`, see [docs/extension.md](docs/extension.md#permanently-on-firefox-signed-xpi)).
Re-run `./setup.sh` after installing Hush so its defaults get picked up, and
restart Firefox.

Kid PC: `sudo ./setup.sh --locked --harden` on top.

## Layout

```
setup.sh            bootstrap a Linux machine (see --help)
browser/            uBO + Hush managed-storage manifests, locked-device policies
filters/            uBlock Origin filter lists (YouTube/social cleanup, strict mode), fetched by URL
infra/              server at 192.168.1.11: Tailscale, Pi-hole, kid mode, client hardening
apps/api/           Household Hub API (NestJS + Prisma, PostgreSQL)
apps/web/           Household Hub console (Vue 3 + shadcn-vue)
packages/contracts/ Zod schemas shared by api and web
e2e/                Playwright specs for the hub
scripts/            db-init and the design lint
src/                the Hush extension (Firefox + Chrome, MV3, no build step)
test/               node --test unit tests for src/lib and src/data
docs/               extension docs, hub operator guide, listing copy, plans
```

## Household Hub

The Hush Household Hub is a self-hosted console for technical parents and homelab households
who already run Pi-hole and Tailscale. The parent runs it on the home server, reachable over the
tailnet, defines profiles (words, starter packs, per-site words, site options, quiet hours, a
locked flag) and pairs each browser running Hush with a six-letter code. Every paired Hush pulls
its profile's config; nothing flows back: the hub has no stats endpoint and the extension fetches
only from the hub the user named. Kid mode moves a device's Tailscale IP into the Pi-hole Kid
group through the Pi-hole v6 API. Install, pairing, kid mode and backup: [docs/hub.md](docs/hub.md).
Conventions for working on it are in [AGENTS.md](AGENTS.md).

## Prerequisites

- **Node.js 22.23** (`engines.node` is enforced; installs fail on other versions).
- **pnpm 12.9.1** through corepack: `corepack enable`. The corepack of older Node
  distributions cannot start current pnpm; update it with `npm i -g corepack@latest` and run
  `corepack enable` again.
- **Docker** with the compose plugin and the platform stack running (`deploy/platform/` in the
  board repository: PostgreSQL, Caddy and the `apps` network). Without it, see
  [Without the platform](#without-the-platform).

## Run from a fresh clone

```sh
cp .env.example .env   # then set SESSION_SECRET, the database password and PLATFORM_PROVISION_TOKEN
pnpm install
docker compose up -d   # db-init creates the role and database, migrate applies the migrations
pnpm dev
```

The web app is on <http://localhost:5173> and the api answers on <http://localhost:3000/api/health>.
The web dev server proxies `/api` to the api, so the browser talks to one origin. The containers
serve the same app at <http://hush.localhost>.

## Configuration

`.env.example` lists every variable; `pnpm dev` and docker compose both read the root `.env`.

| Variable                   | Default                                          | Meaning                                                                                                                       |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_FILE`             | `docker-compose.yml`                             | compose files to load; without the platform add `:docker-compose.local.yml`                                                   |
| `API_DATABASE_URL`         | `postgres://hush:<password>@db:5432/hush`        | connection string of the `db-init`, `migrate` and `api` containers on the platform's PostgreSQL                               |
| `PLATFORM_PROVISION_TOKEN` | _(required)_                                     | the platform's `PROVISION_TOKEN`; db-init presents it to create the role and database on first start                          |
| `PLATFORM_PROVISION_URL`   | `http://platform-provision:8080`                 | the platform's provision service on the `apps` network                                                                        |
| `API_REPLICAS`             | `1`                                              | number of `api` containers                                                                                                    |
| `DATABASE_URL`             | `postgres://hush:<password>@localhost:5432/hush` | PostgreSQL for `pnpm dev` and Prisma on the host: the same role through the platform's host port (not read by the containers) |
| `VITE_API_BASE`            | `/api`                                           | prefix of every api call from the web app (build arg of the web image)                                                        |
| `SESSION_SECRET`           | _(required)_                                     | signs the session cookie; compose refuses to start without it                                                                 |
| `ADMIN_EMAIL`              | _(required in production)_                       | email of the single admin account; synced to the database at every api start (dev default `admin@hush.local`)                 |
| `ADMIN_PASSWORD`           | _(required in production)_                       | password of the admin; re-hashed on start when it changes (dev default `hush-dev-password`)                                   |
| `HUB_ENCRYPTION_KEY`       | _(required in production)_                       | 32 random bytes, base64 (`openssl rand -base64 32`): encrypts the Pi-hole app password at rest; dev uses a fixed key (warned) |
| `PIHOLE_TLS_INSECURE`      | `false`                                          | `true` accepts Pi-hole's self-signed HTTPS certificate, for the Pi-hole connection only                                       |
| `WORKER_ENABLED`           | `false`                                          | `true` only on the `worker` service: runs the kid-mode schedule loop (every 60 s); the api replicas keep `false`              |
| `HUB_NAME`                 | `Hush Hub`                                       | name of the hub, returned to devices when they pair                                                                           |
| `PUBLIC_WEB_URL`           | `http://hush.localhost`                          | public origin of the web app (with `pnpm dev`: `http://localhost:5173`)                                                       |
| `COOKIE_SECURE`            | `false`                                          | `true` behind HTTPS so the session cookie gets `Secure`                                                                       |
| `PORT`                     | `3000`                                           | port the api listens on outside Docker (the containers always use 3000)                                                       |
| `NODE_ENV`                 | `development`                                    | the `api` container sets `production`                                                                                         |
| `WEB_EXT_API_KEY`          | _(maintainer only)_                              | AMO signing key for `pnpm ext:sign`; extension only, not read by the hub                                                      |
| `WEB_EXT_API_SECRET`       | _(maintainer only)_                              | AMO signing secret for `pnpm ext:sign`; extension only, not read by the hub                                                   |

## Commands

Run from the repository root (scripts of the root `package.json`).

| Task             | Command                                           |
| ---------------- | ------------------------------------------------- |
| Install          | `pnpm install`                                    |
| Dev (api + web)  | `pnpm dev` (api :3000, web :5173 proxying `/api`) |
| Lint             | `pnpm lint`                                       |
| Design lint      | `pnpm lint:design`                                |
| Format           | `pnpm format`                                     |
| Typecheck        | `pnpm typecheck`                                  |
| Unit + API tests | `pnpm test` (also runs `pnpm ext:test`)           |
| Browser tests    | `pnpm e2e`                                        |
| Build            | `pnpm build`                                      |
| Extension tests  | `pnpm ext:test` (no install needed)               |
| Extension lint   | `pnpm ext:lint`                                   |
| Extension dev    | `pnpm ext:start`, `pnpm ext:start:chromium`       |
| Signed `.xpi`    | `pnpm ext:sign`                                   |

## Browser tests

Install Chromium once, then run the suite:

```sh
pnpm exec playwright install chromium
pnpm e2e
```

## Deploy with Docker

### On the platform (locally and in production)

```sh
cp .env.example .env   # then set SESSION_SECRET, the password in API_DATABASE_URL and PLATFORM_PROVISION_TOKEN
docker compose up -d --build
```

The stack joins the platform's external `apps` network and publishes no host port. `db-init`
creates the role and database named in `API_DATABASE_URL`, `migrate` applies the migrations, then
the api starts, then the web container; nginx in the web container proxies `/api` to the api. The
platform's Caddy proxies to `hush-web:80`: on a developer machine every app is at
`http://<app>.localhost` (here <http://hush.localhost>), on a server behind the app's
`sites/<app>.caddy`. Production additionally sets `PUBLIC_WEB_URL` to the public origin,
`COOKIE_SECURE=true` and, to scale, `API_REPLICAS` (see "Per-replica state" in AGENTS.md).

### Without the platform

Set `COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml` in `.env` (the commented line in
`.env.example`), then `docker compose up --build`. The overlay provides PostgreSQL (`DATABASE_URL`
for `pnpm dev` becomes `postgres://postgres:postgres@localhost:5432/hush`, host port
`POSTGRES_PORT`), skips `db-init`, replaces the `apps` network with a throwaway one and publishes the
web container on <http://localhost:8080> (`WEB_PORT`). The `docker-smoke` workflow runs this way.

## The Hush extension

Hides posts on **Reddit**, tweets on **X**, videos on **YouTube** and results on
**Google Search** whose text contains a word you choose. Whole-word mode,
starter packs, per-site words, hidden-post counter, light/dark, and an optional
household hub. The extension fetches only from a hub the user named, config only,
never user data; `data_collection_permissions` stays `none` because nothing is
uploaded. Full docs, install and Android notes: [docs/extension.md](docs/extension.md);
store listing copy: [docs/listing.md](docs/listing.md).

```bash
pnpm ext:test     # unit tests (Node 22, nothing to install)
pnpm ext:lint     # web-ext lint
pnpm ext:start    # Firefox with the extension + auto-reload
pnpm ext:sign     # signed .xpi (needs .env, bump src/manifest.json version first)
```

Contributions to the extension: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Emmanuel Janssens
