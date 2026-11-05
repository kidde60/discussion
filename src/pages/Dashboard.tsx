import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Col, Row, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { Activity, BookOpen, UserCog, Users, UsersRound } from 'lucide-react'
import AttendanceTag from '../components/common/AttendanceTag'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import type { DashboardData } from '../types/dashboard'

const when = (v: string) => new Date(v).toLocaleString()

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const data = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard/summary'),
  })

  if (data.isLoading) return <Card><Skeleton active /></Card>
  if (data.isError || !data.data) return <Alert type="error" showIcon message="Could not load the dashboard" description={data.error?.message} />
  const d = data.data
  const s = d.stats

  const statCard = (title: string, value: number, extra?: React.ReactNode) => (
    <Col xs={12} md={8} xl={4}>
      <Card size="small"><Statistic title={title} value={value} />{extra}</Card>
    </Col>
  )

  return (
    <Space direction="vertical" size="large" className="w-full">
      <Row gutter={[16, 16]}>
        {statCard('Total classes', s.totalClasses, <Typography.Text type="secondary">{s.activeClasses} active · {s.archivedClasses} archived</Typography.Text>)}
        {statCard('Participants', s.totalParticipants)}
        {statCard('Groups', s.totalGroups)}
        {statCard('Online', s.onlineParticipants)}
        {s.physicalParticipants !== null && statCard('Physical', s.physicalParticipants)}
        {statCard('Unassigned', s.unassignedParticipants)}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            title="Recent classes"
            extra={<Link to="/classes">View all</Link>}
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={d.recentClasses}
              locale={{ emptyText: 'No classes yet' }}
              columns={[
                { title: 'Class', dataIndex: 'name', render: (v: string, c) => <Link to={`/classes/${c.id}`}>{v}</Link> },
                { title: 'Code', dataIndex: 'classCode' },
                { title: 'Participants', dataIndex: 'totalParticipants', align: 'right' },
                { title: 'Groups', dataIndex: 'totalGroups', align: 'right' },
                { title: 'Status', dataIndex: 'status', render: (st: string) => <Tag color={st === 'ACTIVE' ? 'green' : 'default'}>{st}</Tag> },
              ] as TableProps<DashboardData['recentClasses'][number]>['columns']}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Recently added participants" extra={<Link to="/participants">View all</Link>}>
            <Table
              size="small"
              rowKey={(p) => `${p.fullName}-${p.className}-${p.createdAt}`}
              pagination={false}
              dataSource={d.recentParticipants}
              locale={{ emptyText: 'No participants yet' }}
              columns={[
                { title: 'Name', dataIndex: 'fullName' },
                { title: 'Class', dataIndex: 'className' },
                { title: 'Type', dataIndex: 'attendanceMode', render: (m: 'ONLINE' | 'PHYSICAL') => <AttendanceTag mode={m} /> },
                { title: 'Group', dataIndex: 'groupName', render: (v: string | null) => v ?? <Typography.Text type="secondary">Unassigned</Typography.Text> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Group distribution" extra={<Link to="/groups">View groups</Link>}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={d.groupDistribution}
          locale={{ emptyText: 'No classes yet' }}
          columns={[
            { title: 'Class', dataIndex: 'name', render: (v: string, c) => <Link to={`/classes/${c.id}`}>{v}</Link> },
            { title: 'Groups', dataIndex: 'groups', align: 'right' },
            { title: 'Online groups', dataIndex: 'onlineGroups', align: 'right' },
            ...(s.physicalGroups !== null ? [{ title: 'Physical groups', dataIndex: 'physicalGroups', align: 'right' as const }] : []),
            { title: 'Members', dataIndex: 'members', align: 'right' },
            { title: 'Free spaces', key: 'free', align: 'right', render: (_: unknown, c: DashboardData['groupDistribution'][number]) => c.capacity - c.members },
          ]}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={isAdmin ? 16 : 24}>
          <Card title="Quick access">
            <Space wrap>
              <Link to="/classes"><Button icon={<BookOpen size={16} />}>Classes</Button></Link>
              <Link to="/groups"><Button icon={<UsersRound size={16} />}>Groups</Button></Link>
              <Link to="/participants"><Button icon={<Users size={16} />}>Participants</Button></Link>
              {isAdmin && <Link to="/users"><Button icon={<UserCog size={16} />}>User management</Button></Link>}
              {isAdmin && <Link to="/activity-logs"><Button icon={<Activity size={16} />}>Activity logs</Button></Link>}
            </Space>
          </Card>
        </Col>
        {isAdmin && d.recentActivity && (
          <Col xs={24} xl={8}>
            <Card title="Recent activity" extra={<Link to="/activity-logs">All</Link>}>
              <Table
                size="small"
                rowKey={(a) => `${a.createdAt}-${a.action}-${a.description}`}
                pagination={false}
                showHeader={false}
                dataSource={d.recentActivity}
                locale={{ emptyText: 'No activity yet' }}
                columns={[
                  {
                    title: 'Activity',
                    key: 'a',
                    render: (_: unknown, a: NonNullable<DashboardData['recentActivity']>[number]) => (
                      <>
                        <div>{a.description}</div>
                        <Typography.Text type="secondary" className="text-xs">{a.userName ?? 'System'} · {when(a.createdAt)}</Typography.Text>
                      </>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        )}
      </Row>
    </Space>
  )
}
