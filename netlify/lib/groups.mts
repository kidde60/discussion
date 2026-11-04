import { z } from 'zod'
import { query, transaction, type Query } from './db.mts'
import { logActivity } from './activity.mts'
import type { SessionUser } from './auth.mts'
import { ENROLLMENT_SELECT } from './enrollments.mts'
import { groupExport } from './export.mts'
import { json, jsonError } from './http.mts'

const GROUP_SELECT = `
  SELECT id, class_id AS "classId", class_name AS "className", name, group_number AS "groupNumber", capacity,
         attendance_mode AS "attendanceMode", status, group_leader_id AS "groupLeaderId",
         group_leader_name AS "groupLeaderName", current_members AS "currentMembers",
         available_spaces AS "availableSpaces", created_at AS "createdAt"
  FROM group_overview`

const modeSchema = z.enum(['ONLINE', 'PHYSICAL'])
const capacitySchema = z.number().int().min(1, 'Capacity must be at least 1').max(500)
const leaderSchema = z.coerce.number().int().positive().nullish()

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  capacity: capacitySchema.optional(),
  attendanceMode: modeSchema,
  groupLeaderId: leaderSchema,
})

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a group name').max(120),
  capacity: capacitySchema,
  groupLeaderId: leaderSchema,
})

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']) })

const generateSchema = z.object({
  attendanceMode: modeSchema,
  strategy: z.enum(['NEW', 'FILL']),
  capacity: capacitySchema.optional(),
  confirm: z.boolean().default(false),
})

const groupName = (n: number) => `Group ${String(n).padStart(2, '0')}`

type Member = { enrollmentId: string; fullName: string; registrationNumber: string }
type Step = { action: 'CREATE' | 'ASSIGN'; groupId: string | null; groupNumber: number | null; name: string; capacity: number; members: Member[] }
type Plan = { steps: Step[]; totalToAssign: number; leftover: number }

const requireAdmin = (user: SessionUser | null) => (user?.role === 'ADMIN' ? null : jsonError(403, 'Forbidden'))

// All groups across classes, filterable by class, attendance mode and status.
export async function listGroups(url: URL) {
  const classParam = url.searchParams.get('classId')
  const classId = classParam && /^\d+$/.test(classParam) ? classParam : null
  const modeParam = url.searchParams.get('attendanceMode')
  const mode = modeParam === 'ONLINE' || modeParam === 'PHYSICAL' ? modeParam : null
  const statusParam = url.searchParams.get('status')
  const status = statusParam === 'ACTIVE' || statusParam === 'ARCHIVED' ? statusParam : null
  const search = (url.searchParams.get('search') ?? '').trim()
  const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
  const groups = await query(
    `${GROUP_SELECT}
     WHERE ($1::bigint IS NULL OR class_id = $1::bigint)
       AND ($2::text IS NULL OR attendance_mode = $2::text)
       AND ($3::text IS NULL OR status = $3::text)
       AND ($4::text = '' OR name ILIKE $5 OR group_leader_name ILIKE $5)
     ORDER BY class_name, group_number`,
    [classId, mode, status, search, pattern],
  )
  return json({ groups })
}

// Routes under /api/classes/:id/groups
export async function classGroups(req: Request, user: SessionUser | null, classId: number, rest: string[]) {
  const [cls] = await query(`SELECT id, group_capacity AS "groupCapacity" FROM classes WHERE id = $1`, [classId])
  if (!cls) return jsonError(404, 'Class not found')

  if (req.method === 'GET' && rest.length === 0) {
    return json({ groups: await query(`${GROUP_SELECT} WHERE class_id = $1 ORDER BY group_number`, [classId]) })
  }

  const denied = requireAdmin(user)
  if (denied) return denied
  const actor = user as SessionUser

  if (req.method === 'POST' && rest.length === 0) return createGroup(req, actor, cls.id, cls.groupCapacity)
  if (req.method === 'POST' && rest.length === 1 && rest[0] === 'generate') return generate(req, actor, cls.id, cls.groupCapacity)
  return jsonError(404, 'Not found')
}

async function createGroup(req: Request, user: SessionUser, classId: string, defaultCapacity: number) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
  const v = parsed.data

  const [{ next }] = await query(`SELECT (COALESCE(MAX(group_number), 0) + 1)::int AS next FROM groups WHERE class_id = $1`, [classId])
  const name = v.name ?? groupName(next)
  const [row] = await query(
    `INSERT INTO groups (class_id, name, group_number, capacity, attendance_mode, group_leader_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [classId, name, next, v.capacity ?? defaultCapacity, v.attendanceMode, v.groupLeaderId ?? null],
  )
  const [group] = await query(`${GROUP_SELECT} WHERE id = $1`, [row.id])
  await logActivity({ userId: user.id, action: 'GROUP_CREATED', entityType: 'GROUP', entityId: row.id, description: `Created ${name}`, newValues: group })
  return json({ group }, 201)
}

// Routes under /api/groups/:id
export async function group(req: Request, user: SessionUser | null, groupId: number, rest: string[]) {
  const [before] = await query(`${GROUP_SELECT} WHERE id = $1`, [groupId])
  if (!before) return jsonError(404, 'Group not found')

  if (req.method === 'GET' && rest.length === 0) return json({ group: before })

  if (req.method === 'GET' && rest.length === 1 && rest[0] === 'export') return groupExport(user, groupId)

  if (req.method === 'GET' && rest.length === 1 && rest[0] === 'participants') {
    const members = await query(`${ENROLLMENT_SELECT} WHERE group_id = $1 ORDER BY full_name`, [groupId])
    return json({ participants: members })
  }

  const denied = requireAdmin(user)
  if (denied) return denied
  const actor = user as SessionUser

  if (req.method === 'PUT' && rest.length === 0) {
    const parsed = updateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    const v = parsed.data
    await query(
      `UPDATE groups SET name = $1, capacity = $2, group_leader_id = $3, updated_at = now() WHERE id = $4`,
      [v.name, v.capacity, v.groupLeaderId ?? null, groupId],
    )
    const [after] = await query(`${GROUP_SELECT} WHERE id = $1`, [groupId])
    await logActivity({ userId: actor.id, action: 'GROUP_UPDATED', entityType: 'GROUP', entityId: groupId, description: `Updated ${after.name}`, oldValues: before, newValues: after })
    return json({ group: after })
  }

  if (req.method === 'PATCH' && rest.length === 1 && rest[0] === 'archive') {
    const parsed = statusSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'status must be ACTIVE or ARCHIVED')
    const status = parsed.data.status
    if (status === 'ARCHIVED' && before.currentMembers > 0) {
      return jsonError(400, `Only empty groups can be archived. ${before.name} still has ${before.currentMembers} members.`)
    }
    await query(`UPDATE groups SET status = $1, updated_at = now() WHERE id = $2`, [status, groupId])
    const [after] = await query(`${GROUP_SELECT} WHERE id = $1`, [groupId])
    const action = status === 'ARCHIVED' ? 'GROUP_ARCHIVED' : 'GROUP_ACTIVATED'
    await logActivity({ userId: actor.id, action, entityType: 'GROUP', entityId: groupId, description: `${status === 'ARCHIVED' ? 'Archived' : 'Activated'} ${before.name}`, oldValues: { status: before.status }, newValues: { status } })
    return json({ group: after })
  }

  return jsonError(404, 'Not found')
}

// Plans who goes where. Reads only, so the same code serves the preview and the confirmed run.
async function buildPlan(q: Query, classId: string, defaultCapacity: number, v: z.infer<typeof generateSchema>): Promise<Plan> {
  const pending = (await q(
    `SELECT enrollment_id AS "enrollmentId", full_name AS "fullName", registration_number AS "registrationNumber"
     FROM enrollment_overview
     WHERE class_id = $1 AND attendance_mode = $2 AND group_id IS NULL
     ORDER BY enrollment_id`,
    [classId, v.attendanceMode],
  )) as Member[]

  const steps: Step[] = []
  let leftover: Member[] = []

  if (v.strategy === 'NEW') {
    const capacity = v.capacity ?? defaultCapacity
    const [{ next }] = await q(`SELECT (COALESCE(MAX(group_number), 0) + 1)::int AS next FROM groups WHERE class_id = $1`, [classId])
    for (let i = 0; i * capacity < pending.length; i++) {
      const number = next + i
      steps.push({ action: 'CREATE', groupId: null, groupNumber: number, name: groupName(number), capacity, members: pending.slice(i * capacity, (i + 1) * capacity) })
    }
  } else {
    const groups = await q(
      `SELECT id, name, group_number AS "groupNumber", capacity, current_members AS "currentMembers"
       FROM group_overview
       WHERE class_id = $1 AND attendance_mode = $2 AND status = 'ACTIVE'
       ORDER BY group_number`,
      [classId, v.attendanceMode],
    )
    let offset = 0
    for (const g of groups) {
      if (offset >= pending.length) break
      const space = Math.max(0, g.capacity - g.currentMembers)
      const members = pending.slice(offset, offset + space)
      offset += members.length
      if (members.length) steps.push({ action: 'ASSIGN', groupId: g.id, groupNumber: g.groupNumber, name: g.name, capacity: g.capacity, members })
    }
    leftover = pending.slice(offset)
  }

  const totalToAssign = steps.reduce((sum, s) => sum + s.members.length, 0)
  return { steps, totalToAssign, leftover: leftover.length }
}

async function generate(req: Request, user: SessionUser, classId: string, defaultCapacity: number) {
  const parsed = generateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
  const v = parsed.data

  if (!v.confirm) {
    const plan = await buildPlan(query, classId, defaultCapacity, v)
    return json({ plan, confirmed: false })
  }

  // Lock the class row so two allocations for the same class cannot interleave.
  const plan = await transaction(async (q) => {
    await q(`SELECT id FROM classes WHERE id = $1 FOR UPDATE`, [classId])
    const plan = await buildPlan(q, classId, defaultCapacity, v)
    for (const step of plan.steps) {
      let groupId = step.groupId
      if (step.action === 'CREATE') {
        const [row] = await q(
          `INSERT INTO groups (class_id, name, group_number, capacity, attendance_mode) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [classId, step.name, step.groupNumber, step.capacity, v.attendanceMode],
        )
        groupId = row.id
      }
      // One statement per member: the capacity trigger must see the members placed earlier in this loop.
      for (const m of step.members) {
        await q(`UPDATE class_enrollments SET group_id = $1, updated_at = now() WHERE id = $2`, [groupId, m.enrollmentId])
      }
    }
    return plan
  })

  const confirmed = plan.totalToAssign > 0
  if (confirmed) {
    const created = plan.steps.filter((s) => s.action === 'CREATE').length
    const description = `Allocated ${plan.totalToAssign} ${v.attendanceMode.toLowerCase()} participants (${created} new groups, ${plan.steps.length - created} existing groups filled)`
    await logActivity({ userId: user.id, action: 'GROUPS_ALLOCATED', entityType: 'GROUP', entityId: classId, description, newValues: { strategy: v.strategy, attendanceMode: v.attendanceMode, ...plan } })
  }
  return json({ plan, confirmed })
}
