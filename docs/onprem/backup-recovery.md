# On-prem backup and recovery

This workflow supports the Docker/Podman installation, not hosted Cloudflare data.
Run with the same OS account and engine used for installation (rootless and root
engines have different storage). Requires Python 3.6+ and the container CLI.

## What is protected

- The entire application data volume: local D1 databases, journals and R2 evidence.
- The running application's settings encryption key, dossier signing key and scheduler token.
- Base path, private connector/AI flags and exact application image ID.

TLS certificates/private keys, reverse-proxy configuration, external integrations,
container images and operating system configuration are **not** included. Preserve
those separately. Keep the matching release/image available for disaster recovery.
Do not run upgrade/uninstall/other volume writers during a backup. Product maintenance
commands share a nonblocking lock; unrelated administration tools cannot honor it.

## Create and verify

```bash
sudo mkdir -p /srv/fornost-backups
sudo python3 scripts/linux/backup.py --engine podman backup /srv/fornost-backups/backup-2026-10-04
sudo python3 scripts/linux/backup.py verify /srv/fornost-backups/backup-2026-10-04
```

Replace `podman` with `docker` as needed. The destination must not exist. The tool
stops the app, copies the complete offline data archive, checks integrity, and
restarts the app if it was running. The proxy may return 502 during this maintenance
window. A previously stopped app remains stopped. If a backup fails, its directory
is incomplete and must not be used. On abrupt host shutdown/SIGKILL, check the app's
state and start it manually if necessary.

Directories have mode 0700 and files 0600. **The backup is not encrypted** and
contains plaintext recovery keys; use encrypted, access-controlled backup storage
and an off-host copy. SHA-256 detects accidental corruption, not malicious replacement
of both the backup and its manifest. Restore only trusted backups. Verification
rejects path traversal, symlinks, hard links, devices, duplicate paths and privileged
file modes. It does not prove SQLite/application consistency; perform a recovery drill.

## Restore without overwriting production

Load the original application image on the recovery host first. No image is pulled
implicitly. Allow disk space for the backup, a temporary copy and restored volume.

```bash
sudo python3 scripts/linux/backup.py --engine podman restore \
  /srv/fornost-backups/backup-2026-10-04 \
  fornost-grc-restore-drill /srv/fornost-recovery-drill
```

Both the target volume and recovery directory must be new. The tool validates a
private copy before importing it into an isolated, never-started helper container.
It leaves the running application and original volume unchanged. Failed imports
attempt to remove only their newly created volume. Review any cleanup errors before
retrying with a new target name.

## Controlled cutover and rollback

1. Use the application release corresponding to the backed-up image. Do not combine
   a recovery drill with an upgrade or downgrade.
2. Back up current production and retain its original volume name and deployment
   keys. Stop normal user activity during cutover.
3. Merge the generated `recovery.env` values into `.env.onprem`; **do not source it
   as a shell script**. Set `FORNOST_DATA_VOLUME` to the restored volume and preserve
   the restored encryption/signing keys. Review HTTPS port, FQDN, TLS file paths and
   private connector policy separately for the destination host. Keep `.env.onprem`
   private (0600). Do not copy secrets into tickets or logs.
4. Run `sudo bash scripts/linux/install.sh`, then `sudo bash scripts/linux/check.sh`.
   The installer recreates application containers using the selected volume. It
   does not remove the original volume.
5. Verify login, a known risk/control, an uploaded evidence download, and encrypted
   integration configuration. Review scheduler behavior before enabling external
   connectivity. Health probes alone are not a successful business-data drill.
6. If validation fails, restore the old volume name **and its matching keys/config**
   in `.env.onprem` and rerun the installer. Keep both volumes until validated.

Do not run `uninstall.sh --purge-data` during recovery. It removes the configured
volume after its explicit purge confirmation. Normal uninstall preserves data.
Retention, offsite copy and periodic restore drills remain operator responsibilities;
this version does not introduce a scheduler or browser-triggered host control.

Container archive semantics: [Docker cp](https://docs.docker.com/reference/cli/docker/container/cp/)
and [Podman cp](https://docs.podman.io/en/v6.1.3/markdown/podman-cp.1.html).
