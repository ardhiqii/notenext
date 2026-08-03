-- 006_add_changelog_seen.up.sql
-- Track which app version the user has seen in the "What's New" popup.

ALTER TABLE users ADD COLUMN last_seen_changelog_version TEXT;
