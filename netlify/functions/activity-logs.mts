import { authorize } from '../lib/auth.mts'
import { guard, query } from '../lib/db.mts'
import { json } from '../lib/http.mts'

const ENTITY_TYPES = ['USER', 'CLASS', 'GROUP', 'PARTICIPANT']

async function handle(req: Request) {
  const { error } = await authorize(req, ['ADMIN'])
  if (error) return error

  const url = new URL(req.url)
  const entityParam = url.searchParams.get('entityType') ?? ''
  const entityType = ENTITY_TYPES.includes(entityParam) ? entityParam : null
  const search = (url.searchParams.get('search') ?? '').trim()
  const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 25))

  const filter = `($1::text IS NULL OR a.entity_type = $1)
     AND ($2::text = '' OR a.description ILIKE $3 OR a.action ILIKE $3 OR u.full_name ILIKE $3)`
  const [{ total }] = await query(
    `SELECT count(*)::int AS total FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${filter}`,
    [entityType, search, pattern],
  )
  const logs = await query(
    `SELECT a.id, a.created_at AS "createdAt", a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
            a.description, a.old_values AS "oldValues", a.new_values AS "newValues", u.full_name AS "userName"
     FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
     WHERE ${filter}
     ORDER BY a.id DESC
     LIMIT $4 OFFSET $5`,
    [entityType, search, pattern, pageSize, (page - 1) * pageSize],
  )
  return json({ logs, total, page, pageSize })
}

export default async (req: Request) => guard(req, handle)

export const config = {
  path: '/api/activity-logs',
}
