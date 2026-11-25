# On-prem system zlib removal

Release `5776bed` was blocked by CVE-2026-76844 in the distroless Debian 13
`zlib1g` package. The source is the inherited system OpenSSL dependency chain;
it is separate from Node's bundled compression and TLS implementations.

Keep Node 22 from the same upstream distroless image, with Debian 13 glibc,
certificate roots and nonroot execution. Start with `base-nossl` and add only
the four stable Debian C++ runtime packages, including their complete file
payloads, licences, version inventory and checksums. No sid repository, custom
native-library backport, CVE suppression or scanner severity change is used.
The unused system OpenSSL/zlib/zstd packages are absent from the resulting image.

The examined upstream Node 22.23.4 binary has `node_shared_zlib=false` and
`node_shared_openssl=false`; its ELF dependencies are the glibc loader, libc,
libm, libdl, libpthread, libstdc++ and libgcc. This does not claim that all future
or bundled compression implementations are vulnerability-free.

Acceptance uses the actual final image: Node gzip/raw-deflate success and
malformed input, signing/TLS roots, sharp/canvas/PDF native workloads, workerd
startup, package/payload checks and UID 1000. Existing Docker and Podman HTTPS,
authentication, persistence, reinstall, backup and restore tests remain required.
The unchanged HIGH/CRITICAL image scan now also runs before merge, reusing the
already built Docker integration image. Publication retains its own scan and
tests of the exact exported bundle. No data migration or hosted UI change occurs.

Sources: [Debian zlib tracker](https://security-tracker.debian.org/tracker/source-package/zlib),
[distroless images](https://github.com/GoogleContainerTools/distroless), and the
[blocked release evidence](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/42091431810).
