CREATE VIEW class_overview AS
SELECT
  c.id,
  c.name,
  c.class_code,
  c.description,
  c.group_capacity,
  c.start_date,
  c.end_date,
  c.status,
  c.created_by,
  c.created_at,
  c.updated_at,
  count(e.id)::int AS total_participants,
  (count(e.id) FILTER (WHERE e.attendance_mode = 'ONLINE'))::int AS online_participants,
  (count(e.id) FILTER (WHERE e.attendance_mode = 'PHYSICAL'))::int AS physical_participants,
  (count(e.id) FILTER (WHERE e.group_id IS NULL))::int AS unassigned_participants,
  (SELECT count(*)::int FROM groups g WHERE g.class_id = c.id) AS total_groups
FROM classes c
LEFT JOIN class_enrollments e ON e.class_id = c.id
GROUP BY c.id;
