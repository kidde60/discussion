import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Switch, Table, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { Plus, Pencil } from 'lucide-react'
import UserFormModal from '../components/users/UserFormModal'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../services/api'
import type { ManagedUser } from '../types/auth'

type FormValues = { fullName: string; email: string; password: string; role: 'ADMIN' | 'USER' }

export default function Users() {
  const { user: me } = useAuth()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: ManagedUser[] }>('/users').then((r) => r.users),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const fail = (err: unknown) => message.error(err instanceof ApiError ? err.message : 'Something went wrong')

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      if (editing) {
        return api(`/users/${editing.id}`, { method: 'PUT', body: { fullName: values.fullName, role: values.role } })
      }
      return api('/users', { body: values })
    },
    onSuccess: () => {
      message.success(editing ? 'User updated' : 'User created')
      setModalOpen(false)
      refresh()
    },
    onError: fail,
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/users/${id}/status`, { method: 'PATCH', body: { isActive } }),
    onSuccess: refresh,
    onError: fail,
  })

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (u: ManagedUser) => {
    setEditing(u)
    setModalOpen(true)
  }

  const columns: TableProps<ManagedUser>['columns'] = [
    { title: 'Name', dataIndex: 'fullName', render: (v, u) => <>{v}{u.id === me?.id && <Tag className="ml-2">You</Tag>}</> },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Role', dataIndex: 'role', render: (r: string) => <Tag color={r === 'ADMIN' ? 'blue' : 'default'}>{r}</Tag> },
    {
      title: 'Active',
      dataIndex: 'isActive',
      render: (active: boolean, u) => (
        <Switch
          checked={active}
          disabled={u.id === me?.id}
          loading={toggleStatus.isPending && toggleStatus.variables?.id === u.id}
          onChange={(checked) => toggleStatus.mutate({ id: u.id, isActive: checked })}
        />
      ),
    },
    {
      title: 'Last login',
      dataIndex: 'lastLoginAt',
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : <Typography.Text type="secondary">Never</Typography.Text>),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, u) => <Button size="small" icon={<Pencil size={14} />} onClick={() => openEdit(u)}>Edit</Button>,
    },
  ]

  return (
    <Card
      title="User Management"
      extra={<Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>Create user</Button>}
    >
      {users.isError && <Alert type="error" showIcon message="Could not load users" description={users.error.message} className="mb-4" />}
      <Table<ManagedUser>
        rowKey="id"
        columns={columns}
        dataSource={users.data ?? []}
        loading={users.isLoading}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 800 }}
      />
      <UserFormModal
        open={modalOpen}
        editing={editing}
        submitting={save.isPending}
        onCancel={() => setModalOpen(false)}
        onSubmit={(values) => save.mutate(values)}
      />
    </Card>
  )
}
