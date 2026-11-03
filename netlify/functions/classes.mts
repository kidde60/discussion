import { z } from 'zod'
import { randomInt } from 'node:crypto'
import { guard, sql } from '../lib/db.mts'
import { authorize, authorizeViewer, type SessionUser } from '../lib/auth.mts'
import { logActivity } from '../lib/activity.mts'
import { json, jsonError } from '../lib/http.mts'
import { classGroups } from '../lib/groups.mts'
import { classParticipants } from '../lib/participants.mts'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')

const classSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a class name').max(120),
    description: z.string().trim().max(1000).nullish().transform((v) => v || null),
    groupCapacity: z.number().int().min(1).max(500).default(10),
    startDate: isoDate,
    endDate: z.union([isoDate, z.literal('')]).nullish().transform((v) => v || null),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, { message: 'End date cannot be before start date', path: ['endDate'] })

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']) })

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomCode = () => 'CLS-' + Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')

const SELECT_CLASS = `
  SELECT id, name, class_code AS "classCode", description, group_capacity AS "groupCapacity",
         start_date::text AS "startDate", end_date::text AS "endDate", status, created_at AS "createdAt",
         total_participants AS "totalParticipants", online_participants AS "onlineParticipants",
         physical_participants AS "physicalParticipants", unassigned_participants AS "unassignedParticipants",
         total_groups AS "totalGroups"
  FROM class_overview`

const notFound = () => jsonError(404, 'Class not found')

async function handle(req: Request) {
  const url = new URL(req.url)
  const segments = url.pathname.replace(/^\/api\/classes\/?/, '').split('/').filter(Boolean)
  const write = req.method !== 'GET'

  const { user, error } = write ? await authorize(req, ['ADMIN']) : await authorizeViewer(req)
  if (error) return error

  if (segments[1] === 'groups') return classGroups(req, user, Number(segments[0]), segments.slice(2))
  if (segments[1] === 'participants') return classParticipants(req, user, Number(segments[0]), segments.slice(2), url)
  if (write) return handleWrite(req, user, segments)

  if (segments.length === 0) {
    const search = (url.searchParams.get('search') ?? '').trim()
    const statusParam = url.searchParams.get('status')
    const status = statusParam === 'ACTIVE' || statusParam === 'ARCHIVED' ? statusParam : null
    const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
    const classes = await sql.query(
      `${SELECT_CLASS}
       WHERE ($1 = '' OR name ILIKE $2 OR class_code ILIKE $2)
         AND ($3::text IS NULL OR status = $3)
       ORDER BY created_at DESC`,
      [search, pattern, status],
    )
    return json({ classes })
  }

  const id = Number(segments[0])
  if (!Number.isInteger(id) || segments.length !== 1) return jsonError(404, 'Not found')
  const [cls] = await sql.query(`${SELECT_CLASS} WHERE id = $1`, [id])
  return cls ? json({ class: cls }) : notFound()
}

export default async (req: Request) => guard(req, handle)

async function handleWrite(req: Request, user: SessionUser | null, segments: string[]) {
  if (!user) return jsonError(403, 'Forbidden')
  const userId = user.id
  if (segments.length === 0 && req.method === 'POST') {
    const parsed = classSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    const v = parsed.data
    const id = await insertClass(v, userId)
    const [cls] = await sql.query(`${SELECT_CLASS} WHERE id = $1`, [id])
    await logActivity({ userId, action: 'CLASS_CREATED', entityType: 'CLASS', entityId: id, description: `Created class ${v.name}`, newValues: cls })
    return json({ class: cls }, 201)
  }

  const id = Number(segments[0])
  if (!Number.isInteger(id)) return jsonError(400, 'Invalid class id')

  if (segments.length === 1 && req.method === 'PUT') {
    const parsed = classSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    const [before] = await sql.query(`${SELECT_CLASS} WHERE id = $1`, [id])
    if (!before) return notFound()
    const v = parsed.data
    await sql`
      UPDATE classes SET name = ${v.name}, description = ${v.description}, group_capacity = ${v.groupCapacity},
             start_date = ${v.startDate}, end_date = ${v.endDate}, updated_at = now()
      WHERE id = ${id}`
    const [after] = await sql.query(`${SELECT_CLASS} WHERE id = $1`, [id])
    await logActivity({ userId, action: 'CLASS_UPDATED', entityType: 'CLASS', entityId: id, description: `Updated class ${v.name}`, oldValues: before, newValues: after })
    return json({ class: after })
  }

  if (segments.length === 2 && segments[1] === 'archive' && req.method === 'PATCH') {
    const parsed = statusSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'status must be ACTIVE or ARCHIVED')
    const [before] = await sql.query(`${SELECT_CLASS} WHERE id = $1`, [id])
    if (!before) return notFound()
    const status = parsed.data.status
    await sql`UPDATE classes SET status = ${status}, updated_at = now() WHERE id = ${id}`
    const [after] = await sql.query(`${SELECT_CLASS} WHERE id = $1`, [id])
    const action = status === 'ARCHIVED' ? 'CLASS_ARCHIVED' : 'CLASS_ACTIVATED'
    await logActivity({ userId, action, entityType: 'CLASS', entityId: id, description: `${status === 'ARCHIVED' ? 'Archived' : 'Activated'} class ${before.name}`, oldValues: { status: before.status }, newValues: { status } })
    return json({ class: after })
  }

  return jsonError(405, 'Method not allowed')
}

async function insertClass(v: z.infer<typeof classSchema>, userId: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await sql`
        INSERT INTO classes (name, class_code, description, group_capacity, start_date, end_date, created_by)
        VALUES (${v.name}, ${randomCode()}, ${v.description}, ${v.groupCapacity}, ${v.startDate}, ${v.endDate}, ${userId})
        RETURNING id`
      return row.id as string
    } catch (err) {
      const duplicateCode = (err as { code?: string }).code === '23505'
      if (!duplicateCode || attempt === 5) throw err
    }
  }
}

export const config = {
  path: ['/api/classes', '/api/classes/*'],
}
