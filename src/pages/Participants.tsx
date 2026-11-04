import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import ParticipantFormModal, { type ParticipantFormValues } from '../components/participants/ParticipantFormModal'
import ImportRosterModal from '../components/participants/ImportRosterModal'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../services/api'
import type { ClassSummary } from '../types/classes'
import type { Enrollment } from '../types/participants'
import type { AttendanceMode } from '../types/groups'
import AttendanceTag from '../components/common/AttendanceTag'

export default function Participants() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Enrollment | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const classId = params.get('classId') ?? undefined
  const mode = params.get('attendanceMode') ?? undefined
  const group = params.get('groupId') ?? undefined
  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (classId) query.set('classId', classId)
  if (mode) query.set('attendanceMode', mode)
  if (group) query.set('groupId', group)

  const participants = useQuery({
    queryKey: ['participants', query.toString()],
    queryFn: () => api<{ participants: Enrollment[] }>(`/participants?${query}`).then((r) => r.participants),
  })

  const classes = useQuery({
    queryKey: ['classes', '', 'ALL'],
    queryFn: () => api<{ classes: ClassSummary[] }>('/classes').then((r) => r.classes),
  })
  const classOptions = (classes.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.classCode})` }))

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['participants'] })
  const fail = (err: unknown) => message.error(err instanceof ApiError ? err.message : 'Something went wrong')

  const save = useMutation({
    mutationFn: async (values: ParticipantFormValues) => {
      if (!editing) return api(`/classes/${values.classId}/participants`, { body: values })
      await api(`/participants/${editing.participantId}`, { method: 'PUT', body: { fullName: values.fullName, phoneNumber: values.phoneNumber, registrationNumber: values.registrationNumber } })
      if (values.attendanceMode !== editing.attendanceMode) {
        await api(`/enrollments/${editing.enrollmentId}`, { method: 'PUT', body: { attendanceMode: values.attendanceMode } })
      }
    },
    onSuccess: () => {
      message.success(editing ? 'Participant updated' : 'Participant added')
      setFormOpen(false)
      refresh()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (p: Enrollment) => api<{ personDeleted: boolean }>(`/enrollments/${p.enrollmentId}`, { method: 'DELETE' }),
    onSuccess: (res, p) => {
      message.success(res.personDeleted ? `${p.fullName} deleted` : `${p.fullName} removed from ${p.className}`)
      refresh()
    },
    onError: fail,
  })

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (p: Enrollment) => {
    setEditing(p)
    setFormOpen(true)
  }

  const columns: TableProps<Enrollment>['columns'] = [
    { title: 'Full name', dataIndex: 'fullName' },
    { title: 'Registration number', dataIndex: 'registrationNumber' },
    { title: 'Phone', dataIndex: 'phoneNumber', render: (v: string | null) => (v ?? <Typography.Text type="secondary">Hidden</Typography.Text>) },
    { title: 'Class', dataIndex: 'className' },
    { title: 'Attendance', dataIndex: 'attendanceMode', render: (m: AttendanceMode) => <AttendanceTag mode={m} /> },
    {
      title: 'Group',
      dataIndex: 'groupName',
      render: (v: string | null, p) => (v && p.groupId ? <Link to={`/groups/${p.groupId}`}>{v}</Link> : <Tag color="orange">Unassigned</Tag>),
    },
    ...(isAdmin
      ? [{
          title: '',
          key: 'actions',
          render: (_: unknown, p: Enrollment) => (
            <Space size="small">
              <Button size="small" icon={<Pencil size={14} />} onClick={() => openEdit(p)}>Edit</Button>
              <Popconfirm
                title={`Delete ${p.fullName} from ${p.className}?`}
                description="They are removed from their group too. Their person record is deleted if they are not in any other class."
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => remove.mutate(p)}
              >
                <Button size="small" danger icon={<Trash2 size={14} />}>Delete</Button>
              </Popconfirm>
            </Space>
          ),
        }]
      : []),
  ]

  return (
    <Card
      title="Participants"
      extra={isAdmin && (
        <Space wrap>
          <Button icon={<FileUp size={16} />} onClick={() => setImportOpen(true)}>Import spreadsheet</Button>
          <Button type="primary" icon={<Plus size={16} />} onClick={openAdd}>Add participant</Button>
        </Space>
      )}
    >
      <Space wrap className="mb-4">
        <Input placeholder="Search by name" allowClear prefix={<Search size={14} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 260 }} />
        <Select
          allowClear
          placeholder="All classes"
          value={classId}
          onChange={(v) => setFilter('classId', v)}
          options={classOptions}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          placeholder="All attendance"
          value={mode}
          onChange={(v) => setFilter('attendanceMode', v)}
          options={[{ value: 'ONLINE', label: 'Online' }, { value: 'PHYSICAL', label: 'Physical' }]}
          style={{ width: 170 }}
        />
        <Select
          allowClear
          placeholder="All groups"
          value={group}
          onChange={(v) => setFilter('groupId', v)}
          options={[{ value: 'unassigned', label: 'Unassigned only' }]}
          style={{ width: 170 }}
        />
      </Space>

      <Table<Enrollment>
        rowKey="enrollmentId"
        columns={columns}
        dataSource={participants.data ?? []}
        loading={participants.isLoading}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
      />

      {isAdmin && (
        <>
          <ParticipantFormModal
            open={formOpen}
            editing={editing}
            classOptions={classOptions}
            defaultClassId={classId ?? null}
            submitting={save.isPending}
            onCancel={() => setFormOpen(false)}
            onSubmit={(values) => save.mutate(values)}
          />
          <Modal title="Import participants" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={860} destroyOnHidden>
            <ImportRosterModal
              classOptions={classOptions}
              defaultClassId={classId ?? null}
              onClose={() => setImportOpen(false)}
              onDone={refresh}
            />
          </Modal>
        </>
      )}
    </Card>
  )
}
