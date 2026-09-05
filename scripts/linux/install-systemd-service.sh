#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

[[ "$(id -u)" == "0" ]] || {
  echo "Installing the Fornost systemd service requires root." >&2
  exit 77
}
require_command systemctl
require_command bash

engine="$(container_engine)"
unit_path="/etc/systemd/system/fornost-grc.service"

cat >"${unit_path}" <<EOF
[Unit]
Description=Fornost GRC container stack
Wants=network-online.target
After=network-online.target podman-restart.service

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=FORNOST_CONTAINER_ENGINE=${engine}
Environment=FORNOST_PROJECT_ROOT=${project_root}
ExecStart=/bin/bash ${project_root}/scripts/linux/systemd-start.sh
ExecStop=/bin/bash ${project_root}/scripts/linux/systemd-stop.sh
TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF

chmod 0644 "${unit_path}"
systemctl daemon-reload
systemctl enable fornost-grc.service >/dev/null

# The containers are normally already up at install time. Starting the unit is
# idempotent and also validates the same ordered startup path used after reboot.
systemctl restart fornost-grc.service
systemctl --no-pager --full status fornost-grc.service | sed -n '1,20p'
echo "Installed and enabled fornost-grc.service."
