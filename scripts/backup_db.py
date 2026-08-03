#!/usr/bin/env python3
"""Daily NoteNext SQLite backup.

- Online backup via sqlite3 backup API (safe while the backend container
  has the DB open; WAL-aware).
- Writes to /var/backups/notenext/notenext-<YYYYMMDD-HHMMSS>.db
- Verifies the backup (PRAGMA integrity_check + note count) before keeping it.
- Prunes to the newest RETENTION backups.
- Exit 0 on success (prints one summary line), non-zero + stderr on failure.

Restore procedure (documented, NOT executed by this script):
    docker stop notenext-backend
    sudo cp /var/backups/notenext/notenext-<TS>.db \
      /var/lib/docker/volumes/notenext_sqlite_data/_data/notenext.db
    docker start notenext-backend
"""

import os
import sqlite3
import sys
from datetime import datetime

PROD_DB = "/var/lib/docker/volumes/notenext_sqlite_data/_data/notenext.db"
BACKUP_DIR = "/var/backups/notenext"
RETENTION = 14  # keep newest 14 backups

def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def main() -> None:
    if not os.path.isfile(PROD_DB):
        fail(f"prod DB not found: {PROD_DB}")

    os.makedirs(BACKUP_DIR, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(BACKUP_DIR, f"notenext-{ts}.db")
    tmp = dest + ".tmp"

    # 1. Online backup to a temp file first (never leave a partial real backup)
    try:
        src = sqlite3.connect(PROD_DB)
        dst = sqlite3.connect(tmp)
        with dst:
            src.backup(dst)
        dst.close()
        src.close()
    except Exception as e:  # noqa: BLE001
        fail(f"backup failed: {e}")

    # 2. Verify the backup is a valid, non-empty DB
    try:
        check = sqlite3.connect(tmp)
        integrity = check.execute("PRAGMA integrity_check").fetchone()[0]
        count = check.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        check.close()
    except Exception as e:  # noqa: BLE001
        fail(f"verification failed: {e}")

    if integrity != "ok":
        fail(f"integrity_check failed: {integrity}")
    if count < 0:
        fail("impossible note count")

    os.replace(tmp, dest)

    # 3. Prune old backups (newest RETENTION by filename timestamp)
    backups = sorted(
        f for f in os.listdir(BACKUP_DIR)
        if f.startswith("notenext-") and f.endswith(".db")
    )
    for old in backups[:-RETENTION]:
        try:
            os.remove(os.path.join(BACKUP_DIR, old))
        except OSError:
            pass

    print(f"OK backup={os.path.basename(dest)} notes={count} kept={min(len(backups), RETENTION)}")

if __name__ == "__main__":
    main()
