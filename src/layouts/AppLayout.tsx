import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button, Drawer, Grid, Layout, Menu, Space, Tag, Typography, theme } from 'antd'
import type { MenuProps } from 'antd'
import { Activity, BookOpen, LayoutDashboard, LogIn, LogOut, Menu as MenuIcon, UserCog, Users, UsersRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const { Header, Sider, Content } = Layout

const navItems = [
  { key: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { key: '/classes', icon: <BookOpen size={18} />, label: 'Classes' },
  { key: '/groups', icon: <UsersRound size={18} />, label: 'Groups' },
  { key: '/participants', icon: <Users size={18} />, label: 'Participants' },
  { key: '/users', icon: <UserCog size={18} />, label: 'User Management', adminOnly: true },
  { key: '/activity-logs', icon: <Activity size={18} />, label: 'Activity Logs', adminOnly: true },
]

function selectedKey(pathname: string) {
  const match = navItems.map((i) => i.key).filter((k) => k !== '/').find((k) => pathname.startsWith(k))
  return match ?? '/'
}

export default function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, isAdmin, logout } = useAuth()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { token } = theme.useToken()

  const menuItems: MenuProps['items'] = navItems
    .filter((i) => !i.adminOnly || isAdmin)
    .map(({ adminOnly: _adminOnly, ...item }) => item)

  const onSelect: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
    setDrawerOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const menu = <Menu mode="inline" selectedKeys={[selectedKey(pathname)]} items={menuItems} onClick={onSelect} />

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider theme="light" width={220} style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
          <div className="px-6 py-5 text-base font-semibold" style={{ color: token.colorPrimary }}>
            Discussion Groups
          </div>
          {menu}
        </Sider>
      )}
      {isMobile && (
        <Drawer title="Discussion Groups" placement="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} size={240}>
          {menu}
        </Drawer>
      )}
      <Layout>
        <Header className="flex items-center gap-3 px-4" style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          {isMobile && <Button type="text" icon={<MenuIcon size={20} />} onClick={() => setDrawerOpen(true)} aria-label="Open menu" />}
          <span className="font-medium">Discussion Group Manager</span>
          <div className="flex-1" />
          {user ? (
            <Space size="small" wrap>
              <Typography.Text className="hidden sm:inline">{user.fullName}</Typography.Text>
              <Tag color={isAdmin ? 'blue' : 'default'}>{user.role}</Tag>
              <Button type="text" icon={<LogOut size={16} />} onClick={handleLogout}>Sign out</Button>
            </Space>
          ) : (
            <Button type="primary" icon={<LogIn size={16} />} onClick={() => navigate('/login')}>Admin sign in</Button>
          )}
        </Header>
        <Content className="p-4 md:p-6">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
