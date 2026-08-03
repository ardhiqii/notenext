-- 006_add_changelog_seen.down.sql
ALTER TABLE users DROP COLUMN last_seen_changelog_version;
