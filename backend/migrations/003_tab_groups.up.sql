-- 003_tab_groups.up.sql
-- Tab groups: named collapsible containers for organizing tabs.

CREATE TABLE IF NOT EXISTS tab_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    position_at INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add nullable group_id to notes table
ALTER TABLE notes ADD COLUMN group_id TEXT REFERENCES tab_groups(id) ON DELETE SET NULL;

-- Index for fast lookup of tabs within a group
CREATE INDEX IF NOT EXISTS idx_notes_group_id ON notes(group_id);

-- Index for ordering groups
CREATE INDEX IF NOT EXISTS idx_tab_groups_position ON tab_groups(user_id, position_at);
