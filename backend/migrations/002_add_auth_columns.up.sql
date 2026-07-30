-- 002_add_auth_columns.up.sql
-- Add username/password auth support

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Create unique index on username (SQLite doesn't support ADD CONSTRAINT UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
