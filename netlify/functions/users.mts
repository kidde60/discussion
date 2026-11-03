import { z } from 'zod'
import { sql } from '../lib/db.mts'
import { authorize, hashPassword } from '../lib/auth.mts'
import { json, jsonError } from '../lib/http.mts'

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(['ADMIN', 'USER']),
})

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['ADMIN', 'USER']),
})

const statusSchema = z.object({ isActive: z.boolean() })

export default async (req: Request) => {
  const { user, error } = await authorize(req, ['ADMIN'])
  if (error) return error

  const segments = new URL(req.url).pathname.replace(/^\/api\/users\/?/, '').split('/').filter(Boolean)
  const id = Number(segments[0])
  const isStatusRoute = segments[1] === 'status'

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const users = await sql`SELECT id, full_name AS "fullName", email, role, is_active AS "isActive", last_login_at AS "lastLoginAt", created_at AS "createdAt" FROM users ORDER BY created_at DESC`
      return json({ users })
    }
    if (req.method === 'POST') {
      const parsed = createSchema.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
      const { fullName, email, password, role } = parsed.data
      const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`
      if (existing) return jsonError(409, 'An account with this email already exists')
      const passwordHash = await hashPassword(password)
      const [created] = await sql`
        INSERT INTO users (full_name, email, password_hash, role)
        VALUES (${fullName}, ${email}, ${passwordHash}, ${role})
        RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive", last_login_at AS "lastLoginAt", created_at AS "createdAt"`
      return json({ user: created }, 201)
    }
    return jsonError(405, 'Method not allowed')
  }

  if (!Number.isInteger(id)) return jsonError(400, 'Invalid user id')

  if (segments.length === 1 && req.method === 'PUT') {
    const parsed = updateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    if (id === Number(user.id) && parsed.data.role !== 'ADMIN') return jsonError(400, 'You cannot remove your own admin role')
    const [updated] = await sql`
      UPDATE users SET full_name = ${parsed.data.fullName}, role = ${parsed.data.role}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive", last_login_at AS "lastLoginAt", created_at AS "createdAt"`
    return updated ? json({ user: updated }) : jsonError(404, 'User not found')
  }

  if (isStatusRoute && segments.length === 2 && req.method === 'PATCH') {
    const parsed = statusSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'isActive must be true or false')
    if (id === Number(user.id) && !parsed.data.isActive) return jsonError(400, 'You cannot deactivate your own account')
    const [updated] = await sql`
      UPDATE users SET is_active = ${parsed.data.isActive}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive", last_login_at AS "lastLoginAt", created_at AS "createdAt"`
    if (!updated) return jsonError(404, 'User not found')
    if (!parsed.data.isActive) await sql`DELETE FROM sessions WHERE user_id = ${id}`
    return json({ user: updated })
  }

  return jsonError(405, 'Method not allowed')
}

export const config = {
  path: ['/api/users', '/api/users/*'],
}
