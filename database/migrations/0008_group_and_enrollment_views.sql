CREATE VIEW group_overview AS
SELECT
  g.id,
  g.class_id,
  g.name,
  g.group_number,
  g.capacity,
  g.attendance_mode,
  g.status,
  g.group_leader_id,
  lp.full_name AS group_leader_name,
  g.created_at,
  count(e.id)::int AS current_members,
  (g.capacity - count(e.id))::int AS available_spaces
FROM groups g
LEFT JOIN class_enrollments e ON e.group_id = g.id
LEFT JOIN class_enrollments le ON le.id = g.group_leader_id
LEFT JOIN participants lp ON lp.id = le.participant_id
GROUP BY g.id, lp.full_name;

CREATE VIEW enrollment_overview AS
SELECT
  e.id AS enrollment_id,
  p.id AS participant_id,
  p.full_name,
  p.phone_number,
  p.registration_number,
  e.class_id,
  c.name AS class_name,
  c.class_code,
  e.attendance_mode,
  e.group_id,
  g.name AS group_name,
  g.group_number,
  e.created_at
FROM class_enrollments e
JOIN participants p ON p.id = e.participant_id
JOIN classes c ON c.id = e.class_id
LEFT JOIN groups g ON g.id = e.group_id;
