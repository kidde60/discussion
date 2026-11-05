import { authorizeViewer } from '../lib/auth.mts'
import { guard } from '../lib/db.mts'
import { summary } from '../lib/dashboard.mts'

async function handle(req: Request) {
  const { user, error } = await authorizeViewer(req)
  if (error) return error
  return summary(user)
}

export default async (req: Request) => guard(req, handle)

export const config = {
  path: '/api/dashboard/summary',
}
