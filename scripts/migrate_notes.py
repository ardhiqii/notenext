#!/usr/bin/env python3
"""notenext migration tool — copy notes from prod DB to dev DB by email mapping."""

import sqlite3
import sys
import os

PROD_DB = "/var/lib/docker/volumes/notenext_sqlite_data/_data/notenext.db"
DEV_DB = "/opt/projects/notenext/backend/internal/data/notenext.db"

def migrate_user_notes(email: str, dry_run: bool = False):
    """Copy all notes for a user matching `email` from prod to dev."""
    
    # Connect
    pdb = sqlite3.connect(PROD_DB)
    pdb.row_factory = sqlite3.Row
    ddb = sqlite3.connect(DEV_DB)
    ddb.row_factory = sqlite3.Row
    
    # Find user in prod
    prod_user = pdb.execute("SELECT id, email, name FROM users WHERE email = ?", (email,)).fetchone()
    if not prod_user:
        print(f"User {email} not found in prod DB")
        return
    
    # Find user in dev (same email)
    dev_user = ddb.execute("SELECT id, email, name FROM users WHERE email = ?", (email,)).fetchone()
    if not dev_user:
        print(f"User {email} not found in dev DB — login with Google on dev first")
        return
    
    # Get notes from prod
    prod_notes = pdb.execute(
        "SELECT id, title, content, position_at, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY position_at",
        (prod_user["id"],)
    ).fetchall()
    
    print(f"Prod user: {prod_user['id'][:8]}... — {len(prod_notes)} notes")
    print(f"Dev user:  {dev_user['id'][:8]}... — ", end="")
    
    # Check existing dev notes
    dev_note_count = ddb.execute("SELECT COUNT(*) FROM notes WHERE user_id = ?", (dev_user["id"],)).fetchone()[0]
    print(f"{dev_note_count} notes")
    
    if dry_run:
        print("\n[DRY RUN] Would copy these notes:")
        for n in prod_notes:
            print(f"  - {n['title'][:40]} (created: {n['created_at']})")
        return
    
    # Copy notes — skip if note with same title+content already exists
    copied = 0
    skipped = 0
    for note in prod_notes:
        # Check for duplicate (same title for same user)
        existing = ddb.execute(
            "SELECT id FROM notes WHERE user_id = ? AND title = ?",
            (dev_user["id"], note["title"])
        ).fetchone()
        if existing:
            skipped += 1
            continue
        
        ddb.execute(
            """INSERT INTO notes (id, user_id, title, content, position_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (note["id"], dev_user["id"], note["title"], note["content"],
             note["position_at"], note["created_at"], note["updated_at"])
        )
        copied += 1
    
    ddb.commit()
    print(f"\nDone: {copied} copied, {skipped} skipped (already exist)")
    
    pdb.close()
    ddb.close()

if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "ardhiqi@gmail.com"
    dry = "--dry-run" in sys.argv
    migrate_user_notes(email, dry_run=dry)
