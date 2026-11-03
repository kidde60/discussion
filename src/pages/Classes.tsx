import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { TableProps } from 'antd'
import { Archive, ArchiveRestore, Eye, Pencil, Plus, Search } from 'lucide-react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import ClassFormModal, { type ClassFormValues } from '../components/classes/ClassFormModal'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../services/api'
import type { ClassStatus, ClassSummary } from '../types/classes'

export default function Classes() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  const [status, setStatus] = useState<ClassStatus | 'ALL'>('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ClassSummary | null>(null)

  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (status !== 'ALL') query.set('status', status)

  const classes = useQuery({
    queryKey: ['classes', search, status],
    queryFn: () => api<{ classes: ClassSummary[] }>(`/classes?${query}`).then((r) => r.classes),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['classes'] })
  const fail = (err: unknown) => message.error(err instanceof ApiError ? err.message : 'Something went wrong')

  const save = useMutation({
    mutationFn: (values: ClassFormValues) => {
      const body = { ...values, endDate: values.endDate || null }
      return editing ? api(`/classes/${editing.id}`, { method: 'PUT', body }) : api('/classes', { body })
    },
    onSuccess: () => {
      message.success(editing ? 'Class updated' : 'Class created')
      setModalOpen(false)
      refresh()
    },
    onError: fail,
  })

  const setArchived = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ClassStatus }) =>
      api(`/classes/${id}/archive`, { method: 'PATCH', body: { status } }),
    onSuccess: (_, v) => {
      message.success(v.status === 'ARCHIVED' ? 'Class archived' : 'Class activated')
      refresh()
    },
    onError: fail,
  })

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (c: ClassSummary) => {
    setEditing(c)
    setModalOpen(true)
  }

  const columns: TableProps<ClassSummary>['columns'] = [
    { title: 'Class name', dataIndex: 'name', render: (v, c) => <Button type="link" className="!p-0" onClick={() => navigate(`/classes/${c.id}`)}>{v}</Button> },
    { title: 'Class code', dataIndex: 'classCode' },
    { title: 'Participants', dataIndex: 'totalParticipants', align: 'right' },
    { title: 'Groups', dataIndex: 'totalGroups', align: 'right' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: ClassStatus) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag>,
    },
    { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, c) => (
        <Space size="small" wrap>
          <Button size="small" icon={<Eye size={14} />} onClick={() => navigate(`/classes/${c.id}`)}>View</Button>
          {isAdmin && (
            <>
              <Button size="small" icon={<Pencil size={14} />} onClick={() => openEdit(c)}>Edit</Button>
              {c.status === 'ACTIVE' ? (
                <Popconfirm title="Archive this class?" description="Archived classes stay visible but are marked as archived." okText="Archive" onConfirm={() => setArchived.mutate({ id: c.id, status: 'ARCHIVED' })}>
                  <Button size="small" icon={<Archive size={14} />}>Archive</Button>
                </Popconfirm>
              ) : (
                <Button size="small" icon={<ArchiveRestore size={14} />} loading={setArchived.isPending} onClick={() => setArchived.mutate({ id: c.id, status: 'ACTIVE' })}>Activate</Button>
              )}
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="Classes"
      extra={isAdmin && <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>Create class</Button>}
    >
      <Space wrap className="mb-4">
        <Input placeholder="Search by name or code" allowClear prefix={<Search size={14} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 280 }} />
        <Select
          value={status}
          onChange={setStatus}
          style={{ width: 160 }}
          options={[
            { value: 'ALL', label: 'All statuses' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'ARCHIVED', label: 'Archived' },
          ]}
        />
      </Space>
      {classes.isError && <Alert type="error" showIcon message="Could not load classes" description={classes.error.message} className="mb-4" />}
      <Table<ClassSummary>
        rowKey="id"
        columns={columns}
        dataSource={classes.data ?? []}
        loading={classes.isLoading}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
      />
      {isAdmin && (
        <ClassFormModal
          open={modalOpen}
          editing={editing}
          submitting={save.isPending}
          onCancel={() => setModalOpen(false)}
          onSubmit={(values) => save.mutate(values)}
        />
      )}
    </Card>
  )
}
