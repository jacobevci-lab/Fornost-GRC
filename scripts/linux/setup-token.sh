#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"
cd "${project_root}"

require_command sha256sum

base_path="$(read_setting FORNOST_BASE_PATH /fornost-grc)"
https_port="$(read_setting FORNOST_HTTPS_PORT 8443)"
state_dir_setting="${FORNOST_STATE_DIR:-$(read_setting FORNOST_STATE_DIR '')}"
state_dir="${state_dir_setting:-$(default_state_dir)}"
[[ "${state_dir}" == /* ]] || state_dir="$(resolve_project_path "${state_dir}")"

settings_key="${FORNOST_SETTINGS_ENCRYPTION_KEY:-$(read_setting FORNOST_SETTINGS_ENCRYPTION_KEY '')}"
if [[ -z "${settings_key}" ]]; then
  key_file="${state_dir}/settings-encryption.key"
  [[ -r "${key_file}" ]] || {
    echo "Fornost setup key could not be read." >&2
    echo "Expected generated key: ${key_file}" >&2
    echo "Run this command as the same OS user that installed Fornost, or set FORNOST_STATE_DIR explicitly." >&2
    exit 66
  }
  settings_key="$(<"${key_file}")"
fi

(( ${#settings_key} >= 32 )) || {
  echo "The settings encryption key is invalid; expected at least 32 characters." >&2
  exit 65
}

bootstrap_token="$(printf '%s:%s' 'fornost-bootstrap-v1' "${settings_key}" | sha256sum | awk '{print $1}')"
ip="$(server_ip)"
host="${ip:-SERVER_IP}"

cat <<EOF
Fornost GRC secure first-run token

Setup URL : https://${host}:${https_port}${base_path}/setup
Setup code: ${bootstrap_token}

The code is only useful before the first Admin account is created.
Do not send it by email/chat or store it in tickets.
EOF
