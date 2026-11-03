import { destroySession } from '../lib/auth.mts'
import { json, jsonError } from '../lib/http.mts'

export default async (req: Request) => {
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')
  return json({ ok: true }, 200, { 'Set-Cookie': await destroySession(req) })
}

export const config = {
  path: '/api/auth/logout',
}
