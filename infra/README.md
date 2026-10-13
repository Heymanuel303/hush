# infra — the server, Tailscale and Pi-hole

Everything that runs **outside the browser**: the home server at
`192.168.1.11`, the tailnet that lets every device reach it from anywhere, and
the Pi-hole that every device resolves DNS through. Written from the live
state on 2026-09-24; the compose files themselves live in the server's own repo.

```
infra/
├── README.md                      this file
├── pihole/
│   ├── blocklists.md              which adlists are on, what to add for a Kid group
│   ├── kidmode.sh                 on|off|status toggle for one client — DRAFT, see "Kid mode"
│   └── 06-kidmode-cname.conf      SafeSearch / YouTube Restricted Mode via CNAME
└── tailscale/
    ├── harden-tailscale.sh        make tailscaled un-stoppable on a client (kid PC)
    └── unharden-tailscale.sh      revert
```

## The box

| | |
|---|---|
| Host | `manu-server`, Ubuntu 24.04 LTS, Docker 29 |
| LAN | `192.168.1.11` (`enp9s0`), ssh alias `nas` in `~/.ssh/config` (user `emmanuel`) |
| Storage | `/mnt/storage`, 15 TB, holds every service's data under `/mnt/storage/docker/` |
| Compose root | `~/infra/server` — git: `github.com/EmmanuelJanssens/server` |
| Secrets | `~/infra/server/.env` (git-ignored; `.env.example` lists every variable). **Never copy it into this repo.** |

`docker-compose.yml` there is just an `include:` list of `compose/*.yml`, one
file per service, all on the external `homelab` network. Services behind Caddy
(all `*.heymanuel.ch`): Nextcloud (`cloud`), Immich (`photos`), Jellyfin
(`music`), Open WebUI (`chat`), Vaultwarden (`vault`), Portainer, Trilium,
Pi-hole admin (`pihole`), qBittorrent (`torrents`), a local LLM UI (`llm`), plus
`splitflow`/`cookit` on `nestapps.ch` and the portfolio on `emmanueljanssens.ch`.
SearXNG runs there too. Day-to-day:

```bash
ssh nas
cd ~/infra/server
docker compose up -d            # (re)start everything
docker compose logs -f pihole   # one service's logs
docker compose pull && docker compose up -d   # update images
```

## Tailscale

Tailnet: `tail96175c.ts.net`, account `Heymanuel303@`. **The host's own
`tailscaled` is logged out on purpose** — every Tailscale identity on the server
is a container that shares its network namespace with the service it fronts:

| Container | Node name / IP | Mode | Fronts |
|---|---|---|---|
| `tailscale` (`compose/tailscale.yml`) | `homelab` · `100.66.37.110` | userspace | `caddy` (`network_mode: service:tailscale`) — all the `*.heymanuel.ch` sites |
| `tailscale-pihole` (`compose/pihole.yml`) | `pihole` · `100.126.224.9` | kernel (`/dev/net/tun`, `NET_ADMIN`) | `pihole` — DNS on `:53`, admin UI on `:80` (published as `192.168.1.11:53` and `:8070`) |
| `tailscale-vpn` (`torrent/docker-compose.yml`) | `protonvpn-exit` | kernel, `--advertise-exit-node` | `gluetun` (ProtonVPN WireGuard) + `qbittorrent` — a VPN exit node for the tailnet |

Each container takes a `TS_AUTHKEY` from `.env` and keeps its identity in a
named volume (`tailscale-state`, `tailscale-pihole`, ...). Re-creating the
volume = a new node in the admin console; delete the stale one there.

Other nodes seen on the tailnet: `emmanuel-ws`, `framanuel` (this laptop),
`manupc`, `manudows`, `emmanuels-mac-mini`, `vps-heymanuel` (`100.126.37.34`,
the public entry point, `ssh vps`) and the phone (`100.124.117.46`).

### DNS flow

1. **Tailscale admin console → DNS**: global nameserver `100.126.224.9`
   (the `pihole` node) with **Override local DNS** on. `tailscale dns status`
   on any node shows `Resolvers: 100.126.224.9`, MagicDNS on.
2. Every device with **Use Tailscale DNS** on (`tailscale set --accept-dns=true`;
   the toggle in the phone app) sends all DNS to Tailscale's local stub
   (`100.100.100.100`), which forwards to the Pi-hole over the tailnet — on any
   network, home or not. On a systemd-resolved machine `resolvectl status`
   shows `tailscale0` with `DNS Domain: ~.` and `Default Route: yes`.
3. Pi-hole answers from its lists or forwards upstream (`dns.upstreams` in
   `pihole.toml`: `8.8.8.8`, `8.8.4.4`).
4. LAN devices that don't run Tailscale: point the router's DHCP DNS at
   `192.168.1.11` (port 53 is published on the LAN address only).

Quick check from any device: `dig +short doubleclick.net` → `0.0.0.0` means the
Pi-hole answered. `./setup.sh status` in this repo runs that check.

## Pi-hole

Pi-hole **v6** (`pihole/pihole:latest`, core 6.4.3) in Docker, config in
`/etc/pihole/pihole.toml` inside the `pihole-etc` volume, `listeningMode = "ALL"`
(it must accept queries arriving on the `tailscale0` interface). Admin UI:
`http://192.168.1.11:8070/admin` or `https://pihole.heymanuel.ch`; password is
`PIHOLE_PASSWORD` in `.env`.

Current state (see [`pihole/blocklists.md`](pihole/blocklists.md) for the list
URLs and what to add):

- Adlists: StevenBlack hosts, Hagezi **Ultimate**, Hagezi Social, Hagezi NSFW,
  and three "Social-media-Blocklists" (facebook, instagram, tiktok).
- Groups: only `Default`. Clients: the phone (`100.124.117.46`, "Telephone Manu").
- Allowlist: `fc.yahoo.com`.

v6 specifics that bite when following v5 guides:

- **No `sqlite3` in the container** and gravity lives in a volume: manage
  lists, groups and clients through the UI or the REST API
  (`POST /api/auth` with `{"password": ...}` → `sid` header, then
  `/api/lists`, `/api/groups`, `/api/clients`, `/api/domains`, `/api/config`).
- `/etc/dnsmasq.d/*.conf` snippets are **ignored** unless
  `misc.etc_dnsmasq_d = true` in `pihole.toml`. It is `false` today, so the
  existing `10-heymanuel.conf` (`address=/heymanuel.ch/192.168.1.11`) does
  nothing and `heymanuel.ch` resolves to its public address (`65.108.158.254`,
  the VPS). Either flip that setting or put the record under `dns.hosts` /
  the UI's *Local DNS records*.
- CNAME records go in `dns.cnameRecords` (UI: *Local DNS → CNAME records*), or
  `pihole-FTL --config dns.cnameRecords '["www.youtube.com,restrictmoderate.youtube.com", ...]'`
  inside the container. That's the v6 form of `pihole/06-kidmode-cname.conf`.
- Reload lists after changes: `docker exec pihole pihole -g`.

## Adding a Linux machine

```bash
git clone git@github.com:Heymanuel303/hush.git && cd hush
./setup.sh --tailscale        # installs tailscale if missing, `tailscale up --accept-dns=true`
./setup.sh status             # tailnet joined? DNS via Pi-hole?
```

Phone: Tailscale app → log in → **Use Tailscale DNS** on. Add it under Pi-hole
*Clients* by its Tailscale IP if it should get a non-default group.

### Locking a client so DNS can't be bypassed

On a kid PC, DNS filtering only holds if Tailscale keeps running:
`sudo ./setup.sh --harden` runs [`tailscale/harden-tailscale.sh`](tailscale/harden-tailscale.sh):
a `tailscaled` drop-in with `RefuseManualStop=yes` + `Restart=always`, a
one-minute systemd timer that re-enables/starts/`tailscale up`s it, and
`chattr +i` on both files so a plain `rm` fails. Pair it with the browser policy
(`browser/firefox/policies.json`: DoH locked off, so Firefox can't route
around the system resolver). `unharden-tailscale.sh` reverts all of it. A user
with sudo can still undo this; it stops casual bypass, not an admin.

## Kid mode (draft)

Goal: one client (the shared phone) gets stricter lists + forced SafeSearch /
YouTube Restricted Mode, toggled from the phone over SSH. The pieces:

- `pihole/blocklists.md` — which lists belong to a `Kid` group.
- `pihole/06-kidmode-cname.conf` — the CNAME rewrites (device-wide, apps too).
- `pihole/kidmode.sh` — moves the client between groups and installs/removes
  the CNAMEs.

**Status: written for a bare-metal Pi-hole v5** (it uses `sqlite3` on
`gravity.db` and `/etc/dnsmasq.d`). On this server it needs porting to the v6
REST API (`PATCH /api/clients/{ip}` for the group, `PATCH /api/config` for
`dns.cnameRecords`) — not done yet. The threat-model table and setup order in
the old draft are still right: whole sites → Pi-hole lists; explicit results →
CNAME; same-host feeds (Shorts, Reels) → `filters/strict-mode.txt` in the
browser; keyword posts → Hush. Firefox for Android ignores policies, so on the
phone the DNS + CNAME layers carry the safety and the browser filters are
comfort.

## Known issues (2026-09-24)

- `dns.upstreams` in `pihole.toml` also lists `100.126.224.9` — the Pi-hole
  itself. Harmless while the two Google resolvers answer, but pointless;
  remove it.
- Three adlists use `github.com/.../blob/...` URLs, which serve HTML, not the
  list. Use the `raw.githubusercontent.com` form (see `blocklists.md`).
- `tailscale-vpn` is logged out (`register request: http 400: node ... already
  exists`): its state volume holds a node key the console no longer knows.
  Delete the stale node in the admin console (or the volume) and re-up it.
- The host's `/etc/resolv.conf` points at `8.8.8.8`, so the server itself
  doesn't use the Pi-hole. Fine for a server; change it if you want its own
  traffic filtered.
