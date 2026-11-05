ALTER TABLE groups
  ADD COLUMN whatsapp_link TEXT CHECK (whatsapp_link IS NULL OR whatsapp_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$');

DROP VIEW group_overview;

CREATE VIEW group_overview AS
SELECT
  g.id,
  g.class_id,
  c.name AS class_name,
  g.name,
  g.group_number,
  g.capacity,
  g.attendance_mode,
  g.status,
  g.whatsapp_link,
  g.group_leader_id,
  lp.full_name AS group_leader_name,
  g.created_at,
  count(e.id)::int AS current_members,
  (g.capacity - count(e.id))::int AS available_spaces
FROM groups g
JOIN classes c ON c.id = g.class_id
LEFT JOIN class_enrollments e ON e.group_id = g.id
LEFT JOIN class_enrollments le ON le.id = g.group_leader_id
LEFT JOIN participants lp ON lp.id = le.participant_id
GROUP BY g.id, c.name, lp.full_name;
