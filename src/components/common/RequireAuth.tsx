import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Result, Spin } from 'antd'
import { useAuth } from '../../context/AuthContext'
import type { Role } from '../../types/auth'

type Props = { roles?: Role[] }

export default function RequireAuth({ roles }: Props) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Spin size="large" /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Result status="403" title="Access denied" subTitle="You do not have permission to view this page." />

  return <Outlet />
}
