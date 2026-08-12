-- 007_add_is_seed_to_notes.up.sql
-- Mark the 3 seeded global notes so they never count toward the guest
-- note limit. Guests share the user_id IS NULL namespace with the seeded
-- welcome notes ('global-note-1/2/3' from 001), so without this flag a
-- guest is permanently blocked at 0 of 3 own notes.

ALTER TABLE notes ADD COLUMN is_seed INTEGER NOT NULL DEFAULT 0;

UPDATE notes SET is_seed = 1 WHERE id IN ('global-note-1', 'global-note-2', 'global-note-3');
