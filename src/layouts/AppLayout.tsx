import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Drawer,
  Grid,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
  theme,
} from "antd";
import type { MenuProps } from "antd";
import {
  Activity,
  BookOpen,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const { Header, Sider, Content } = Layout;

const YEAR = new Date().getFullYear();

const navItems = [
  { key: "/", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
  { key: "/classes", icon: <BookOpen size={18} />, label: "Classes" },
  { key: "/groups", icon: <UsersRound size={18} />, label: "Groups" },
  { key: "/participants", icon: <Users size={18} />, label: "Participants" },
  {
    key: "/users",
    icon: <UserCog size={18} />,
    label: "User Management",
    adminOnly: true,
  },
  {
    key: "/activity-logs",
    icon: <Activity size={18} />,
    label: "Activity Logs",
    adminOnly: true,
  },
];

function selectedKey(pathname: string) {
  const match = navItems
    .map((i) => i.key)
    .filter((k) => k !== "/")
    .find((k) => pathname.startsWith(k));
  return match ?? "/";
}

export default function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { token } = theme.useToken();

  const menuItems: MenuProps["items"] = navItems
    .filter((i) => !i.adminOnly || isAdmin)
    .map(({ adminOnly: _adminOnly, ...item }) => item);

  const onSelect: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey(pathname)]}
      items={menuItems}
      onClick={onSelect}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {!isMobile && (
        <Sider
          theme="light"
          width={220}
          style={{
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            position: "sticky",
            top: 0,
            height: "100vh",
            overflow: "auto",
          }}
        >
          <div
            className="px-6 py-5 text-base font-semibold"
            style={{ color: token.colorPrimary }}
          >
            Discussion Groups
          </div>
          {menu}
        </Sider>
      )}
      {isMobile && (
        <Drawer
          title="Discussion Groups"
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={240}
        >
          {menu}
        </Drawer>
      )}
      <Layout>
        <Header
          className="flex items-center gap-2 px-3 sm:gap-3 sm:px-4"
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: "sticky",
            top: 0,
            zIndex: 10,
            height: isMobile ? 56 : 64,
          }}
        >
          {isMobile && (
            <Button
              type="text"
              icon={<MenuIcon size={20} />}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">VDiscussion</span>
          {user ? (
            <Space size={4} wrap={false} className="shrink-0">
              <Typography.Text className="hidden md:inline">
                {user.fullName}
              </Typography.Text>
              <Tag
                className="hidden sm:inline-block"
                color={isAdmin ? "blue" : "default"}
              >
                {user.role}
              </Tag>
              <Button
                type="text"
                icon={<LogOut size={16} />}
                onClick={handleLogout}
                aria-label="Sign out"
              >
                {!isMobile && "Sign out"}
              </Button>
            </Space>
          ) : (
            <Button
              type="primary"
              icon={<LogIn size={16} />}
              onClick={() => navigate("/login")}
              className="shrink-0"
            >
              {isMobile ? "Sign in" : "Admin sign in"}
            </Button>
          )}
        </Header>
        <Content className="p-3 sm:p-4 md:p-6">
          <Outlet />
        </Content>
        <Layout.Footer
          style={{
            background: token.colorBgContainer,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            textAlign: "center",
          }}
        >
          <Typography.Text type="secondary">
            Discussion Group Manager · {YEAR}
          </Typography.Text>
        </Layout.Footer>
      </Layout>
    </Layout>
  );
}
