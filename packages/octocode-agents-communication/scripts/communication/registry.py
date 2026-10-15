"""Registry of the non-default databases that live processes use, so tools that read only the default database can find them.

A process started with `--database <file>` writes one small JSON file, `<pid>.json`, under
`<Octocode home>/agents-communication/active-databases/`. One file per process needs no shared lock and no read-modify-write.
The format is a contract with the Pi extension, which reads it; scripts/docs/DB.md#active-database-registry owns it.
"""
import calendar
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from .config import database_path
from octocode_config import get_octocode_home

VERSION = 1
DIRECTORY = 'active-databases'
# How long a dead process's entry stays valid: a lease lives at most 10 minutes past the write that took it, and an
# entry is refreshed at most REFRESH_MS behind the writes of its process.
LEASE_TTL_MAX_MS = 600000
REFRESH_MS = 60000
GRACE_MS = LEASE_TTL_MAX_MS + REFRESH_MS
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def directory():
    return get_octocode_home() / 'agents-communication' / DIRECTORY


def now_ms():
    return int(time.time() * 1000)


def process_started(pid):
    """Whole seconds since the epoch at which `pid` started, as a decimal string: `ps` prints it in the C locale and UTC, so
    every reader in every time zone agrees. None where it is unknown (Windows, no `ps`, no such process)."""
    if os.name == 'nt':
        return None
    env = dict(os.environ, LC_ALL='C', TZ='UTC0')
    try:
        text = subprocess.run(['ps', '-o', 'lstart=', '-p', str(pid)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              text=True, timeout=2, env=env).stdout.split()
        # Mon Jan  2 15:04:05 2006
        clock = [int(part) for part in text[3].split(':')]
        return str(calendar.timegm((int(text[4]), MONTHS.index(text[1]) + 1, int(text[2]), *clock)))
    except (OSError, subprocess.SubprocessError, IndexError, ValueError):
        return None


def process_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, OverflowError, ValueError):
        return False


def entry_live(entry, at):
    """Whether the entry was written within the lease grace, or its process still runs and is the one that wrote it."""
    updated = entry.get('updatedAt')
    if isinstance(updated, int) and at - updated <= GRACE_MS:
        return True
    pid, started = entry.get('pid'), entry.get('started')
    return isinstance(pid, int) and pid > 0 and process_alive(pid) and (not started or process_started(pid) in (None, started))


def prune(folder, at):
    """Remove entries that are unreadable or no longer live; never the caller's own."""
    for file in folder.glob('*.json'):
        if file.stem == str(os.getpid()):
            continue
        try:
            entry = json.loads(file.read_text(encoding='utf-8'))
            stale = not isinstance(entry, dict) or not entry_live(entry, at)
        except (OSError, ValueError):
            stale = True
        if stale:
            try:
                file.unlink()
            except OSError:
                pass


class Registration:
    """This process's entry for one database; `touch` keeps it fresh while the process keeps writing."""

    def __init__(self, database):
        self.database = str(database)
        self.pid = os.getpid()
        self.started = process_started(self.pid)
        self.written = 0
        self.write()

    def write(self):
        folder = directory()
        at = now_ms()
        entry = {'version': VERSION, 'database': self.database, 'pid': self.pid, 'started': self.started, 'updatedAt': at}
        try:
            folder.mkdir(mode=0o700, parents=True, exist_ok=True)
            fd, temp = tempfile.mkstemp(prefix='.entry-', suffix='.tmp', dir=folder)
            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                    stream.write(json.dumps(entry, separators=(',', ':')))
                os.replace(temp, folder / (str(self.pid) + '.json'))
            except BaseException:
                Path(temp).unlink(missing_ok=True)
                raise
            prune(folder, at)
        except OSError:
            # The registry only makes the database visible to other tools; it never blocks the coordination itself.
            pass
        self.written = at

    def touch(self):
        if now_ms() - self.written >= REFRESH_MS:
            self.write()


def register(database):
    """A Registration when `database` is not the default file (which readers find without it), else None."""
    return None if Path(database) == database_path() else Registration(database)
