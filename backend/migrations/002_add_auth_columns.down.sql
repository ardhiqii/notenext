-- 002_add_auth_columns.down.sql

DROP INDEX IF EXISTS idx_users_username;
-- SQLite doesn't support DROP COLUMN in older versions
-- For down migration, we just leave the columns (they won't hurt)
