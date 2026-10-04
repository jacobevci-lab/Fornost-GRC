import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', 'scripts/linux/backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class Backups(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.bundle = self.root / 'backup'
        self.bundle.mkdir()
        self.env = ''.join(key + '=' + os.urandom(32).hex() + '\n' for key in backup.KEYS)
        (self.bundle / 'recovery.env').write_text(self.env)
        self.archive([('d1/database.sqlite', tarfile.REGTYPE)])

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, entries):
        with tarfile.open(self.bundle / 'data.tar', 'w') as target:
            for name, kind in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.linkname = '/etc/passwd' if kind == tarfile.SYMTYPE else ''
                member.size = 4 if kind == tarfile.REGTYPE else 0
                target.addfile(member, io.BytesIO(b'data') if member.size else None)
        manifest = {'format': 'fornost-offline-v1', 'image': 'sha256:' + 'a'*64,
                    'sha256': {name: backup.digest(self.bundle / name) for name in backup.FILES}}
        (self.bundle / 'manifest.json').write_text(json.dumps(manifest))

    def test_valid(self):
        self.assertEqual(backup.verify(self.bundle)['format'], 'fornost-offline-v1')

    def test_corruption(self):
        with (self.bundle / 'data.tar').open('ab') as target: target.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'): backup.verify(self.bundle)

    def test_paths_and_special_entries(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE), ('link', tarfile.SYMTYPE), ('hard', tarfile.LNKTYPE), ('device', tarfile.CHRTYPE), ('x\\y', tarfile.REGTYPE)]:
            with self.subTest(name=name):
                self.archive([(name, kind)])
                with self.assertRaises(ValueError): backup.verify(self.bundle)

    def test_duplicates(self):
        self.archive([('file', tarfile.REGTYPE), ('./file', tarfile.REGTYPE)])
        with self.assertRaises(ValueError): backup.verify(self.bundle)

    def test_missing_keys(self):
        (self.bundle / 'recovery.env').write_text('FORNOST_BASE_PATH=/grc\n')
        self.archive([('file', tarfile.REGTYPE)])
        with self.assertRaisesRegex(ValueError, 'recovery key'): backup.verify(self.bundle)

    def test_env_is_not_executed(self):
        value = 'A' * 32 + '$(touch /must-not-exist)!'
        (self.bundle / 'recovery.env').write_text(self.env.replace(self.env.splitlines()[0].split('=', 1)[1], value))
        self.assertEqual(backup.read_env(self.bundle / 'recovery.env')[backup.KEYS[0]], value)

    def test_linked_input(self):
        (self.bundle / 'data.tar').unlink()
        (self.bundle / 'data.tar').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError): backup.verify(self.bundle)

    def test_existing_volume_refused_before_mutation(self):
        with patch.object(backup, 'run') as run:
            run.return_value.returncode = 0
            with self.assertRaisesRegex(ValueError, 'already exists'):
                backup.restore('docker', self.bundle, 'fornost-grc-restore-test', self.root/'recovery')
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args[0][1:3], ('volume', 'inspect'))

    def test_normal_volume_refused(self):
        with self.assertRaises(ValueError): backup.restore('docker', self.bundle, 'fornost-grc-data', self.root/'recovery')

    def test_copy_failure_restarts_original(self):
        info = {'Image': 'sha256:'+'a'*64, 'State': {'Running': True}, 'Mounts': [{'Destination': backup.DATA, 'Type': 'volume'}], 'Config': {'Env': self.env.splitlines()}}
        stopped_info = {**info, 'State': {'Running': False}}
        calls = []
        def run(engine, *args, **kwargs):
            calls.append(args)
            if args[0] == 'cp': raise OSError('copy failed')
        with patch.object(backup, 'inspect', side_effect=[info, stopped_info]), patch.object(backup, 'run', side_effect=run):
            with self.assertRaises(OSError): backup.backup('docker', self.root/'failed')
        self.assertIn(('start', backup.APP), calls)

if __name__ == '__main__': unittest.main()
