# Hush Household Hub: operator guide

The hub is a small console you run on the home server. In it you define **profiles** (words,
starter packs, per-site words, site options, quiet hours, a locked flag), pair each browser
running [Hush](extension.md) to a profile with a six-character code, and optionally move a
device into a stricter Pi-hole group ("kid mode"). Every paired Hush pulls its profile's config;
the hub never pushes and never receives anything back.

## What it is and is not

- It **is** a place to write rules once and have every household browser follow them.
- It is **not** monitoring. The hub stores no browsing history, no hidden-post counts, no list
  of what anyone read or hid. There is no stats endpoint and no upload route: a device sends
  only its pairing request and then, every 15 minutes, a request for its config (whose arrival
  is the "last seen" time on the Devices screen).
- The extension fetches only from a hub the user named, config only, never user data. It never
  learns anything else about the network.
- The only numbers the Devices screen shows come from Pi-hole itself.

## Install

The hub is a Docker Compose stack: PostgreSQL, a one-shot `migrate`, the `api`, a `worker` (the
kid-mode schedule loop) and `web` (nginx serving the console and proxying `/api`). On a home
server without the hosting platform, use the local overlay:

```sh
git clone git@github.com:Heymanuel303/hush.git && cd hush
cp .env.example .env
# in .env: uncomment COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml,
# set ADMIN_EMAIL, ADMIN_PASSWORD, HUB_NAME,
# SESSION_SECRET=$(openssl rand -base64 32), HUB_ENCRYPTION_KEY=$(openssl rand -base64 32)
docker compose up -d --build
```

The overlay publishes the console on `http://localhost:8080` (`WEB_PORT`). Do not open that
port to the internet or the LAN router: reach the hub **only over the tailnet**.

### Reach it over the tailnet

With `tailscaled` on the server, `tailscale serve` puts the console behind a trusted HTTPS
certificate on the machine's tailnet name:

```sh
tailscale serve --bg 8080
# → https://<machine>.<tailnet>.ts.net  proxies to http://127.0.0.1:8080
```

Then set `PUBLIC_WEB_URL=https://<machine>.<tailnet>.ts.net` and `COOKIE_SECURE=true` in `.env`
and `docker compose up -d` again. Where Tailscale runs as a container next to each service (as in
[`../infra/README.md`](../infra/README.md#tailscale)), give the hub its own `tailscale` sidecar
and run the same `tailscale serve` inside it.

Plain `http://<tailscale-ip>:8080` also works inside the tailnet (WireGuard already encrypts
it). What does **not** work is a self-signed certificate: the extension's `fetch` rejects it and
a browser extension cannot be told to accept it. See
[Why plain HTTP or Tailscale HTTPS](extension.md#why-plain-http-or-tailscale-https).

## Environment

Every variable, its default and its meaning is in the
[README configuration table](../README.md#configuration). The ones an operator sets:

| Variable | What to put |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The single admin account. Synced at every api start; change the password here and restart. |
| `HUB_NAME` | The name devices show ("Managed by <name>"). |
| `SESSION_SECRET` | `openssl rand -base64 32`; signs the session cookie. |
| `HUB_ENCRYPTION_KEY` | `openssl rand -base64 32`; encrypts the Pi-hole app password at rest. Back it up (see Backup). |
| `PIHOLE_TLS_INSECURE` | `true` only if the hub reaches Pi-hole over its self-signed HTTPS. Affects the Pi-hole connection only, never devices. |
| `WORKER_ENABLED` | Leave it alone: compose sets it `true` on the `worker` service and `false` on the api, so a schedule runs exactly once. |

## First run

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. A hub with no profiles opens the setup wizard:
connect Pi-hole (skippable), create the first profile from a template, pair the first device. The
wizard stays reachable from **Setup guide** in the navigation.

## Profiles and templates

A profile is a set of rules plus a locked flag. Three templates are offered when creating one:
**Young kid** (locked), **Teen** (locked) and **Calm adult** (not locked, the household defaults
plus the Politics pack). Edit the words, packs, per-site words and site options in the tabbed
profile editor. Words follow the extension's convention: a leading `=` means whole word; the
hub stores them as typed.

Each save bumps the profile's version. If two tabs edit the same profile, the second save is
refused (see 412 under Troubleshooting).

## Pairing

On **Devices**, **Pair a device**, pick the profile: the hub shows a six-character code with a
bar that drains over its ten-minute life. On the device, open Hush, turn on **Advanced**, open
**Household hub**, enter the hub address, the code and a device name, and **Connect**. The
browser asks for permission to reach that address only. The device appears on the Devices
screen and picks up edits within one 15-minute alarm tick (or at once with **Sync now** in its
popup).

**Revoke** a device from its row menu on the Devices screen to release it: on its next sync Hush drops the hub's
rules and returns to the device's own words.

## Locked profiles

A locked profile makes the popup read-only under "Managed by <hub name>", applies the hub's rules
even when Hush is switched off, and disables Disconnect. Only revoking the device on the hub
releases it.

The bypass caveat, exactly as the Devices screen shows it:

> The hub manages what Hush hides. It cannot stop someone removing or disabling Hush on a device that is not force-installed by a browser policy. For a locked device see browser/firefox/policies.json in the repository.

That policy is [`../browser/firefox/policies.json`](../browser/firefox/policies.json); see
[`../browser/README.md`](../browser/README.md#locked-device-kid-pc).

## Quiet hours

Quiet hours are the windows in which the **hub's rules apply**. Outside every window the device
follows only its own words. A profile with no quiet hours applies all the time. Windows are
evaluated in the profile's time zone; the extension re-applies at each window edge without a
page reload. The same semantics run on both sides, pinned by a shared fixture
(`test/fixtures/schedule/cases.json`).

## Pi-hole connection

The hub talks to Pi-hole **v6** through its REST API. On the **Pi-hole** screen enter:

- the Pi-hole address (`http://…` or, with `PIHOLE_TLS_INSECURE=true`, its self-signed
  `https://…`);
- an **app password**: Pi-hole admin → *Settings → Web interface / API* (expert mode) →
  *Configure app password*, copy it once. It is stored encrypted and never shown again;
- the name of the Kid group.

Create the **Kid** group and its lists in Pi-hole first, under *Group management* (*Groups*,
then assign adlists under *Lists*). A client in a non-default group gets **only that group's
lists**, so put every list a kid device should keep (ads, malware) in the Kid group too.
Suggested lists: [`../infra/pihole/blocklists.md`](../infra/pihole/blocklists.md).

The hub keeps one Pi-hole session per process and signs out on shutdown, so it uses one of
Pi-hole's API seats.

## Kid mode

Kid mode moves one device's **Tailscale IP** (set it on the device's row; a `100.x` address)
from Pi-hole's Default group to the Kid group, and back. Turn it on or off by hand, or give it a
schedule. A schedule is owned by the `worker` service, which checks it every minute; while a
schedule exists the manual switch is ignored.

The hub does **not** change SafeSearch or YouTube Restricted Mode. Those CNAME rewrites are a
Pi-hole-wide setting that applies to every client; set them once in Pi-hole if you want them,
see [`../infra/pihole/06-kidmode-cname.conf`](../infra/pihole/06-kidmode-cname.conf).

## Backup

The hub's state is the PostgreSQL volume **plus `HUB_ENCRYPTION_KEY`**. The Pi-hole app password
in the database is encrypted with that key; a database restored next to a different key cannot
decrypt it, and the Pi-hole connection has to be saved again. Keep the key with the backup, never
in the repository. Devices hold their own token, so a restored hub keeps its pairings.

## Troubleshooting

- **A device shows offline.** It has not fetched its config for three alarm ticks (45 minutes).
  Usually the browser has been closed, or the device is off the tailnet (Tailscale switched off),
  so the hub address is unreachable. On the device, open the
  popup's Household hub section and press **Sync now**: the status there says whether the hub is
  unreachable. While offline the device keeps its last config, lock included.
- **429, "Pi-hole has no free API sessions".** Pi-hole allows a fixed number of API sessions
  (`webserver.api.max_sessions`, default 16) and, when they are used up, also locks out its own
  web UI. Wait for old sessions to expire (30 minutes) or raise the limit in Pi-hole's settings;
  check that nothing else on the network logs in to the API in a loop. A 429 on pairing is
  different: too many wrong codes, wait a minute.
- **412, "The profile changed since you loaded it".** The profile was saved from another tab or
  browser after you opened it. Reload the profile, re-apply your change, save.
- **Connect fails on the device.** Check the address opens in that browser, that it is not a
  self-signed `https://` address, and that the code has not expired (ten minutes).
