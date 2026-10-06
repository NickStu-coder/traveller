"""Check the NAS backup boundary without reaching a real Docker daemon."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BOUNDARY = '''#!/usr/bin/env python3
import json, os, pathlib, sys
a=sys.argv[1:]
with open(os.environ['BACKUP_TEST_LOG'],'a') as stream: stream.write(json.dumps(a)+'\\n')
if a[0]=='ps':
    service=next(x for x in a if 'compose.service=' in x).split('=')[-1]
    print(service+'-fixture')
    if os.environ.get('BACKUP_TEST_DUPLICATE'): print('second-container')
elif a[0]=='inspect': print('ghcr.io/example/traveller@sha256:'+'a'*64)
elif a[0]=='cp': pathlib.Path(a[-1]).write_bytes(b'fixture-sqlite')
elif 'pg_dump' in ' '.join(a):
    if os.environ.get('BACKUP_TEST_DUMP_FAIL'): sys.exit(1)
    sys.stdout.buffer.write(b'PGDMP-fixture')
elif 'pg_restore' in a:
    if os.environ.get('BACKUP_TEST_RESTORE_FAIL'): sys.exit(1)
    print('fixture archive contents')
elif 'curl' in a: print('{"data":{"commit":"fixture"}}')
elif 'node' in a:
    if os.environ.get('BACKUP_TEST_SQLITE_FAIL'): sys.exit(1)
    print(os.environ.get('BACKUP_TEST_SQLITE','saved'))
'''


class BackupSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.destination = self.root / 'backups'
        self.log = self.root / 'docker.log'
        executable = self.root / 'docker'
        executable.write_text(BOUNDARY)
        executable.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.root)+os.pathsep+os.environ['PATH'],
                        BACKUP_TEST_LOG=str(self.log), TRAVELLER_BACKUP_DIR=str(self.destination))

    def execute(self, **overrides):
        return subprocess.run(['sh', 'scripts/traveller/backup-synology.sh'], cwd=ROOT,
                              env={**self.env, **overrides}, capture_output=True, text=True, timeout=15)

    def commands(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_success_checks_archive_sqlite_and_checksums_without_secrets_or_deletion(self):
        result = self.execute()
        self.assertEqual(result.returncode, 0, result.stderr)
        snapshots = list(self.destination.glob('traveller-*'))
        self.assertEqual(len(snapshots), 1)
        snapshot = snapshots[0]
        self.assertTrue((snapshot/'database.dump').read_bytes().startswith(b'PGDMP'))
        self.assertEqual((snapshot/'analytics.db').read_bytes(), b'fixture-sqlite')
        check = subprocess.run(['sha256sum', '-c', 'checksums.sha256'], cwd=snapshot, capture_output=True)
        self.assertEqual(check.returncode, 0, check.stderr)
        self.assertFalse((self.destination/'.backup-lock').exists())
        self.assertTrue(any('pg_restore' in a and '--file=/dev/null' in a for a in self.commands()))
        self.assertTrue(all('label=com.docker.compose.project=traveller-prod' in a for a in self.commands() if a[0]=='ps'))
        self.assertFalse(any(a[0] in ['rm', 'stop', 'kill'] for a in self.commands()))
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o700)

    def test_dump_archive_or_sqlite_failure_preserves_prior_backup_and_never_publishes_partial(self):
        self.assertEqual(self.execute().returncode, 0)
        existing = {p.name for p in self.destination.glob('traveller-*')}
        for setting in ['BACKUP_TEST_DUMP_FAIL', 'BACKUP_TEST_RESTORE_FAIL', 'BACKUP_TEST_SQLITE_FAIL']:
            with self.subTest(setting=setting):
                self.assertNotEqual(self.execute(**{setting:'1'}).returncode, 0)
                self.assertEqual({p.name for p in self.destination.glob('traveller-*')}, existing)
                self.assertFalse((self.destination/'.backup-lock').exists())

    def test_duplicate_container_refuses_before_creating_destination(self):
        self.assertNotEqual(self.execute(BACKUP_TEST_DUPLICATE='1').returncode, 0)
        self.assertFalse(self.destination.exists())

    def test_existing_lock_or_unrelated_directory_is_preserved(self):
        self.destination.mkdir()
        important = self.destination/'existing-user-file'
        important.write_text('preserve')
        self.assertNotEqual(self.execute().returncode, 0)
        self.assertEqual(important.read_text(), 'preserve')
        important.unlink()
        (self.destination/'.traveller-backups').write_text('Traveller backup directory\n')
        (self.destination/'.backup-lock').mkdir()
        self.assertNotEqual(self.execute().returncode, 0)
        self.assertTrue((self.destination/'.backup-lock').is_dir())

    def test_absent_analytics_is_explicit_and_filesystem_root_is_refused(self):
        self.assertEqual(self.execute(BACKUP_TEST_SQLITE='absent').returncode, 0)
        snapshot = next(self.destination.glob('traveller-*'))
        self.assertIn('analytics=absent', (snapshot/'manifest.txt').read_text())
        self.assertFalse((snapshot/'analytics.db').exists())
        self.assertNotEqual(self.execute(TRAVELLER_BACKUP_DIR='/').returncode, 0)
        link = self.root/'root-link'
        link.symlink_to('/', target_is_directory=True)
        self.assertNotEqual(self.execute(TRAVELLER_BACKUP_DIR=str(link)).returncode, 0)


if __name__ == '__main__':
    unittest.main()
