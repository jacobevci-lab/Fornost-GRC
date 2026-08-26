#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

fail() {
  echo "on-prem smoke test failed: $*" >&2
  exit 1
}

make_case() {
  local name="$1" engine="$2" port="$3" base_path="$4"
  local case_root="${test_root}/${name}"
  local bin_dir="${case_root}/bin" project_dir="${case_root}/project"
  mkdir -p "${bin_dir}" "${project_dir}/deploy/nginx"
  printf 'FORNOST_BASE_PATH=%s\nFORNOST_HTTPS_PORT=%s\nFORNOST_SETTINGS_ENCRYPTION_KEY=%s\n' "${base_path}" "${port}" "test-only-settings-encryption-key-0123456789abcdef0123456789abcdef" >"${project_dir}/.env.onprem"
  : >"${project_dir}/deploy/nginx/default.conf.template"

  cat >"${bin_dir}/${engine}" <<'MOCK_ENGINE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' "$(basename "$0")" "$*" >>"${FORNOST_TEST_LOG}"
case "${1:-}" in
  build)
    [[ "${FORNOST_TEST_BUILD_FAIL:-0}" == "1" ]] && exit 125
    exit 0
    ;;
  inspect)
    [[ " $* " == *" --format "* ]] && printf 'true\n'
    exit 0
    ;;
  info|pull|run|rm|rmi|logs|ps) exit 0 ;;
  network|volume)
    [[ "${2:-}" == "inspect" ]] && exit 1
    exit 0
    ;;
esac
exit 0
MOCK_ENGINE

  cat >"${bin_dir}/uname" <<'MOCK_UNAME'
#!/usr/bin/env bash
printf 'Linux\n'
MOCK_UNAME

  cat >"${bin_dir}/id" <<'MOCK_ID'
#!/usr/bin/env bash
[[ "${1:-}" == "-u" ]] && printf '%s\n' "${FORNOST_TEST_UID:-0}" || /usr/bin/id "$@"
MOCK_ID

  cat >"${bin_dir}/hostname" <<'MOCK_HOSTNAME'
#!/usr/bin/env bash
[[ "${1:-}" == "-I" ]] && printf '192.0.2.10 \n' || printf 'fornost-test\n'
MOCK_HOSTNAME

  cat >"${bin_dir}/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
[[ "${FORNOST_TEST_APP_HEALTH_FAIL:-0}" == "1" || "${FORNOST_TEST_PROXY_HEALTH_FAIL:-0}" == "1" ]] && exit 22
exit 0
MOCK_CURL

  cat >"${bin_dir}/openssl" <<'MOCK_OPENSSL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${FORNOST_TEST_OPENSSL_LOG}"
key_file=""
cert_file=""
while (($#)); do
  case "$1" in
    -keyout) key_file="$2"; shift 2 ;;
    -out) cert_file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s\n' 'test private key' >"${key_file}"
printf '%s\n' 'test certificate' >"${cert_file}"
MOCK_OPENSSL

  cat >"${bin_dir}/dnf" <<'MOCK_DNF'
#!/usr/bin/env bash
printf 'dnf %s\n' "$*" >>"${FORNOST_TEST_LOG}"
MOCK_DNF

  cat >"${bin_dir}/systemctl" <<'MOCK_SYSTEMCTL'
#!/usr/bin/env bash
printf 'systemctl %s\n' "$*" >>"${FORNOST_TEST_LOG}"
MOCK_SYSTEMCTL

  cat >"${bin_dir}/firewall-cmd" <<'MOCK_FIREWALL'
#!/usr/bin/env bash
printf 'firewall-cmd %s\n' "$*" >>"${FORNOST_TEST_LOG}"
if [[ "${1:-}" == "--get-default-zone" ]]; then printf 'public\n'; fi
exit 0
MOCK_FIREWALL

  cat >"${bin_dir}/sleep" <<'MOCK_SLEEP'
#!/usr/bin/env bash
exit 0
MOCK_SLEEP

  chmod +x "${bin_dir}"/*
  printf '%s\n' "${case_root}"
}

run_install() {
  local case_root="$1" engine="$2"
  FORNOST_PROJECT_ROOT="${case_root}/project" \
  FORNOST_CONTAINER_ENGINE="${engine}" \
  FORNOST_TEST_LOG="${case_root}/engine.log" \
  FORNOST_TEST_OPENSSL_LOG="${case_root}/openssl.log" \
  FORNOST_STATE_DIR="${case_root}/project/.fornost-state" \
  PATH="${case_root}/bin:${PATH}" \
    bash "${repo_root}/scripts/linux/install.sh"
}

run_bootstrap() {
  local case_root="$1" engine="$2"
  FORNOST_PROJECT_ROOT="${case_root}/project" \
  FORNOST_CONTAINER_ENGINE="${engine}" \
  FORNOST_TEST_LOG="${case_root}/engine.log" \
  FORNOST_TEST_OPENSSL_LOG="${case_root}/openssl.log" \
  FORNOST_STATE_DIR="${case_root}/project/.fornost-state" \
  PATH="${case_root}/bin:${PATH}" \
    bash "${repo_root}/scripts/linux/bootstrap.sh"
}

podman_case="$(make_case podman-success podman 8443 /fornost-grc)"
run_bootstrap "${podman_case}" podman >"${podman_case}/output.log"
grep -q 'dnf install -y git podman curl openssl firewalld' "${podman_case}/engine.log" || fail "RHEL prerequisites were not installed"
grep -q 'firewall-cmd --permanent --zone=public --add-port=8443/tcp' "${podman_case}/engine.log" || fail "HTTPS firewall rule was not configured"
grep -q 'podman build .*NEXT_PUBLIC_BASE_PATH=/fornost-grc' "${podman_case}/engine.log" || fail "Podman build was not configured"
grep -q 'podman volume create fornost-grc-data' "${podman_case}/engine.log" || fail "persistent volume was not created"
grep -q 'podman run .*--name fornost-grc-proxy' "${podman_case}/engine.log" || fail "reverse proxy was not started before health verification"
grep -q -- '--publish 8443:8443' "${podman_case}/engine.log" || fail "HTTPS port mapping is incorrect"
grep -q -- '/.fornost-state/tls/tls.crt:/etc/nginx/fornost-tls.crt:ro,Z' "${podman_case}/engine.log" || fail "persistent generated certificate was not mounted"
grep -q 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.0.2.10' "${podman_case}/openssl.log" || fail "generated certificate SAN is incomplete"
if grep -q 'podman exec fornost-grc-app curl' "${podman_case}/engine.log"; then fail "installer used the Podman exec path that can hang"; fi
grep -q 'Health check passed' "${podman_case}/output.log" || fail "success was reported before health verification"
if grep -q 'volume rm' "${podman_case}/engine.log"; then fail "installer attempted to remove persistent data"; fi

docker_case="$(make_case docker-rootless docker 9443 /grc)"
FORNOST_TEST_UID=1000 run_install "${docker_case}" docker >"${docker_case}/output.log"
grep -q 'docker run .*--publish 9443:8443' "${docker_case}/engine.log" || fail "Docker rootless port mapping is incorrect"
grep -q 'https://192.0.2.10:9443/grc/' "${docker_case}/output.log" || fail "custom HTTPS installation URL is incorrect"

rootless_case="$(make_case rootless-port podman 443 /fornost-grc)"
if FORNOST_TEST_UID=1000 run_install "${rootless_case}" podman >"${rootless_case}/output.log" 2>&1; then
  fail "rootless installation unexpectedly accepted privileged port 443"
fi
grep -q 'FORNOST_HTTPS_PORT=8443' "${rootless_case}/output.log" || fail "rootless remediation guidance is missing"

invalid_path_case="$(make_case invalid-path podman 8443 '/../unsafe')"
if run_install "${invalid_path_case}" podman >"${invalid_path_case}/output.log" 2>&1; then
  fail "unsafe base path was accepted"
fi
grep -q 'must be a safe path' "${invalid_path_case}/output.log" || fail "unsafe path error is unclear"

app_failure_case="$(make_case app-health-failure podman 8443 /fornost-grc)"
if FORNOST_TEST_APP_HEALTH_FAIL=1 run_install "${app_failure_case}" podman >"${app_failure_case}/output.log" 2>&1; then
  fail "installer reported success while application health failed"
fi
grep -q 'did not become reachable through the reverse proxy' "${app_failure_case}/output.log" || fail "application health failure is unclear"
grep -q 'podman inspect fornost-grc-app' "${app_failure_case}/engine.log" || fail "application diagnostics were not collected"
grep -q 'podman logs --tail 100 fornost-grc-proxy' "${app_failure_case}/engine.log" || fail "proxy diagnostics were not collected"

proxy_failure_case="$(make_case proxy-health-failure podman 8443 /fornost-grc)"
if FORNOST_TEST_PROXY_HEALTH_FAIL=1 run_install "${proxy_failure_case}" podman >"${proxy_failure_case}/output.log" 2>&1; then
  fail "installer reported success while proxy health failed"
fi
grep -q 'Health check failed' "${proxy_failure_case}/output.log" || fail "proxy health failure is unclear"

cert_case="$(make_case configured-cert podman 8443 /fornost-grc)"
mkdir -p "${cert_case}/project/certs"
printf '%s\n' cert >"${cert_case}/project/certs/server.crt"
printf '%s\n' key >"${cert_case}/project/certs/server.key"
cat >>"${cert_case}/project/.env.onprem" <<'CERT_ENV'
FORNOST_TLS_CERT_FILE=certs/server.crt
FORNOST_TLS_KEY_FILE=certs/server.key
CERT_ENV
run_install "${cert_case}" podman >"${cert_case}/output.log"
[[ ! -e "${cert_case}/openssl.log" ]] || fail "OpenSSL ran despite configured certificate"
grep -q -- '/certs/server.crt:/etc/nginx/fornost-tls.crt:ro,Z' "${cert_case}/engine.log" || fail "configured certificate was not mounted"
grep -q 'TLS source: configured certificate' "${cert_case}/output.log" || fail "configured certificate source was not reported"

build_failure_case="$(make_case build-failure podman 8443 /fornost-grc)"
if FORNOST_TEST_BUILD_FAIL=1 run_install "${build_failure_case}" podman >"${build_failure_case}/output.log" 2>&1; then
  fail "image build failure unexpectedly succeeded"
fi
grep -q 'installation failed during: application image build' "${build_failure_case}/output.log" || fail "failed phase was not diagnosed"
grep -q 'Application data volume fornost-grc-data was not removed' "${build_failure_case}/output.log" || fail "data preservation was not reported"
if grep -q 'podman run' "${build_failure_case}/engine.log"; then fail "containers started after failed image build"; fi

echo "On-prem installer smoke tests passed: clean RHEL bootstrap, HTTPS 8443, persistent/generated TLS, configured TLS, Podman, Docker, rootless guard, bounded health and phase diagnostics."
