-- 005_backfill_ungrouped.up.sql
-- Backfill: assign ANY ungrouped note to its user's default group.
--
-- Unlike 004 (which ran once at feature launch), this migration is a
-- re-runnable safety net: notes created after 004 (e.g. before the
-- new-note-to-active-group bug was fixed) can still be ungrouped.
-- This is safe to run at any time — it never deletes data and only
-- touches rows where group_id IS NULL.

-- 1. Create a "General" group for any user who has >=1 ungrouped note
--    but zero groups (e.g. brand-new users with pre-existing tabs).
INSERT INTO tab_groups (id, user_id, name, position_at, collapsed)
SELECT lower(hex(randomblob(16))), u.user_id, 'General', 0, 0
FROM (
    SELECT DISTINCT user_id FROM notes
    WHERE user_id IS NOT NULL AND group_id IS NULL
) u
WHERE NOT EXISTS (
    SELECT 1 FROM tab_groups tg WHERE tg.user_id = u.user_id
);

-- 2. Assign every remaining ungrouped note to the user's default group
--    (their "General" if one exists, else their first group by position).
UPDATE notes
SET group_id = (
    SELECT tg.id FROM tab_groups tg
    WHERE tg.user_id = notes.user_id
    ORDER BY CASE WHEN tg.name = 'General' THEN 0 ELSE 1 END,
             tg.position_at, tg.created_at
    LIMIT 1
)
WHERE user_id IS NOT NULL AND group_id IS NULL;
