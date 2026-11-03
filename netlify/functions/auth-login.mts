import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { sql } from '../lib/db.mts'
import { clearFailedLogins, createSession, isLoginRateLimited, recordFailedLogin, verifyPassword } from '../lib/auth.mts'
import { json, jsonError } from '../lib/http.mts'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
})

// Compared against when the email is unknown so response timing doesn't reveal which accounts exist.
let dummyHash: string | undefined

export default async (req: Request, context: { ip: string }) => {
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'Enter a valid email and password')

  const { email, password } = parsed.data
  const emailKey = `email:${email}`
  const ipKey = `ip:${context.ip}`

  if (await isLoginRateLimited(emailKey, ipKey)) {
    return jsonError(429, 'Too many failed attempts. Try again in 15 minutes.')
  }

  const [account] = await sql`
    SELECT id, full_name AS "fullName", email, role, is_active AS "isActive", password_hash AS "passwordHash"
    FROM users WHERE email = ${email}`

  dummyHash ??= await bcrypt.hash('not-a-real-password', 12)
  const passwordOk = await verifyPassword(password, account?.passwordHash ?? dummyHash)

  if (!account || !account.isActive || !passwordOk) {
    await recordFailedLogin(emailKey, ipKey)
    return jsonError(401, 'Invalid email or password')
  }

  await clearFailedLogins(emailKey)
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${account.id}`
  const cookie = await createSession(req, account.id)

  return json(
    { user: { id: account.id, fullName: account.fullName, email: account.email, role: account.role } },
    200,
    { 'Set-Cookie': cookie },
  )
}

export const config = {
  path: '/api/auth/login',
}
