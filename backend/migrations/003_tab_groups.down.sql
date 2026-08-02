-- 003_tab_groups.down.sql

DROP INDEX IF EXISTS idx_tab_groups_position;
DROP INDEX IF EXISTS idx_notes_group_id;
ALTER TABLE notes DROP COLUMN group_id;
DROP TABLE IF EXISTS tab_groups;
