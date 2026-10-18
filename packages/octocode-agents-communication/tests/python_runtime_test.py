"""Portability boundaries not covered by the process-level protocol fixtures."""
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import contextmanager

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
# A session on a test database registers itself under the Octocode home; keep that out of the real one.
HOME = tempfile.mkdtemp(prefix='communication-home-')
os.environ['OCTOCODE_HOME'] = HOME
from communication import database, registry
from communication.paths import lease_key
from communication.store import Store


@contextmanager
def sqlite_version(version):
    original = sqlite3.sqlite_version_info
    sqlite3.sqlite_version_info = version
    try:
        yield
    finally:
        sqlite3.sqlite_version_info = original


class PythonRuntimeTests(unittest.TestCase):
    def test_wal_reset_patched_branches(self):
        for version in [(3, 44, 6), (3, 44, 7), (3, 50, 7), (3, 50, 8), (3, 51, 3), (3, 52, 0)]:
            self.assertTrue(database.wal_safe(version), version)
        for version in [(3, 42, 0), (3, 44, 5), (3, 45, 0), (3, 49, 9), (3, 50, 6), (3, 51, 2)]:
            self.assertFalse(database.wal_safe(version), version)

    def test_old_sqlite_rejected_before_creating_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'db'
            with sqlite_version((3, 41, 2)):
                with self.assertRaisesRegex(ValueError, 'SQLite >=3.42'):
                    database.open(path, create=True)
            self.assertFalse(path.exists())

    def test_unpatched_sqlite_creates_delete_journal_and_preserves_it(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'db'
            with sqlite_version((3, 51, 0)):
                db = database.open(path, create=True)
                self.assertEqual(database.metadata(db)['journalMode'], 'delete')
                db.close()
            with sqlite_version((3, 51, 3)):
                db = database.open(path)
                self.assertEqual(database.metadata(db)['journalMode'], 'delete')
                db.close()

    def test_unsafe_existing_wal_fails_without_changing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'db'
            with sqlite_version((3, 51, 3)):
                db = database.open(path, create=True)
                self.assertEqual(database.metadata(db)['journalMode'], 'wal')
                db.close()
            with sqlite_version((3, 51, 2)):
                with self.assertRaisesRegex(ValueError, 'This database uses WAL; upgrade Python'):
                    database.open(path)
                db = database.open(path, read_only=True)
                self.assertEqual(database.metadata(db)['journalMode'], 'wal')
                db.close()

    def test_schema_fingerprint_preserves_database_protocol(self):
        self.assertEqual(database.schema()['schemaSha256'], '68083d45977cb9de63a4e7af324a36515f5dedec89a195f433b1bd155b9e085f')

    def entries(self):
        folder = registry.directory()
        return {file.name: json.loads(file.read_text()) for file in sorted(folder.glob('*.json'))} if folder.exists() else {}

    def clear_registry(self):
        for file in registry.directory().glob('*') if registry.directory().exists() else []:
            file.unlink()

    def test_non_default_database_is_registered_with_pid_and_start_time(self):
        self.clear_registry()
        with tempfile.TemporaryDirectory() as directory:
            database_file = Path(directory) / 'db'
            store = Store(database_file, directory, create=True)
            try:
                entry = self.entries()[str(os.getpid()) + '.json']
                self.assertEqual(set(entry), {'version', 'database', 'pid', 'started', 'updatedAt'})
                self.assertEqual((entry['version'], entry['database'], entry['pid']), (1, str(database_file), os.getpid()))
                self.assertTrue(entry['started'] is None or entry['started'].isdigit())
                if os.name != 'nt':
                    self.assertEqual(entry['started'], registry.process_started(os.getpid()))
                self.assertLessEqual(abs(entry['updatedAt'] - registry.now_ms()), 5000)
                self.assertEqual((registry.directory().stat().st_mode & 0o777, next(registry.directory().glob('*.json')).stat().st_mode & 0o777), (0o700, 0o600))
            finally:
                store.db.close()

    def test_default_and_read_only_sessions_register_nothing(self):
        self.clear_registry()
        default = registry.database_path()
        self.assertIsNone(registry.register(default))
        with tempfile.TemporaryDirectory() as directory:
            database_file = Path(directory) / 'db'
            Store(database_file, directory, create=True).db.close()
            self.clear_registry()
            store = Store(database_file, directory, read_only=True)
            try:
                self.assertEqual(self.entries(), {})
            finally:
                store.db.close()

    def test_registration_refreshes_only_when_stale_and_prunes_dead_entries(self):
        self.clear_registry()
        folder = registry.directory()
        folder.mkdir(parents=True, exist_ok=True)
        now = registry.now_ms()
        dead = 2 ** 22 + 7
        while registry.process_alive(dead):
            dead += 1
        grace = registry.GRACE_MS
        write = lambda name, entry: (folder / name).write_text(entry if isinstance(entry, str) else json.dumps(entry))
        write('dead-old.json', {'version': 1, 'database': '/x', 'pid': dead, 'started': None, 'updatedAt': now - grace - 1})
        write('dead-recent.json', {'version': 1, 'database': '/y', 'pid': dead, 'started': None, 'updatedAt': now - grace + 5000})
        write('reused-pid.json', {'version': 1, 'database': '/z', 'pid': os.getpid(), 'started': '1', 'updatedAt': now - grace - 1})
        write('broken.json', '{not json')
        write('alive-old.json', {'version': 1, 'database': '/w', 'pid': os.getppid(), 'started': registry.process_started(os.getppid()), 'updatedAt': now - grace - 1})
        with tempfile.TemporaryDirectory() as directory:
            registration = registry.register(Path(directory) / 'db')
            try:
                self.assertEqual(sorted(self.entries()), sorted(['dead-recent.json', 'alive-old.json', str(os.getpid()) + '.json'] + (['reused-pid.json'] if os.name == 'nt' else [])))
                self.assertFalse((folder / 'dead-old.json').exists())
                if os.name != 'nt':  # start times are unknown on Windows, where the pid alone decides
                    self.assertFalse((folder / 'reused-pid.json').exists())
                self.assertFalse((folder / 'broken.json').exists())
                written = registration.written
                registration.touch()
                self.assertEqual(registration.written, written, 'a fresh entry is not rewritten')
                registration.written -= registry.REFRESH_MS
                registration.touch()
                self.assertGreaterEqual(registration.written, written)
                self.assertGreaterEqual(self.entries()[str(os.getpid()) + '.json']['updatedAt'], written)
            finally:
                self.clear_registry()

    def test_leave_releases_pending_claims_without_acknowledging_mail(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'db', directory, create=True)
            try:
                author = store.call('', 'join', {'name': 'author', 'vendor': 'raw'})['id']
                recipient = store.call('', 'join', {'name': 'recipient', 'vendor': 'raw'})['id']
                sent = store.call(author, 'send_message', {'to': recipient, 'body': 'Review this', 'reasoning': 'Verify claim cleanup'})
                store.db.execute('UPDATE deliveries SET claimedBy=?,claimUntil=? WHERE message=? AND recipient=?', ('worker', 2**62, sent['id'], recipient))
                store.call(recipient, 'leave', {})
                state = store.db.execute('SELECT claimedBy,claimUntil,acknowledgedAt FROM deliveries WHERE message=? AND recipient=?', (sent['id'], recipient)).fetchone()
                self.assertEqual(state, (None, 0, None))
                self.assertEqual(store.fetch(author, {'type': 'delivery.acknowledged'})['items'], [])
            finally:
                store.db.close()

    def test_claude_inbound_follows_documented_hold_rules(self):
        from communication.transport import claude_inbound
        cases = [
            (None, False, 'unknown'),
            ({'permissionMode': 'bypassPermissions'}, False, 'held'),
            ({'permissionMode': 'bypassPermissions'}, True, 'delivered'),
            ({'permissionMode': 'default'}, False, 'delivered'),
            ({'permissionMode': 'auto'}, False, 'delivered'),
            ({'permissionMode': 'plan'}, False, 'unknown'),
            ({'permissionMode': 'default', 'crossSessionInbound': 'hold'}, True, 'held'),
            ({'permissionMode': 'default', 'crossSessionInbound': 'refuse'}, False, 'refused'),
            ({'permissionMode': 'bypassPermissions', 'crossSessionInbound': 'accept'}, False, 'delivered'),
            ({'permissionMode': 'default', 'crossSessionInbound': 'unrecognized'}, False, 'unknown'),
        ]
        for state, own_child, outcome in cases:
            self.assertEqual(claude_inbound(state, own_child)[0], outcome, (state, own_child))

    def test_lease_keys_use_frozen_unicode_16(self):
        self.assertEqual(lease_key('/workspace/Straße'), lease_key('/workspace/STRASSE'))
        self.assertEqual(lease_key('/workspace/é'), lease_key('/workspace/E\u0301'))
        # Cyrillic Tje was added in Unicode 16; older Python casefold leaves the
        # capital intact. Both spellings must still contend for the same lease.
        self.assertEqual(lease_key('/workspace/\u1c89'), lease_key('/workspace/\u1c8a'))


if __name__ == '__main__':
    unittest.main()
