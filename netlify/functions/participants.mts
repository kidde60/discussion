import { authorizeViewer, authorize } from '../lib/auth.mts'
import { guard } from '../lib/db.mts'
import { participants, enrollments } from '../lib/participants.mts'
import { jsonError } from '../lib/http.mts'

async function handle(req: Request) {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\//, '')
  const isEnrollment = path.startsWith('enrollments/')
  const segments = path.replace(/^(participants|enrollments)\/?/, '').split('/').filter(Boolean)

  const { user, error } = req.method === 'GET' ? await authorizeViewer(req) : await authorize(req, ['ADMIN'])
  if (error) return error

  if (isEnrollment) {
    const id = Number(segments[0])
    if (!Number.isInteger(id)) return jsonError(400, 'Invalid enrollment id')
    return enrollments(req, user, id, segments.slice(1))
  }
  return participants(req, user, segments, url)
}

export default async (req: Request) => guard(req, handle)

export const config = {
  path: ['/api/participants', '/api/participants/*', '/api/enrollments/*'],
}
