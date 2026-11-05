import { authorizeViewer, authorize } from '../lib/auth.mts'
import { group, listGroups } from '../lib/groups.mts'
import { guard } from '../lib/db.mts'
import { jsonError } from '../lib/http.mts'

async function handle(req: Request) {
  const url = new URL(req.url)
  const segments = url.pathname.replace(/^\/api\/groups\/?/, '').split('/').filter(Boolean)

  const { user, error } = req.method === 'GET' ? await authorizeViewer(req) : await authorize(req, ['ADMIN'])
  if (error) return error

  if (segments.length === 0 && req.method === 'GET') return listGroups(url, user)
  const id = Number(segments[0])
  if (!Number.isInteger(id)) return jsonError(400, 'Invalid group id')
  return group(req, user, id, segments.slice(1))
}

export default async (req: Request) => guard(req, handle)

export const config = {
  path: ['/api/groups', '/api/groups/*'],
}
