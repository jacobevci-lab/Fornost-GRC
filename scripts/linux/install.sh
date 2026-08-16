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
if [[ -n "${tls_cert_setting}" && -z "${tls_key_setting}" ]] || [[ -z "${tls_cert_setting}" && -n "${tls_key_setting}" ]]; then
  echo "FORNOST_TLS_CERT_FILE and FORNOST_TLS_KEY_FILE must be configured together." >&2
  exit 64
fi

engine="$(container_engine)"
image="localhost/fornost-grc-app:latest"
network="fornost-grc-net"
data_volume="fornost-grc-data"
state_dir="${state_dir_setting:-$(default_state_dir)}"
[[ "${state_dir}" == /* ]] || state_dir="$(resolve_project_path "${state_dir}")"
install -d -m 700 "${state_dir}"

if ((https_port < 1024)) && [[ "$(id -u)" != "0" ]]; then
  echo "Port ${https_port} requires root privileges." >&2
  echo "Run: sudo bash scripts/linux/install.sh" >&2
  echo "Or set FORNOST_HTTPS_PORT=8443 in .env.onprem for a rootless installation." >&2
  exit 77
fi

ip="$(server_ip)"
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

    echo "Downloading the tested Fornost GRC image for commit ${release_commit:0:12}..."
    curl --fail --location --silent --show-error \
      --retry 4 --retry-connrefused --connect-timeout 15 --max-time 900 \
      --output "${bundle_file}.part" "${bundle_url}"
    mv "${bundle_file}.part" "${bundle_file}"
    curl --fail --location --silent --show-error \
      --retry 4 --retry-connrefused --connect-timeout 15 --max-time 60 \
      --output "${checksum_file}.part" "${checksum_url}"
    mv "${checksum_file}.part" "${checksum_file}"
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

phase="application container start"
"${engine}" run -d \
  --name fornost-grc-app \
  --network "${network}" \
  --restart unless-stopped \
  --env "NEXT_PUBLIC_BASE_PATH=${base_path}" \
  --env FORNOST_DEMO_MODE=false \
  --volume "${data_volume}:/app/.sites-runtime/data:Z" \
  "${image}" >/dev/null

phase="HTTPS reverse proxy start"
"${engine}" run -d \
  --name fornost-grc-proxy \
  --network "${network}" \
  --restart unless-stopped \
  --publish "${https_port}:8443" \
  --env "FORNOST_BASE_PATH=${base_path}" \
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
