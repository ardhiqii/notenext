-- 004_default_group.up.sql
-- Assign every existing ungrouped tab to a default group per user,
-- so no tab floats without organization.

-- 1. Create a "General" group for every user who has >=1 tab but zero groups.
INSERT INTO tab_groups (id, user_id, name, position_at, collapsed)
SELECT lower(hex(randomblob(16))), u.user_id, 'General', 0, 0
FROM (
    SELECT DISTINCT user_id FROM notes
    WHERE user_id IS NOT NULL AND group_id IS NULL
) u
WHERE NOT EXISTS (
    SELECT 1 FROM tab_groups tg WHERE tg.user_id = u.user_id
);

-- 2. Assign ungrouped tabs to the user's default group
--    (their "General" if exists, else their first group by position).
UPDATE notes
SET group_id = (
    SELECT tg.id FROM tab_groups tg
    WHERE tg.user_id = notes.user_id
    ORDER BY CASE WHEN tg.name = 'General' THEN 0 ELSE 1 END,
             tg.position_at, tg.created_at
    LIMIT 1
)
WHERE user_id IS NOT NULL AND group_id IS NULL;
