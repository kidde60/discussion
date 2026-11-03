// Applies database/migrations/*.sql in order, tracking applied files in schema_migrations.
// Usage: node --env-file=.env database/migrate.mjs
import { Pool } from '@neondatabase/serverless'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)

  const { rows } = await client.query('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const text = await readFile(join(dir, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(text)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`applied ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`${file} failed: ${err.message}`)
    }
  }
  console.log('Database up to date')
} finally {
  client.release()
  await pool.end()
}
