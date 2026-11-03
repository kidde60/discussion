import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../services/api'
import type { CurrentUser } from '../types/auth'

type AuthState = {
  user: CurrentUser | null
  isLoading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const me = useQuery({
    queryKey: ['me'],
    retry: false,
    queryFn: async () => {
      try {
        return (await api<{ user: CurrentUser }>('/auth/me')).user
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
  })

  const user = me.data ?? null

  const login = async (email: string, password: string) => {
    const { user } = await api<{ user: CurrentUser }>('/auth/login', { body: { email, password } })
    queryClient.setQueryData(['me'], user)
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' })
    queryClient.clear()
    queryClient.setQueryData(['me'], null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading: me.isLoading, isAdmin: user?.role === 'ADMIN', login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
