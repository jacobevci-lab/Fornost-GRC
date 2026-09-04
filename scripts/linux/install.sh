#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"
cd "${project_root}"

phase="preflight"
engine=""
state_dir=""

on_install_error() {
  local code="$?" line="$1"
  trap - ERR
  set +e
  echo >&2
  echo "Fornost GRC installation failed during: ${phase} (line ${line}, exit ${code})." >&2
  [[ -n "${engine}" ]] && print_runtime_diagnostics "${engine}"
  [[ -n "${state_dir}" ]] && echo "Persistent installer state was preserved at: ${state_dir}" >&2
  echo "Application data volume fornost-grc-data was not removed." >&2
  exit "${code}"
}
trap 'on_install_error "${LINENO}"' ERR

[[ "$(uname -s)" == "Linux" ]] || { echo "This installer supports Linux only." >&2; exit 69; }
require_command curl
require_command timeout
require_command sha256sum
require_command df

if [[ ! -f "${env_file}" ]]; then
  cp .env.onprem.example "${env_file}"
  echo "Created .env.onprem with the default /fornost-grc address path."
fi

base_path="$(read_setting FORNOST_BASE_PATH /fornost-grc)"
https_port="$(read_setting FORNOST_HTTPS_PORT 8443)"
tls_cert_setting="$(read_setting FORNOST_TLS_CERT_FILE '')"
tls_key_setting="$(read_setting FORNOST_TLS_KEY_FILE '')"
tls_hostname="$(read_setting FORNOST_TLS_HOSTNAME '')"
state_dir_setting="${FORNOST_STATE_DIR:-$(read_setting FORNOST_STATE_DIR '')}"
settings_encryption_key="${FORNOST_SETTINGS_ENCRYPTION_KEY:-$(read_setting FORNOST_SETTINGS_ENCRYPTION_KEY '')}"
allow_private_connectors="${FORNOST_ALLOW_PRIVATE_CONNECTORS:-$(read_setting FORNOST_ALLOW_PRIVATE_CONNECTORS false)}"
ai_allow_private_endpoints="${FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS:-$(read_setting FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS false)}"
ai_allow_loopback="${FORNOST_AI_ALLOW_LOOPBACK:-$(read_setting FORNOST_AI_ALLOW_LOOPBACK false)}"
minimum_free_mb="${FORNOST_MIN_FREE_MB:-$(read_setting FORNOST_MIN_FREE_MB 8192)}"
release_wait_attempts="${FORNOST_RELEASE_WAIT_ATTEMPTS:-80}"
release_wait_interval="${FORNOST_RELEASE_WAIT_INTERVAL:-15}"

[[ "${base_path}" =~ ^/[A-Za-z0-9][A-Za-z0-9/_-]*$ && "${base_path}" != *".."* ]] || {
  echo "FORNOST_BASE_PATH must be a safe path such as /fornost-grc." >&2
  exit 64
}
[[ "${https_port}" =~ ^[0-9]+$ ]] && ((https_port >= 1 && https_port <= 65535)) || {
  echo "FORNOST_HTTPS_PORT must be between 1 and 65535." >&2
  exit 64
}
[[ -z "${tls_hostname}" || "${tls_hostname}" =~ ^[A-Za-z0-9.-]+$ ]] || {
  echo "FORNOST_TLS_HOSTNAME must be a valid DNS name." >&2
  exit 64
}
allowed_host_pattern="${tls_hostname:-fornost.invalid}"
allowed_host_pattern="${allowed_host_pattern//./\\.}"
if [[ -n "${tls_cert_setting}" && -z "${tls_key_setting}" ]] || [[ -z "${tls_cert_setting}" && -n "${tls_key_setting}" ]]; then
  echo "FORNOST_TLS_CERT_FILE and FORNOST_TLS_KEY_FILE must be configured together." >&2
  exit 64
fi
[[ "${minimum_free_mb}" =~ ^[0-9]+$ ]] && ((minimum_free_mb >= 1024)) || {
  echo "FORNOST_MIN_FREE_MB must be an integer of at least 1024." >&2
  exit 64
}
[[ "${release_wait_attempts}" =~ ^[0-9]+$ ]] && ((release_wait_attempts >= 1 && release_wait_attempts <= 240)) || {
  echo "FORNOST_RELEASE_WAIT_ATTEMPTS must be an integer between 1 and 240." >&2
  exit 64
}
[[ "${release_wait_interval}" =~ ^[0-9]+$ ]] && ((release_wait_interval <= 300)) || {
  echo "FORNOST_RELEASE_WAIT_INTERVAL must be an integer between 0 and 300 seconds." >&2
  exit 64
}

engine="$(container_engine)"
image="localhost/fornost-grc-app:latest"
network="fornost-grc-net"
data_volume="fornost-grc-data"
state_dir="${state_dir_setting:-$(default_state_dir)}"
[[ "${state_dir}" == /* ]] || state_dir="$(resolve_project_path "${state_dir}")"
install -d -m 700 "${state_dir}"

[[ "${allow_private_connectors}" == "true" || "${allow_private_connectors}" == "false" ]] || {
  echo "FORNOST_ALLOW_PRIVATE_CONNECTORS must be true or false." >&2
  exit 64
}
[[ "${ai_allow_private_endpoints}" == "true" || "${ai_allow_private_endpoints}" == "false" ]] || {
  echo "FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS must be true or false." >&2
  exit 64
}
[[ "${ai_allow_loopback}" == "true" || "${ai_allow_loopback}" == "false" ]] || {
  echo "FORNOST_AI_ALLOW_LOOPBACK must be true or false." >&2
  exit 64
}
if [[ "${ai_allow_loopback}" == "true" && "${ai_allow_private_endpoints}" != "true" ]]; then
  echo "FORNOST_AI_ALLOW_LOOPBACK=true requires FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true." >&2
  exit 64
fi
if [[ -z "${settings_encryption_key}" ]]; then
  require_command openssl
  settings_key_file="${state_dir}/settings-encryption.key"
  if [[ ! -s "${settings_key_file}" ]]; then
    umask 077
    openssl rand -hex 32 >"${settings_key_file}"
    chmod 600 "${settings_key_file}"
  fi
  settings_encryption_key="$(<"${settings_key_file}")"
fi
(( ${#settings_encryption_key} >= 32 )) || {
  echo "FORNOST_SETTINGS_ENCRYPTION_KEY must contain at least 32 characters." >&2
  exit 64
}
export FORNOST_SETTINGS_ENCRYPTION_KEY="${settings_encryption_key}"
export FORNOST_ALLOW_PRIVATE_CONNECTORS="${allow_private_connectors}"
export FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS="${ai_allow_private_endpoints}"
export FORNOST_AI_ALLOW_LOOPBACK="${ai_allow_loopback}"

if ((https_port < 1024)) && [[ "$(id -u)" != "0" ]]; then
  echo "Port ${https_port} requires root privileges." >&2
  echo "Run: sudo bash scripts/linux/install.sh" >&2
  echo "Or set FORNOST_HTTPS_PORT=8443 in .env.onprem for a rootless installation." >&2
  exit 77
fi

ip="$(server_ip)"
if [[ -n "${ip}" ]]; then
  allowed_ip_pattern="${ip//./\\.}"
  allowed_host_pattern="${allowed_host_pattern}|${allowed_ip_pattern}"
fi
phase="TLS preparation"
if [[ -n "${tls_cert_setting}" ]]; then
  tls_cert_file="$(resolve_project_path "${tls_cert_setting}")"
  tls_key_file="$(resolve_project_path "${tls_key_setting}")"
  [[ -r "${tls_cert_file}" ]] || { echo "TLS certificate is not readable: ${tls_cert_file}" >&2; exit 66; }
  [[ -r "${tls_key_file}" ]] || { echo "TLS private key is not readable: ${tls_key_file}" >&2; exit 66; }
  tls_source="configured certificate"
else
  require_command openssl
  tls_dir="${state_dir}/tls"
  tls_cert_file="${tls_dir}/tls.crt"
  tls_key_file="${tls_dir}/tls.key"
  if [[ -e "${tls_cert_file}" || -e "${tls_key_file}" ]]; then
    [[ -r "${tls_cert_file}" && -r "${tls_key_file}" ]] || {
      echo "Incomplete generated TLS material in ${tls_dir}; both tls.crt and tls.key are required." >&2
      exit 66
    }
  else
    install -d -m 700 "${tls_dir}"
    san="DNS:localhost,IP:127.0.0.1"
    [[ -n "${ip}" ]] && san+=",IP:${ip}"
    [[ -n "${tls_hostname}" ]] && san+=",DNS:${tls_hostname}"
    echo "Creating a self-signed TLS certificate for initial setup..."
    umask 077
    openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 825 \
      -keyout "${tls_key_file}" \
      -out "${tls_cert_file}" \
      -subj "/CN=${tls_hostname:-Fornost GRC}" \
      -addext "subjectAltName=${san}" \
      -addext "keyUsage=digitalSignature,keyEncipherment" \
      -addext "extendedKeyUsage=serverAuth" >/dev/null 2>&1
    chmod 600 "${tls_key_file}"
    chmod 644 "${tls_cert_file}"
  fi
  tls_source="self-signed certificate"
fi

phase="container runtime preflight"
"${engine}" info >/dev/null

phase="disk capacity preflight"
storage_root="$(container_storage_root "${engine}")"
state_filesystem="$(filesystem_id "${state_dir}")"
storage_filesystem="$(filesystem_id "${storage_root}")"
if [[ "${state_filesystem}" == "${storage_filesystem}" ]]; then
  require_free_space_mb "${state_dir}" "${minimum_free_mb}" "the image bundle and container layers"
else
  require_free_space_mb "${state_dir}" 1024 "the verified image bundle cache"
  require_free_space_mb "${storage_root}" "${minimum_free_mb}" "container image extraction"
fi
echo "Disk preflight passed: at least ${minimum_free_mb} MiB is available for container installation."

download_commit_release_asset() {
  local url="$1" output="$2" description="$3"
  local attempt curl_code error_file="${output}.curl-error"

  for ((attempt = 1; attempt <= release_wait_attempts; attempt++)); do
    if curl --fail --location --silent --show-error \
      --retry 4 --retry-connrefused --connect-timeout 15 --max-time 900 \
      --output "${output}" "${url}" 2>"${error_file}"; then
      rm -f "${error_file}"
      return 0
    else
      curl_code=$?
    fi

    rm -f "${output}"
    if ((curl_code != 22 || attempt == release_wait_attempts)); then
      [[ -s "${error_file}" ]] && cat "${error_file}" >&2
      rm -f "${error_file}"
      echo "Could not download ${description}: ${url}" >&2
      return "${curl_code}"
    fi

    if ((attempt == 1)); then
      echo "The tested image for this commit is still being published; waiting for GitHub Release..."
    elif ((attempt % 4 == 0)); then
      echo "Still waiting for the commit-pinned image (${attempt}/${release_wait_attempts})..."
    fi
    sleep "${release_wait_interval}"
  done
}

install_prebuilt_image() {
  local bundle_file="${FORNOST_APP_BUNDLE_FILE:-}"
  local bundle_url="${FORNOST_APP_BUNDLE_URL:-}"
  local checksum_file checksum_url release_commit release_repository architecture

  if [[ -z "${bundle_file}" ]]; then
    architecture="$(uname -m)"
    [[ "${architecture}" == "x86_64" || "${architecture}" == "amd64" ]] || {
      echo "Prebuilt installation currently supports x86_64/amd64. Set FORNOST_BUILD_LOCAL=true for ${architecture}." >&2
      return 64
    }
    [[ "${base_path}" == "/fornost-grc" ]] || {
      echo "Prebuilt installation uses /fornost-grc. Set FORNOST_BUILD_LOCAL=true for a custom base path." >&2
      return 64
    }

    release_repository="${FORNOST_RELEASE_REPOSITORY:-jacobevci-lab/Fornost-GRC}"
    release_commit="${FORNOST_RELEASE_COMMIT:-$(git -C "${project_root}" rev-parse HEAD 2>/dev/null || true)}"
    [[ "${release_commit}" =~ ^[0-9a-f]{40}$ ]] || {
      echo "Could not determine the checked-out Git commit for the prebuilt image." >&2
      return 66
    }
    bundle_url="${bundle_url:-https://github.com/${release_repository}/releases/download/onprem-${release_commit}/fornost-grc-amd64.tar.gz}"
    checksum_url="${bundle_url}.sha256"
    install -d -m 700 "${state_dir}/cache"
    bundle_file="${state_dir}/cache/fornost-grc-${release_commit}-amd64.tar.gz"
    checksum_file="${bundle_file}.sha256"

    rm -f "${bundle_file}.part" "${checksum_file}.part"
    download_commit_release_asset "${checksum_url}" "${checksum_file}.part" "the image checksum"
    mv "${checksum_file}.part" "${checksum_file}"

    if [[ -r "${bundle_file}" ]] && (
      cd "$(dirname "${bundle_file}")"
      sed "s#  .*#  $(basename "${bundle_file}")#" "${checksum_file}" | sha256sum --check --strict - >/dev/null 2>&1
    ); then
      echo "Using the previously downloaded and checksum-verified image bundle for commit ${release_commit:0:12}."
    else
      rm -f "${bundle_file}"
      echo "Downloading the tested Fornost GRC image for commit ${release_commit:0:12}..."
      download_commit_release_asset "${bundle_url}" "${bundle_file}.part" "the application image"
      (
        cd "$(dirname "${bundle_file}")"
        sed "s#  .*#  $(basename "${bundle_file}.part")#" "${checksum_file}" | sha256sum --check --strict -
      )
      mv "${bundle_file}.part" "${bundle_file}"
    fi
  else
    bundle_file="$(resolve_project_path "${bundle_file}")"
    checksum_file="${FORNOST_APP_BUNDLE_CHECKSUM_FILE:-${bundle_file}.sha256}"
    checksum_file="$(resolve_project_path "${checksum_file}")"
  fi

  [[ -r "${bundle_file}" ]] || { echo "Application image bundle is not readable: ${bundle_file}" >&2; return 66; }
  [[ -r "${checksum_file}" ]] || { echo "Application image checksum is not readable: ${checksum_file}" >&2; return 66; }
  phase="application image checksum verification"
  (
    cd "$(dirname "${bundle_file}")"
    sed "s#  .*#  $(basename "${bundle_file}")#" "${checksum_file}" | sha256sum --check --strict -
  )
  phase="prebuilt application image load"
  "${engine}" load --input "${bundle_file}"
  "${engine}" image inspect "${image}" >/dev/null
}

if [[ "${FORNOST_BUILD_LOCAL:-false}" == "true" ]]; then
  echo "FORNOST_BUILD_LOCAL=true: building Fornost GRC on this server..."
  phase="local application image build"
  "${engine}" build \
    --build-arg "NEXT_PUBLIC_BASE_PATH=${base_path}" \
    --tag "${image}" \
    "${project_root}"
else
  phase="prebuilt application image download"
  install_prebuilt_image
fi

phase="runtime network preparation"
"${engine}" network inspect "${network}" >/dev/null 2>&1 || "${engine}" network create "${network}" >/dev/null
phase="persistent data volume preparation"
"${engine}" volume inspect "${data_volume}" >/dev/null 2>&1 || "${engine}" volume create "${data_volume}" >/dev/null
phase="reverse proxy image pull"
"${engine}" pull docker.io/library/nginx:1.27-alpine >/dev/null

phase="old container replacement"
"${engine}" rm -f fornost-grc-proxy fornost-grc-app >/dev/null 2>&1 || true

# Podman's DNS backend can briefly retain the removed application's address on
# a reused network. Recreate this product-owned network after both containers
# are gone so the proxy always resolves the newly created application container.
if [[ "$(basename "${engine}")" == "podman" ]]; then
  phase="Podman runtime network refresh"
  "${engine}" network rm "${network}" >/dev/null 2>&1 || true
  "${engine}" network create "${network}" >/dev/null
fi

if [[ "$(basename "${engine}")" == "podman" ]]; then
  dns_resolver="$("${engine}" network inspect --format '{{range .Subnets}}{{.Gateway}}{{end}}' "${network}")"
else
  dns_resolver="127.0.0.11"
fi
[[ "${dns_resolver}" =~ ^[0-9a-fA-F:.]+$ ]] || {
  echo "Could not determine the container DNS resolver for ${network}." >&2
  exit 70
}

phase="application container start"
"${engine}" run -d \
  --name fornost-grc-app \
  --network "${network}" \
  --restart unless-stopped \
  --env "NEXT_PUBLIC_BASE_PATH=${base_path}" \
  --env FORNOST_DEMO_MODE=false \
  --env FORNOST_SETTINGS_ENCRYPTION_KEY \
  --env FORNOST_ALLOW_PRIVATE_CONNECTORS \
  --env FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS \
  --env FORNOST_AI_ALLOW_LOOPBACK \
  --env FORNOST_TRUST_PLATFORM_IDENTITY=false \
  --volume "${data_volume}:/app/.sites-runtime/data:Z" \
  "${image}" >/dev/null

phase="HTTPS reverse proxy start"
"${engine}" run -d \
  --name fornost-grc-proxy \
  --network "${network}" \
  --restart unless-stopped \
  --publish "${https_port}:8443" \
  --env "FORNOST_BASE_PATH=${base_path}" \
  --env "FORNOST_DNS_RESOLVER=${dns_resolver}" \
  --env "FORNOST_ALLOWED_HOST_PATTERN=${allowed_host_pattern}" \
  --volume "${project_root}/deploy/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro,Z" \
  --volume "${tls_cert_file}:/etc/nginx/fornost-tls.crt:ro,Z" \
  --volume "${tls_key_file}:/etc/nginx/fornost-tls.key:ro,Z" \
  docker.io/library/nginx:1.27-alpine >/dev/null

echo "Verifying the externally reachable Fornost GRC endpoint..."
phase="HTTPS health verification"
wait_for_url "https://127.0.0.1:${https_port}${base_path}/api/auth" 30 2 true || {
  echo "Fornost GRC did not become reachable through the reverse proxy." >&2
  echo "Application container state:" >&2
  timeout 10 "${engine}" inspect fornost-grc-app >&2 || true
  echo "Application container logs:" >&2
  timeout 10 "${engine}" logs --tail 100 fornost-grc-app >&2 || true
  echo "Reverse proxy container state:" >&2
  timeout 10 "${engine}" inspect fornost-grc-proxy >&2 || true
  echo "Reverse proxy container logs:" >&2
  timeout 10 "${engine}" logs --tail 100 fornost-grc-proxy >&2 || true
  exit 70
}

phase="installation state recording"
{
  printf 'FORNOST_CONTAINER_ENGINE=%s\n' "${engine}"
  printf 'FORNOST_BASE_PATH=%s\n' "${base_path}"
  printf 'FORNOST_HTTPS_PORT=%s\n' "${https_port}"
  printf 'FORNOST_INSTALLED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"${state_dir}/install-state.env"
chmod 600 "${state_dir}/install-state.env"
trap - ERR

cat <<EOF

Fornost GRC installation is running.

Initial setup address:
  https://${ip:-SERVER_IP}:${https_port}${base_path}/

The first browser visit opens the initial administrator creation screen.
Persistent application data is stored in the ${data_volume} container volume.
TLS source: ${tls_source}
Persistent installer state: ${state_dir}
Health check passed: https://127.0.0.1:${https_port}${base_path}/api/auth
EOF
