import { authorize } from '../lib/auth.mts'
import { json } from '../lib/http.mts'

export default async (req: Request) => {
  const { user, error } = await authorize(req)
  if (error) return error
  return json({ user })
}

export const config = {
  path: '/api/auth/me',
}
