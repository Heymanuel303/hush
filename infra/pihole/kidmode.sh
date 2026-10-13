#!/usr/bin/env bash
# kidmode.sh on|off|status — flip one client (the shared phone) into a stricter
# Pi-hole group and enable/disable the SafeSearch CNAME rewrites.
#
# Nothing changes on the phone itself, so there is nothing to tamper with.
# Run on the Pi-hole (e.g. over Tailscale SSH: `ssh pihole sudo kidmode on`).
#
# STATUS: DRAFT for a bare-metal Pi-hole v5. The home server runs Pi-hole v6 in
# Docker (no sqlite3 in the container, dnsmasq.d disabled) — port this to the
# v6 REST API before use. See ../README.md "Kid mode".
#
# Setup once (Pi-hole admin → Group management):
#   Groups   → create "Kid"
#   Adlists  → assign the NSFW/gambling/bypass lists (see blocklists.md) to Kid
#              (keep the everyday lists in Default; Kid should ALSO have them —
#              a client in a non-default group only gets that group's lists)
#   Domains  → wildcard blocks for Kid only: tiktok.com, instagram.com, …
#   Clients  → add the phone by its TAILSCALE IP (that's what Pi-hole sees)
#
# Then edit the two variables below.
set -euo pipefail

CLIENT_IP="100.x.y.z"      # phone's Tailscale IP (pihole -q shows what it sees)
KID_GROUP="Kid"            # group name created in the admin UI
DEFAULT_GROUP_ID=0         # Pi-hole's built-in Default group

GRAVITY=/etc/pihole/gravity.db
CNAME_SRC="$(dirname "$(readlink -f "$0")")/06-kidmode-cname.conf"
CNAME_DST=/etc/dnsmasq.d/06-kidmode-cname.conf

die() { echo "kidmode: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
command -v sqlite3 >/dev/null || die "sqlite3 not installed"

client_id=$(sqlite3 "$GRAVITY" "SELECT id FROM client WHERE ip='$CLIENT_IP';")
[ -n "$client_id" ] || die "client $CLIENT_IP not in Pi-hole (add it under Clients first)"
kid_gid=$(sqlite3 "$GRAVITY" "SELECT id FROM \"group\" WHERE name='$KID_GROUP';")
[ -n "$kid_gid" ] || die "group '$KID_GROUP' not found"

set_group() { # $1 = group id
  sqlite3 "$GRAVITY" "DELETE FROM client_by_group WHERE client_id=$client_id;
                      INSERT INTO client_by_group (client_id, group_id) VALUES ($client_id, $1);"
}

reload() {
  # v5 and v6 spell it differently; try both, ignore the one that doesn't exist.
  pihole restartdns reload-lists 2>/dev/null || pihole reloadlists 2>/dev/null || true
  pihole restartdns 2>/dev/null || true
}

case "${1:-status}" in
  on)
    set_group "$kid_gid"
    if [ -d /etc/dnsmasq.d ] && [ -f "$CNAME_SRC" ]; then
      install -m 644 "$CNAME_SRC" "$CNAME_DST"
    else
      echo "kidmode: no /etc/dnsmasq.d — Pi-hole v6? add the CNAMEs to pihole.toml [dns] cnameRecords" >&2
    fi
    reload; echo "kid mode ON for $CLIENT_IP" ;;
  off)
    set_group "$DEFAULT_GROUP_ID"
    rm -f "$CNAME_DST"
    reload; echo "kid mode OFF for $CLIENT_IP" ;;
  status)
    g=$(sqlite3 "$GRAVITY" "SELECT g.name FROM client_by_group cg JOIN \"group\" g ON g.id=cg.group_id WHERE cg.client_id=$client_id;")
    printf 'client %s → group: %s\ncname rewrites: %s\n' "$CLIENT_IP" "${g:-<none>}" "$([ -f "$CNAME_DST" ] && echo ON || echo off)" ;;
  *) die "usage: kidmode.sh on|off|status" ;;
esac
