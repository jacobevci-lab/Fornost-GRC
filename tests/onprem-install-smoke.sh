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
  printf 'FORNOST_BASE_PATH=%s\nFORNOST_HTTP_PORT=%s\n' "${base_path}" "${port}" >"${project_dir}/.env.onprem"
  : >"${project_dir}/deploy/nginx/default.conf.template"

  cat >"${bin_dir}/${engine}" <<'MOCK_ENGINE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' "$(basename "$0")" "$*" >>"${FORNOST_TEST_LOG}"
case "${1:-}" in
  info|build|pull|run|rm|logs|ps) exit 0 ;;
  network|volume)
    [[ "${2:-}" == "inspect" ]] && exit 1
    exit 0
    ;;
  exec)
    [[ "${FORNOST_TEST_APP_HEALTH_FAIL:-0}" == "1" ]] && exit 1
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
[[ "${FORNOST_TEST_PROXY_HEALTH_FAIL:-0}" == "1" ]] && exit 22
exit 0
MOCK_CURL

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
  PATH="${case_root}/bin:${PATH}" \
    bash "${repo_root}/scripts/linux/install.sh"
}

podman_case="$(make_case podman-success podman 80 /fornost-grc)"
run_install "${podman_case}" podman >"${podman_case}/output.log"
grep -q 'podman build .*NEXT_PUBLIC_BASE_PATH=/fornost-grc' "${podman_case}/engine.log" || fail "Podman build was not configured"
grep -q 'podman volume create fornost-grc-data' "${podman_case}/engine.log" || fail "persistent volume was not created"
grep -q 'podman exec fornost-grc-app curl' "${podman_case}/engine.log" || fail "application health was not checked"
grep -q 'Health check passed' "${podman_case}/output.log" || fail "success was reported before health verification"
if grep -q 'volume rm' "${podman_case}/engine.log"; then fail "installer attempted to remove persistent data"; fi

docker_case="$(make_case docker-rootless docker 8080 /grc)"
FORNOST_TEST_UID=1000 run_install "${docker_case}" docker >"${docker_case}/output.log"
grep -q 'docker run .*--publish 8080:80' "${docker_case}/engine.log" || fail "Docker rootless port mapping is incorrect"
grep -q 'http://192.0.2.10:8080/grc/' "${docker_case}/output.log" || fail "custom installation URL is incorrect"

rootless_case="$(make_case rootless-port podman 80 /fornost-grc)"
if FORNOST_TEST_UID=1000 run_install "${rootless_case}" podman >"${rootless_case}/output.log" 2>&1; then
  fail "rootless installation unexpectedly accepted privileged port 80"
fi
grep -q 'FORNOST_HTTP_PORT=8080' "${rootless_case}/output.log" || fail "rootless remediation guidance is missing"

invalid_path_case="$(make_case invalid-path podman 8080 '/../unsafe')"
if run_install "${invalid_path_case}" podman >"${invalid_path_case}/output.log" 2>&1; then
  fail "unsafe base path was accepted"
fi
grep -q 'must be a safe path' "${invalid_path_case}/output.log" || fail "unsafe path error is unclear"

app_failure_case="$(make_case app-health-failure podman 8080 /fornost-grc)"
if FORNOST_TEST_APP_HEALTH_FAIL=1 run_install "${app_failure_case}" podman >"${app_failure_case}/output.log" 2>&1; then
  fail "installer reported success while application health failed"
fi
grep -q 'did not become healthy' "${app_failure_case}/output.log" || fail "application health failure is unclear"

proxy_failure_case="$(make_case proxy-health-failure podman 8080 /fornost-grc)"
if FORNOST_TEST_PROXY_HEALTH_FAIL=1 run_install "${proxy_failure_case}" podman >"${proxy_failure_case}/output.log" 2>&1; then
  fail "installer reported success while proxy health failed"
fi
grep -q 'Health check failed' "${proxy_failure_case}/output.log" || fail "proxy health failure is unclear"

echo "On-prem installer smoke tests passed: Podman, Docker, rootless guard, path validation, app health, proxy health, persistent volume."
