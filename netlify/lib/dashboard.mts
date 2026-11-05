import { query } from './db.mts'
import type { SessionUser } from './auth.mts'
import { json } from './http.mts'

// Non-admins see the same Online-only view as the rest of the app, so physical figures are omitted for them.
export async function summary(user: SessionUser | null) {
  const isAdmin = user?.role === 'ADMIN'
  const [stats] = await query(
    `SELECT
       (SELECT count(*)::int FROM classes) AS "totalClasses",
       (SELECT count(*)::int FROM classes WHERE status = 'ACTIVE') AS "activeClasses",
       (SELECT count(*)::int FROM classes WHERE status = 'ARCHIVED') AS "archivedClasses",
       (SELECT count(DISTINCT participant_id)::int FROM class_enrollments WHERE $1::boolean OR attendance_mode = 'ONLINE') AS "totalParticipants",
       (SELECT count(*)::int FROM class_enrollments WHERE attendance_mode = 'ONLINE') AS "onlineParticipants",
       (SELECT count(*)::int FROM class_enrollments WHERE attendance_mode = 'PHYSICAL') AS "physicalParticipants",
       (SELECT count(*)::int FROM class_enrollments WHERE group_id IS NULL AND ($1::boolean OR attendance_mode = 'ONLINE')) AS "unassignedParticipants",
       (SELECT count(*)::int FROM groups WHERE $1::boolean OR attendance_mode = 'ONLINE') AS "totalGroups",
       (SELECT count(*)::int FROM groups WHERE attendance_mode = 'ONLINE') AS "onlineGroups",
       (SELECT count(*)::int FROM groups WHERE attendance_mode = 'PHYSICAL') AS "physicalGroups"`,
    [isAdmin],
  )

  const recentClasses = await query(
    `SELECT id, name, class_code AS "classCode", status, created_at AS "createdAt",
            total_participants AS "totalParticipants", total_groups AS "totalGroups"
     FROM class_overview ORDER BY created_at DESC LIMIT 5`,
  )

  const recentParticipants = await query(
    `SELECT full_name AS "fullName", class_name AS "className", attendance_mode AS "attendanceMode",
            group_name AS "groupName", created_at AS "createdAt"
     FROM enrollment_overview
     WHERE $1::boolean OR attendance_mode = 'ONLINE'
     ORDER BY created_at DESC LIMIT 5`,
    [isAdmin],
  )

  const distribution = await query(
    `SELECT c.id, c.name,
            count(g.id)::int AS groups,
            (count(g.id) FILTER (WHERE g.attendance_mode = 'ONLINE'))::int AS "onlineGroups",
            (count(g.id) FILTER (WHERE g.attendance_mode = 'PHYSICAL'))::int AS "physicalGroups",
            (COALESCE(sum(g.current_members), 0))::int AS members,
            (COALESCE(sum(g.capacity), 0))::int AS capacity
     FROM classes c
     LEFT JOIN group_overview g ON g.class_id = c.id AND ($1::boolean OR g.attendance_mode = 'ONLINE')
     GROUP BY c.id, c.name
     ORDER BY c.start_date DESC, c.id DESC`,
    [isAdmin],
  )

  const recentActivity = isAdmin
    ? await query(
        `SELECT a.created_at AS "createdAt", a.action, a.description, u.full_name AS "userName"
         FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC LIMIT 10`,
      )
    : null

  const hideIfPublic = (r: Record<string, unknown>) => (isAdmin ? r : { ...r, physicalGroups: undefined, physicalParticipants: undefined })
  return json({
    isAdmin,
    stats: isAdmin ? stats : { ...stats, physicalParticipants: null, physicalGroups: null },
    recentClasses,
    recentParticipants,
    groupDistribution: distribution.map(hideIfPublic),
    recentActivity,
  })
}
