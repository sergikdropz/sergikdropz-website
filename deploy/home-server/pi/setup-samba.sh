#!/usr/bin/env bash
# Run ON the Raspberry Pi once (after Tailscale SSH works).
# Creates /srv/sergik SMB share for repo + media.
set -euo pipefail

SHARE_DIR="${SHARE_DIR:-/srv/sergik}"
SHARE_USER="${SUDO_USER:-${USER}}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash setup-samba.sh"
  exit 1
fi

apt-get update -y
apt-get install -y samba samba-common-bin tailscale

mkdir -p "$SHARE_DIR/media" "$SHARE_DIR/repo"
chown -R "$SHARE_USER:$SHARE_USER" "$SHARE_DIR"

if ! grep -q '^\[sergik\]' /etc/samba/smb.conf; then
  cat >> /etc/samba/smb.conf <<EOF

[sergik]
   path = ${SHARE_DIR}
   browseable = yes
   read only = no
   guest ok = no
   force user = ${SHARE_USER}
   create mask = 0644
   directory mask = 0755
EOF
fi

echo "Set an SMB password for ${SHARE_USER}:"
smbpasswd -a "$SHARE_USER"
systemctl enable --now smbd nmbd
tailscale set --ssh
echo "SMB share: smb://raspberrypi/sergik"
echo "Tailscale SSH: tailscale ssh ${SHARE_USER}@raspberrypi"
