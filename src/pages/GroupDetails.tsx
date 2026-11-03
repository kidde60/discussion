import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Descriptions, Input, Popconfirm, Select, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { ArrowLeft, Archive, ArchiveRestore, Pencil, UserMinus, UserPlus } from 'lucide-react'
import GroupFormModal, { type GroupFormValues } from '../components/groups/GroupFormModal'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../services/api'
import type { AttendanceMode, GroupSummary } from '../types/groups'
import AttendanceTag from '../components/common/AttendanceTag'
import type { Enrollment } from '../types/participants'

export default function GroupDetails() {
  const { groupId } = useParams()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [assignId, setAssignId] = useState<string | undefined>()

  const group = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api<{ group: GroupSummary }>(`/groups/${groupId}`).then((r) => r.group),
  })
  const g = group.data

  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => api<{ participants: Enrollment[] }>(`/groups/${groupId}/participants`).then((r) => r.participants),
  })

  const unassigned = useQuery({
    queryKey: ['unassigned', g?.classId],
    enabled: isAdmin && Boolean(g),
    queryFn: () => api<{ participants: Enrollment[] }>(`/participants?classId=${g!.classId}&groupId=unassigned`).then((r) => r.participants),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['group', groupId] })
    queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })
    queryClient.invalidateQueries({ queryKey: ['unassigned'] })
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  }
  const fail = (err: unknown) => message.error(err instanceof ApiError ? err.message : 'Something went wrong')

  const save = useMutation({
    mutationFn: (v: GroupFormValues) => api(`/groups/${groupId}`, { method: 'PUT', body: { name: v.name, capacity: v.capacity, groupLeaderId: v.groupLeaderId } }),
    onSuccess: () => {
      message.success('Group updated')
      setEditOpen(false)
      refresh()
    },
    onError: fail,
  })

  const setArchived = useMutation({
    mutationFn: (status: 'ACTIVE' | 'ARCHIVED') => api(`/groups/${groupId}/archive`, { method: 'PATCH', body: { status } }),
    onSuccess: refresh,
    onError: fail,
  })

  const assign = useMutation({
    mutationFn: (enrollmentId: string) => api(`/enrollments/${enrollmentId}/group`, { method: 'PATCH', body: { groupId: Number(groupId) } }),
    onSuccess: () => {
      message.success('Participant assigned')
      setAssignId(undefined)
      refresh()
    },
    onError: fail,
  })

  const unassign = useMutation({
    mutationFn: (enrollmentId: string) => api(`/enrollments/${enrollmentId}/group`, { method: 'PATCH', body: { groupId: null } }),
    onSuccess: () => {
      message.success('Participant removed from the group')
      refresh()
    },
    onError: fail,
  })

  if (group.isLoading) return <Card><Skeleton active /></Card>
  if (group.isError || !g) return <Alert type="error" showIcon message="Could not load this group" description={group.error?.message} />

  const filtered = (members.data ?? []).filter((m) => {
    const q = search.trim().toLowerCase()
    return !q || m.fullName.toLowerCase().includes(q) || m.registrationNumber.toLowerCase().includes(q)
  })

  const columns: TableProps<Enrollment>['columns'] = [
    { title: 'Full name', dataIndex: 'fullName' },
    { title: 'Registration number', dataIndex: 'registrationNumber' },
    { title: 'Phone', dataIndex: 'phoneNumber', render: (v: string | null) => (v ?? <Typography.Text type="secondary">Hidden</Typography.Text>) },
    { title: 'Attendance', dataIndex: 'attendanceMode', render: (m: AttendanceMode) => <AttendanceTag mode={m} /> },
    ...(isAdmin
      ? [{
          title: '',
          key: 'remove',
          render: (_: unknown, m: Enrollment) => (
            <Popconfirm
              title={`Remove ${m.fullName} from ${g.name}?`}
              description="They will become unassigned and can be added to another group later."
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={() => unassign.mutate(m.enrollmentId)}
            >
              <Button danger size="small" icon={<UserMinus size={14} />}>Remove</Button>
            </Popconfirm>
          ),
        }]
      : []),
  ]

  return (
    <Space direction="vertical" size="large" className="w-full">
      <Link to="/groups"><Button type="link" icon={<ArrowLeft size={16} />} className="!p-0">Back to groups</Button></Link>

      <Card
        title={<Space>{g.name}<Tag color={g.status === 'ACTIVE' ? 'green' : 'default'}>{g.status}</Tag></Space>}
        extra={isAdmin && (
          <Space wrap>
            <Button icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>Edit</Button>
            {g.status === 'ACTIVE' ? (
              <Button icon={<Archive size={14} />} loading={setArchived.isPending} onClick={() => setArchived.mutate('ARCHIVED')}>Archive</Button>
            ) : (
              <Button icon={<ArchiveRestore size={14} />} loading={setArchived.isPending} onClick={() => setArchived.mutate('ACTIVE')}>Activate</Button>
            )}
          </Space>
        )}
      >
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Class"><Link to={`/classes/${g.classId}`}>{g.className}</Link></Descriptions.Item>
          <Descriptions.Item label="Type"><AttendanceTag mode={g.attendanceMode} /></Descriptions.Item>
          <Descriptions.Item label="Capacity">{g.capacity}</Descriptions.Item>
          <Descriptions.Item label="Members">{g.currentMembers} ({g.availableSpaces} spaces left)</Descriptions.Item>
          <Descriptions.Item label="Group leader">{g.groupLeaderName ?? 'Not assigned'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="Members"
        extra={<Input.Search placeholder="Search name or registration" allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />}
      >
        {isAdmin && (
          <Space wrap className="mb-4">
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Add an unassigned participant"
              value={assignId}
              onChange={setAssignId}
              loading={unassigned.isLoading}
              style={{ width: 360 }}
              options={(unassigned.data ?? [])
                .filter((p) => p.attendanceMode === g.attendanceMode)
                .map((p) => ({ value: p.enrollmentId, label: `${p.fullName} (${p.registrationNumber}) · ${p.attendanceMode === 'ONLINE' ? 'Online' : 'Physical'}` }))}
            />
            <Button icon={<UserPlus size={14} />} disabled={!assignId} loading={assign.isPending} onClick={() => assignId && assign.mutate(assignId)}>
              Assign
            </Button>
          </Space>
        )}
        <Table<Enrollment>
          rowKey="enrollmentId"
          columns={columns}
          dataSource={filtered}
          loading={members.isLoading}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          scroll={{ x: 700 }}
        />
      </Card>

      {isAdmin && (
        <GroupFormModal
          open={editOpen}
          editing={g}
          classId={g.classId}
          defaultCapacity={g.capacity}
          submitting={save.isPending}
          onCancel={() => setEditOpen(false)}
          onSubmit={(v) => save.mutate(v)}
        />
      )}
    </Space>
  )
}
