export type Role = 'ADMIN' | 'USER'

// Postgres BIGINT ids are serialized as strings
export type CurrentUser = {
  id: string
  fullName: string
  email: string
  role: Role
}

export type ManagedUser = CurrentUser & {
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}
