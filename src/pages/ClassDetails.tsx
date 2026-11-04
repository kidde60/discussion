import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Col, Descriptions, Dropdown, Row, Skeleton, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import { Archive, ArchiveRestore, ArrowLeft, FileSpreadsheet, Layers, Pencil, Plus, Users } from 'lucide-react'
import ClassFormModal, { type ClassFormValues } from '../components/classes/ClassFormModal'
import GroupFormModal, { type GroupFormValues } from '../components/groups/GroupFormModal'
import GenerateGroupsModal from '../components/groups/GenerateGroupsModal'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, download } from '../services/api'
import type { ClassStatus, ClassSummary } from '../types/classes'
import type { AttendanceMode, GroupSummary } from '../types/groups'
import AttendanceTag from '../components/common/AttendanceTag'

export default function ClassDetails() {
  const { classId } = useParams()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)

  const cls = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api<{ class: ClassSummary }>(`/classes/${classId}`).then((r) => r.class),
  })

  const groups = useQuery({
    queryKey: ['class-groups', classId],
    queryFn: () => api<{ groups: GroupSummary[] }>(`/classes/${classId}/groups`).then((r) => r.groups),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['class', classId] })
    queryClient.invalidateQueries({ queryKey: ['classes'] })
    queryClient.invalidateQueries({ queryKey: ['class-groups', classId] })
  }

  const createGroup = useMutation({
    mutationFn: (v: GroupFormValues) => api(`/classes/${classId}/groups`, { body: { name: v.name || undefined, capacity: v.capacity, attendanceMode: v.attendanceMode, groupLeaderId: v.groupLeaderId } }),
    onSuccess: () => {
      message.success('Group created')
      setGroupFormOpen(false)
      refresh()
    },
    onError: (err) => message.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  })
  const fail = (err: unknown) => message.error(err instanceof ApiError ? err.message : 'Something went wrong')

  const save = useMutation({
    mutationFn: (values: ClassFormValues) => api(`/classes/${classId}`, { method: 'PUT', body: { ...values, endDate: values.endDate || null } }),
    onSuccess: () => {
      message.success('Class updated')
      setModalOpen(false)
      refresh()
    },
    onError: fail,
  })

  const setArchived = useMutation({
    mutationFn: (status: ClassStatus) => api(`/classes/${classId}/archive`, { method: 'PATCH', body: { status } }),
    onSuccess: refresh,
    onError: fail,
  })

  if (cls.isLoading) return <Card><Skeleton active /></Card>
  if (cls.isError) return <Alert type="error" showIcon message="Could not load this class" description={cls.error.message} />
  const c = cls.data!

  return (
    <Space direction="vertical" size="large" className="w-full">
      <Link to="/classes"><Button type="link" icon={<ArrowLeft size={16} />} className="!p-0">Back to classes</Button></Link>

      <Card
        title={<Space>{c.name}<Tag color={c.status === 'ACTIVE' ? 'green' : 'default'}>{c.status}</Tag></Space>}
        extra={isAdmin && (
          <Space wrap>
            <Button icon={<Pencil size={14} />} onClick={() => setModalOpen(true)}>Edit</Button>
            {c.status === 'ACTIVE' ? (
              <Button icon={<Archive size={14} />} loading={setArchived.isPending} onClick={() => setArchived.mutate('ARCHIVED')}>Archive</Button>
            ) : (
              <Button icon={<ArchiveRestore size={14} />} loading={setArchived.isPending} onClick={() => setArchived.mutate('ACTIVE')}>Activate</Button>
            )}
          </Space>
        )}
      >
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Class code"><Typography.Text code>{c.classCode}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Default group capacity">{c.groupCapacity}</Descriptions.Item>
          <Descriptions.Item label="Start date">{c.startDate}</Descriptions.Item>
          <Descriptions.Item label="End date">{c.endDate ?? 'Open-ended'}</Descriptions.Item>
          <Descriptions.Item label="Description" span={2}>{c.description ?? <Typography.Text type="secondary">No description</Typography.Text>}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="Total participants" value={c.totalParticipants} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Online" value={c.onlineParticipants} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Physical" value={c.physicalParticipants} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Unassigned" value={c.unassignedParticipants} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Groups" value={c.totalGroups} /></Card></Col>
      </Row>

      <Card
        title="Groups"
        extra={
          <Space wrap>
            <Link to={`/participants?classId=${c.id}`}><Button icon={<Users size={14} />}>Participants</Button></Link>
            {isAdmin && (
              <>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'ONLINE', label: 'Online participants' },
                      { key: 'PHYSICAL', label: 'Physical participants' },
                      { key: 'ALL', label: 'Both' },
                    ],
                    onClick: ({ key }) => download(`/classes/${c.id}/export?attendanceMode=${key}`).catch((err) => message.error(err instanceof ApiError ? err.message : 'Export failed')),
                  }}
                >
                  <Button icon={<FileSpreadsheet size={14} />}>Export</Button>
                </Dropdown>
                <Button icon={<Layers size={14} />} onClick={() => setGenerateOpen(true)}>Generate groups</Button>
                <Button type="primary" icon={<Plus size={14} />} onClick={() => setGroupFormOpen(true)}>Create group</Button>
              </>
            )}
          </Space>
        }
      >
        <Table<GroupSummary>
          rowKey="id"
          size="middle"
          dataSource={groups.data ?? []}
          loading={groups.isLoading}
          pagination={false}
          locale={{ emptyText: 'No groups yet' }}
          scroll={{ x: 700 }}
          columns={[
            { title: 'Group', dataIndex: 'name', render: (v, g) => <Link to={`/groups/${g.id}`}>{v}</Link> },
            { title: 'Type', dataIndex: 'attendanceMode', render: (m: AttendanceMode) => <AttendanceTag mode={m} /> },
            { title: 'Capacity', dataIndex: 'capacity', align: 'right' },
            { title: 'Members', dataIndex: 'currentMembers', align: 'right' },
            { title: 'Available', dataIndex: 'availableSpaces', align: 'right' },
            { title: 'Leader', dataIndex: 'groupLeaderName', render: (v: string | null) => v ?? '—' },
            { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag> },
          ]}
        />
      </Card>

      {isAdmin && (
        <>
          <ClassFormModal
            open={modalOpen}
            editing={c}
            submitting={save.isPending}
            onCancel={() => setModalOpen(false)}
            onSubmit={(values) => save.mutate(values)}
          />
          <GroupFormModal
            open={groupFormOpen}
            editing={null}
            classId={c.id}
            defaultCapacity={c.groupCapacity}
            submitting={createGroup.isPending}
            onCancel={() => setGroupFormOpen(false)}
            onSubmit={(v) => createGroup.mutate(v)}
          />
          <GenerateGroupsModal
            open={generateOpen}
            classId={c.id}
            defaultCapacity={c.groupCapacity}
            onClose={() => setGenerateOpen(false)}
            onDone={() => {
              setGenerateOpen(false)
              refresh()
            }}
          />
        </>
      )}
    </Space>
  )
}
