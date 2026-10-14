# Household Hub

**Slug:** `household-hub` (folder: `docs/plans/2026-10-13-household-hub/`)
**Created:** 2026-10-13
**Status:** in-progress

## Goal
Ship the Hush Household Hub end to end: a self-hosted console a parent runs on the home server over the tailnet, plus the hub client inside the existing extension. The parent defines profiles (words, packs, per-site words, site options, quiet hours, a locked flag) and pairs each browser with a six-character code; every enrolled Hush pulls its profile's config. Config flows down, nothing flows up. Kid mode moves a device's Tailscale IP into a Pi-hole Kid group through the v6 REST API. Operator guide: [`docs/hub.md`](../../hub.md).

## Scope
- `apps/api`, `apps/web`, `packages/contracts`, `e2e/`: the hub (22 tickets: scaffold, contracts, schema, six API, six web, four extension, docs, deployment, Playwright).
- `src/`: pure libs (`schedule.js`, `hubconfig.js`, `hubsync.js`), background sync, content rules, popup hub section.
- Docs: privacy line, operator guide, listing copy; the v5 kid-mode draft retired.

## Out of scope
- Any stats or upload endpoint, now or later.
- Price claims, in copy or docs. A one-time self-host licence is decided only after the survey.
- SafeSearch / Restricted Mode CNAMEs from the hub (they stay a Pi-hole-wide setting).
- Pushing config to devices (devices pull).

## Decisions
- **Stack:** the firm's standard. NestJS 12 + Prisma 7 stable (not the 8.0 release candidate) on PostgreSQL; Vue 3.5, Vite, Pinia, Tailwind 4, shadcn-vue 2; Zod 4 contracts; Playwright 1.63.0 exactly. Password hashing and secret encryption use `node:crypto` (scrypt, AES-256-GCM), so the api image needs no native build. One admin from env, signed HttpOnly session cookie.
- **No `require` of the extension from the API.** The api image does not contain `src/`; built-in packs, site ids and site-option keys are mirrored in `packages/contracts` and pinned to `src/data/*.js` by tests, and the extension re-validates every config with its own `hubconfig.js`.
- **Firefox 128 minimum** (desktop and Android). `optional_host_permissions` is ignored on 115 ESR, and the hub origin is requested at connect time through it; Android shows the prompt from 128. 128 is an ESR.
- **Quiet hours** are the windows in which hub rules apply; no `quietHours` means always. One semantics on both sides, pinned by `test/fixtures/schedule/cases.json`.
- **The worker owns kid-mode schedules.** Only the `worker` service (`WORKER_ENABLED=true`) runs the loop, so scaled api replicas never apply a schedule twice; while a schedule exists, the manual switch is ignored.
- **No stats endpoint.** The only device-originated requests are pairing and the conditional `GET /api/device/config`, whose arrival is `lastSeenAt`. The Devices screen shows only Pi-hole's own numbers.
- **Self-signed TLS.** Devices: unsupported, a browser extension cannot accept a self-signed certificate; use `http://` inside the tailnet or `tailscale serve`. Pi-hole: v6 serves self-signed HTTPS, so the hub accepts `http://` and an explicit `PIHOLE_TLS_INSECURE` opt-in.
- **Privacy line**, the same in `AGENTS.md`, `docs/extension.md` and `docs/listing.md`: the extension fetches only from a hub the user named, config only, never user data; `data_collection_permissions` stays `none` because nothing is uploaded; if AMO review disagrees, the declaration changes to the honest minimum and the copy says so.
- **Kid-mode draft retired.** `infra/pihole/kidmode.sh` (v5, sqlite3 on `gravity.db`) could not run on the v6 Docker Pi-hole and was deleted; the hub replaces it.

## Acceptance criteria
- [ ] API tests green against PostgreSQL; Playwright smoke and flow tests green.
- [ ] `pnpm ext:test` and `pnpm ext:lint` green with no install.
- [ ] A paired browser receives an edit within one alarm tick; a locked profile renders read-only; revoking a device drops it to local config.
- [ ] Kid mode moves a client through a Pi-hole v6 API (fake server in tests; the real server is a manual owner check).
- [ ] The Devices screen carries the bypass disclaimer; no credential lands in the repo.

## Open questions
- AMO review of `data_collection_permissions: none` with a hub fetch; if it disagrees, change the declaration to the honest minimum and the copy with it.
- The market gap is inferred, not surveyed; the release is gated on the survey.
