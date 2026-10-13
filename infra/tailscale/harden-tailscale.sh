#!/bin/bash
set -e
mkdir -p /etc/systemd/system/tailscaled.service.d
cat > /etc/systemd/system/tailscaled.service.d/hardening.conf <<'CONF'
[Unit]
RefuseManualStop=yes

[Service]
Restart=always
RestartSec=1
CONF

cat > /usr/local/sbin/tailscale-watchdog <<'SH'
#!/bin/bash
systemctl is-enabled tailscaled >/dev/null 2>&1 || systemctl enable tailscaled
systemctl is-active tailscaled >/dev/null 2>&1 || systemctl start tailscaled
state=$(tailscale status --json 2>/dev/null | grep -o '"BackendState": *"[^"]*"' | cut -d'"' -f4)
[ "$state" = "Running" ] || tailscale up
SH
chmod 755 /usr/local/sbin/tailscale-watchdog

cat > /etc/systemd/system/tailscale-watchdog.service <<'SVC'
[Unit]
Description=Keep Tailscale running

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/tailscale-watchdog
SVC

cat > /etc/systemd/system/tailscale-watchdog.timer <<'TMR'
[Unit]
Description=Check Tailscale every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now tailscale-watchdog.timer
chattr +i /etc/systemd/system/tailscaled.service.d/hardening.conf /usr/local/sbin/tailscale-watchdog
echo "Done. To undo: chattr -i on both files, rm them, disable the timer, daemon-reload."
