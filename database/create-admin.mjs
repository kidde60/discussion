// Creates the first administrator. Refuses to run if an ADMIN already exists.
// Usage: node --env-file=.env database/create-admin.mjs
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME) {
  console.error('Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME in .env or the shell first')
  process.exit(1)
}
if (ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)
const [admin] = await sql`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`
if (admin) {
  console.error('An administrator already exists. Use the User Management page to add more.')
  process.exit(1)
}

const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
await sql`INSERT INTO users (full_name, email, password_hash, role) VALUES (${ADMIN_NAME}, ${ADMIN_EMAIL.trim().toLowerCase()}, ${passwordHash}, 'ADMIN')`
console.log(`Administrator created: ${ADMIN_EMAIL.trim().toLowerCase()}`)
