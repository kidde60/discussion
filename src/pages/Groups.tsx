import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Input, Progress, Select, Space, Table, Tag, message } from 'antd'
import type { TableProps } from 'antd'
import { Plus, Search } from 'lucide-react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import GroupFormModal, { type GroupFormValues } from '../components/groups/GroupFormModal'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../services/api'
import type { ClassSummary } from '../types/classes'
import type { AttendanceMode, GroupSummary } from '../types/groups'
import AttendanceTag from '../components/common/AttendanceTag'

export default function Groups() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  const [classFilter, setClassFilter] = useState<string | undefined>()
  const [modeFilter, setModeFilter] = useState<string | undefined>()
  const [formOpen, setFormOpen] = useState(false)

  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (classFilter) query.set('classId', classFilter)
  if (modeFilter) query.set('attendanceMode', modeFilter)

  const groups = useQuery({
    queryKey: ['groups', query.toString()],
    queryFn: () => api<{ groups: GroupSummary[] }>(`/groups?${query}`).then((r) => r.groups),
  })

  const classes = useQuery({
    queryKey: ['classes', '', 'ALL'],
    queryFn: () => api<{ classes: ClassSummary[] }>('/classes').then((r) => r.classes),
  })
  const classOptions = (classes.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.classCode})` }))
  const activeClasses = (classes.data ?? []).filter((c) => c.status === 'ACTIVE')

  const create = useMutation({
    mutationFn: (v: GroupFormValues) =>
      api(`/classes/${v.classId}/groups`, { body: { name: v.name || undefined, capacity: v.capacity, attendanceMode: v.attendanceMode, groupLeaderId: v.groupLeaderId } }),
    onSuccess: () => {
      message.success('Group created')
      setFormOpen(false)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (err) => message.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  })

  const columns: TableProps<GroupSummary>['columns'] = [
    { title: 'Group', dataIndex: 'name', render: (v, g) => <Link to={`/groups/${g.id}`}>{v}</Link> },
    { title: 'Class', dataIndex: 'className' },
    { title: 'Type', dataIndex: 'attendanceMode', render: (m: AttendanceMode) => <AttendanceTag mode={m} /> },
    { title: 'Capacity', dataIndex: 'capacity', align: 'right' },
    {
      title: 'Members',
      key: 'members',
      render: (_, g) => (
        <Space size="small" className="w-40">
          <Progress percent={g.capacity ? Math.round((g.currentMembers / g.capacity) * 100) : 0} size="small" showInfo={false} />
          {g.currentMembers}
        </Space>
      ),
    },
    { title: 'Available', dataIndex: 'availableSpaces', align: 'right' },
    { title: 'Leader', dataIndex: 'groupLeaderName', render: (v: string | null) => v ?? <span className="text-slate-400">None</span> },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag> },
  ]

  return (
    <Card
      title="Groups"
      extra={isAdmin && (
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setFormOpen(true)} disabled={activeClasses.length === 0}>
          Create group
        </Button>
      )}
    >
      <Space wrap className="mb-4">
        <Input placeholder="Search by group or leader name" allowClear prefix={<Search size={14} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 280 }} />
        <Select allowClear placeholder="All classes" value={classFilter} onChange={setClassFilter} options={classOptions} style={{ width: 280 }} />
        <Select
          allowClear
          placeholder="All types"
          value={modeFilter}
          onChange={setModeFilter}
          options={[{ value: 'ONLINE', label: 'Online' }, { value: 'PHYSICAL', label: 'Physical' }]}
          style={{ width: 160 }}
        />
      </Space>
      {groups.isError && <Alert type="error" showIcon message="Could not load groups" description={groups.error.message} className="mb-4" />}
      <Table<GroupSummary>
        rowKey="id"
        columns={columns}
        dataSource={groups.data ?? []}
        loading={groups.isLoading}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        onRow={(g) => ({ onDoubleClick: () => navigate(`/groups/${g.id}`) })}
      />
      {isAdmin && (
        <GroupFormModal
          open={formOpen}
          editing={null}
          classId={null}
          classOptions={activeClasses.map((c) => ({ value: c.id, label: `${c.name} (${c.classCode})` }))}
          defaultCapacity={10}
          submitting={create.isPending}
          onCancel={() => setFormOpen(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}
    </Card>
  )
}
