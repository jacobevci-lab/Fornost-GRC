#!/usr/bin/env bash
set -euo pipefail

# Copy complete installed Debian package payloads, licences and inventory.
# This runs only in the build stage, using its signed stable Debian packages.
destination="${1:?Provide an empty runtime-library output directory}"
[[ "${destination}" == /* && "${destination}" != / && ! -e "${destination}" ]] || {
  echo "Runtime-library destination must be a new absolute directory." >&2
  exit 64
}
mkdir -p "${destination}/var/lib/dpkg/status.d"
for package in libgcc-s1 libstdc++6 libgomp1 gcc-14-base; do
  [[ "$(dpkg-query -W -f='${Status}' "${package}")" == 'install ok installed' ]]
  while IFS= read -r path; do
    # Do not recursively copy package directories (especially / and /usr).
    if [[ -f "${path}" || -L "${path}" ]]; then
      cp --archive --parents --no-dereference "${path}" "${destination}"
    fi
  done < <(dpkg-query --listfiles "${package}")
  dpkg-query --status "${package}" > "${destination}/var/lib/dpkg/status.d/${package}"
  binary_package="$(dpkg-query -W -f='${binary:Package}' "${package}")"
  cp "/var/lib/dpkg/info/${binary_package}.md5sums" \
    "${destination}/var/lib/dpkg/status.d/${package}.md5sums"
done
