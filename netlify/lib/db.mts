import { neon, Pool } from '@neondatabase/serverless'
import { jsonError } from './http.mts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

export const sql = neon(url)

export type Row = Record<string, any>
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>

export const query: Query = (text, params) => sql.query(text, params) as Promise<Row[]>

// Runs fn inside one transaction. Use for multi-step writes that must succeed or fail together.
export async function transaction<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(async (text, params) => (await client.query(text, params)).rows)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

// Maps database rule violations (triggers and constraints) to 4xx responses. Returns null for anything else.
function dbErrorResponse(err: unknown): Response | null {
  const code = (err as { code?: string }).code
  const message = (err as Error).message
  if (code === '23514') return jsonError(400, message)
  if (code === '23503') return jsonError(400, 'That record does not belong to this class')
  if (code === '23505') return jsonError(409, 'A record with this value already exists')
  return null
}

// Runs a handler so database rule violations become readable responses instead of 500s.
export async function guard(req: Request, handler: (req: Request) => Promise<Response>) {
  try {
    return await handler(req)
  } catch (err) {
    const response = dbErrorResponse(err)
    if (response) return response
    throw err
  }
}
