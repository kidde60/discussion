import { sql } from '../lib/db.mts'

export default async () => {
  try {
    const [row] = await sql`SELECT now() AS server_time`
    return Response.json({ ok: true, database: 'connected', serverTime: row.server_time })
  } catch (err) {
    console.error('health check failed', err)
    return Response.json({ ok: false, database: 'unreachable' }, { status: 503 })
  }
}

export const config = {
  path: '/api/health',
}
