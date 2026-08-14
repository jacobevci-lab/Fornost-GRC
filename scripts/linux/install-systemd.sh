#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/linux/install-systemd.sh" >&2
  exit 77
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_user="${APP_USER:-${SUDO_USER:-}}"
port="${PORT:-3000}"

[[ -n "${app_user}" && "${app_user}" != "root" ]] || {
  echo "Set APP_USER to the non-root account that owns the repository." >&2
  exit 64
}

unit_path="/etc/systemd/system/nexora-grc.service"

cat >"${unit_path}" <<EOF
[Unit]
Description=Nexora GRC local Linux service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${app_user}
WorkingDirectory=${project_root}
Environment=NODE_ENV=production
Environment=PORT=${port}
ExecStart=/usr/bin/bash ${project_root}/scripts/linux/serve.sh
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=-${project_root}/.sites-runtime -${project_root}/.wrangler

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now nexora-grc.service
systemctl --no-pager --full status nexora-grc.service

echo "Installed ${unit_path}."
