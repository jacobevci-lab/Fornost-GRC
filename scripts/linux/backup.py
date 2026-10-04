#!/usr/bin/env python3
"""Offline, private backups; restores never overwrite an existing volume."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile

APP = 'fornost-grc-app'
DATA = '/app/.sites-runtime/data'
FILES = ('data.tar', 'recovery.env')
KEYS = ('FORNOST_SETTINGS_ENCRYPTION_KEY', 'FORNOST_DOSSIER_SIGNING_KEY', 'FORNOST_SCHEDULER_TOKEN')
OPTIONAL = ('FORNOST_ALLOW_PRIVATE_CONNECTORS', 'FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS', 'FORNOST_AI_ALLOW_LOOPBACK')

def run(engine, *args, **kwargs):
    kwargs.setdefault("check", True)
    return subprocess.run([engine, *args], **kwargs)

def capture(engine, *args):
    return run(engine, *args, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()

def inspect(engine, name):
    return json.loads(capture(engine, 'inspect', name))[0]

def private_dir(path):
    path.mkdir(mode=0o700, parents=False, exist_ok=False)

def read_env(path):
    result = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or key in result or key not in (*KEYS, *OPTIONAL, 'FORNOST_BASE_PATH', 'FORNOST_DATA_VOLUME'):
            raise ValueError('Invalid recovery configuration')
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError('Unsafe recovery configuration value')
        result[key] = value
    for key in KEYS[:2]:
        if len(result.get(key, '')) < 32 or result[key].startswith('development-only-'):
            raise ValueError('Required recovery key missing or invalid')
    return result

def verify(folder):
    for name in (*FILES, 'manifest.json'):
        path = folder / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Backup is incomplete or contains a linked file')
    if (folder / 'manifest.json').stat().st_size > 65536 or (folder / 'recovery.env').stat().st_size > 65536:
        raise ValueError('Backup metadata exceeds limit')
    manifest = json.loads((folder / 'manifest.json').read_text())
    if manifest.get('format') != 'fornost-offline-v1' or not re.fullmatch(r'(sha256:)?[a-f0-9]{64}', manifest.get('image', '')):
        raise ValueError('Unsupported backup format or image identifier')
    for name in FILES:
        if manifest.get('sha256', {}).get(name) != digest(folder / name):
            raise ValueError('Backup checksum mismatch: ' + name)
    read_env(folder / 'recovery.env')
    seen = set()
    regular = 0
    with tarfile.open(folder / 'data.tar', 'r:') as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            canonical = str(path)
            if path.is_absolute() or '..' in path.parts or '\\' in member.name or any(ord(c) < 32 for c in member.name):
                raise ValueError('Unsafe archive path')
            if canonical in seen or not (member.isdir() or member.isreg()) or member.mode & 0o7000:
                raise ValueError('Duplicate, linked, special or privileged archive entry')
            if canonical == '.' and not member.isdir():
                raise ValueError('Invalid archive root')
            seen.add(canonical)
            regular += int(member.isreg())
            if len(seen) > 1000000:
                raise ValueError('Archive has too many entries')
            # Detect truncated payloads without extracting untrusted paths.
            if member.isreg():
                source = archive.extractfile(member)
                remaining = member.size
                while remaining:
                    chunk = source.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError('Truncated archive')
                    remaining -= len(chunk)
    if not regular:
        raise ValueError('Empty data backup')
    return manifest

def backup(engine, folder):
    private_dir(folder)
    stopped = False
    complete = False
    try:
        info = inspect(engine, APP)
        if not any(m.get('Destination') == DATA and m.get('Type') == 'volume' for m in info.get('Mounts', [])):
            raise ValueError('Expected persistent application volume is not mounted')
        if info.get('State', {}).get('Paused'):
            raise ValueError('Unpause the application before backing it up')
        env = dict(item.split('=', 1) for item in info['Config']['Env'] if '=' in item)
        values = {key: env.get(key, '') for key in (*KEYS, *OPTIONAL)}
        values['FORNOST_BASE_PATH'] = env.get('NEXT_PUBLIC_BASE_PATH', '/fornost-grc')
        if any('\n' in value or '\r' in value for value in values.values()):
            raise ValueError('Multiline runtime configuration cannot be backed up safely')
        (folder / 'recovery.env').write_text(''.join(key + '=' + value + '\n' for key, value in values.items()))
        read_env(folder / 'recovery.env')
        if info['State']['Running']:
            print('Stopping application for a consistent data snapshot.', flush=True)
            stopped = True
            run(engine, 'stop', '--time', '60', APP, stdout=subprocess.DEVNULL)
        if inspect(engine, APP)['State']['Running']:
            raise ValueError('Application is still running; snapshot refused')
        with (folder / 'data.tar').open('wb') as target:
            run(engine, 'cp', APP + ':' + DATA + '/.', '-', stdout=target)
        manifest = {'format': 'fornost-offline-v1', 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'image': info['Image'], 'sha256': {name: digest(folder / name) for name in FILES}}
        (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        verify(folder)
        complete = True
    finally:
        try:
            for item in folder.iterdir():
                if item.is_file():
                    item.chmod(0o600)
        finally:
            if stopped:
                run(engine, 'start', APP, stdout=subprocess.DEVNULL)
        if not complete:
            print('Backup failed; do not use the incomplete directory.', file=sys.stderr)
    print('Verified backup created: ' + str(folder))
    print('Contains plaintext recovery keys. Store on encrypted storage with restricted access.')

def restore(engine, folder, volume, recovery):
    if not re.fullmatch(r'fornost-grc-restore-[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}', volume):
        raise ValueError('Use a new volume named fornost-grc-restore-<name>')
    if run(engine, 'volume', 'inspect', volume, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0:
        raise ValueError('Destination volume already exists; refusing to overwrite')
    if recovery.exists():
        raise ValueError('Recovery directory already exists')
    helper = 'fornost-restore-' + os.urandom(8).hex()
    created = False
    success = False
    with tempfile.TemporaryDirectory(prefix='fornost-restore-') as temp:
        staged = Path(temp)
        # Copy first, then validate and import only this private immutable-to-others snapshot.
        for name in (*FILES, 'manifest.json'):
            source = folder / name
            if source.is_symlink() or not source.is_file():
                raise ValueError('Missing or linked backup file')
            shutil.copyfile(source, staged / name)
        manifest = verify(staged)
        capture(engine, 'image', 'inspect', manifest['image'])  # No implicit image download/version substitution.
        private_dir(recovery)
        try:
            token = os.urandom(32).hex()
            run(engine, 'volume', 'create', '--label', 'fornost.restore-token=' + token, volume, stdout=subprocess.DEVNULL)
            owner = capture(engine, 'volume', 'inspect', '--format', '{{index .Labels \"fornost.restore-token\"}}', volume)
            if owner != token:
                raise ValueError('Target volume ownership changed; import refused')
            created = True
            run(engine, 'create', '--name', helper, '--network', 'none', '--user', '1000:1000',
                '--volume', volume + ':' + DATA + ':Z', '--entrypoint', '/nodejs/bin/node',
                manifest['image'], '-e', '', stdout=subprocess.DEVNULL)
            with (staged / 'data.tar').open('rb') as source:
                run(engine, 'cp', '-a', '-', helper + ':' + DATA, stdin=source)
            config = (staged / 'recovery.env').read_text() + 'FORNOST_DATA_VOLUME=' + volume + '\n'
            (recovery / 'recovery.env').write_text(config)
            (recovery / 'recovery.env').chmod(0o600)
            shutil.copyfile(staged / 'manifest.json', recovery / 'manifest.json')
            success = True
        finally:
            run(engine, 'rm', '-f', helper, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if created and not success:
                run(engine, 'volume', 'rm', volume, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        print('Restored to NEW volume: ' + volume)
        print('Existing application unchanged. Review recovery.env and follow docs/onprem/backup-recovery.md before cutover.')

def main():
    os.umask(0o077)
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['docker', 'podman'], default=os.environ.get('FORNOST_CONTAINER_ENGINE'))
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ('backup', 'verify', 'restore'):
        command = sub.add_parser(action)
        command.add_argument('directory', type=Path)
        if action == 'restore':
            command.add_argument('volume')
            command.add_argument('recovery', type=Path)
    args = parser.parse_args()
    if args.action == 'verify':
        verify(args.directory)
        print('Backup checksums and archive structure verified. This is not an application restore drill.')
        return
    engine = args.engine or ('podman' if shutil.which('podman') else 'docker')
    root = Path(os.environ.get('FORNOST_PROJECT_ROOT', Path(__file__).resolve().parents[2]))
    with (root / '.fornost-maintenance.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Another installation or recovery operation is in progress')
        if args.action == 'backup':
            backup(engine, args.directory)
        else:
            restore(engine, args.directory, args.volume, args.recovery)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Backup/recovery interrupted; check runtime state before retrying.', file=sys.stderr)
        sys.exit(130)
    except (ValueError, OSError, KeyError, tarfile.TarError, subprocess.CalledProcessError) as error:
        # Never print process input/output: inspect contains deployment secrets.
        print('Backup/recovery failed: ' + (str(error) if not isinstance(error, subprocess.CalledProcessError) else 'container command failed'), file=sys.stderr)
        sys.exit(1)
