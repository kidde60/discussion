import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { sql } from './db.mts'
import { jsonError } from './http.mts'

export type Role = 'ADMIN' | 'USER'

export type SessionUser = {
  id: string
  fullName: string
  email: string
  role: Role
}

const SESSION_COOKIE = 'dgm_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const LOGIN_WINDOW = '15 minutes'
const MAX_FAILED_LOGINS = 5

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export const hashPassword = (password: string) => bcrypt.hash(password, 12)
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get('cookie')?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
  return cookie?.slice(name.length + 1)
}

export async function createSession(req: Request, userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await sql`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${sha256(token)}, ${expiresAt})`
  return sessionCookie(req, token, SESSION_TTL_MS / 1000)
}

export async function destroySession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE)
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`
  return sessionCookie(req, '', 0)
}

function sessionCookie(req: Request, value: string, maxAgeSeconds: number) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}

// Validates the session cookie, slides its expiry and returns the active user (or null).
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null
  const [user] = await sql`
    UPDATE sessions s
    SET expires_at = ${new Date(Date.now() + SESSION_TTL_MS)}
    FROM users u
    WHERE s.user_id = u.id
      AND s.token_hash = ${sha256(token)}
      AND s.expires_at > now()
      AND u.is_active
    RETURNING u.id, u.full_name AS "fullName", u.email, u.role`
  return (user as SessionUser) ?? null
}

// Use at the top of every protected handler. Returns either the user or an error Response.
export async function authorize(req: Request, roles?: Role[]) {
  const user = await getSessionUser(req)
  if (!user) return { user: null, error: jsonError(401, 'Not signed in') } as const
  if (roles && !roles.includes(user.role)) return { user: null, error: jsonError(403, 'Forbidden') } as const
  return { user, error: null } as const
}

export const PUBLIC_VIEWING = process.env.PUBLIC_VIEWING !== 'false'

// For read-only endpoints. Anonymous visitors get user=null when public viewing is enabled.
export async function authorizeViewer(req: Request) {
  if (!PUBLIC_VIEWING) return authorize(req)
  return { user: await getSessionUser(req), error: null } as const
}

export async function isLoginRateLimited(emailKey: string, ipKey: string) {
  const rows = await sql`
    SELECT attempt_key, count(*)::int AS n FROM login_attempts
    WHERE attempt_key IN (${emailKey}, ${ipKey}) AND attempted_at > now() - ${LOGIN_WINDOW}::interval
    GROUP BY attempt_key`
  return rows.some((r) => r.n >= MAX_FAILED_LOGINS)
}

export async function recordFailedLogin(emailKey: string, ipKey: string) {
  await sql`INSERT INTO login_attempts (attempt_key) VALUES (${emailKey})`
  await sql`INSERT INTO login_attempts (attempt_key) VALUES (${ipKey})`
}

export async function clearFailedLogins(emailKey: string) {
  await sql`DELETE FROM login_attempts WHERE attempt_key = ${emailKey}`
}
