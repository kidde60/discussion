import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { Search } from 'lucide-react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { api } from '../services/api'
import type { ActivityEntityType, ActivityLog, ActivityLogPage } from '../types/activity'

const ENTITY_COLOR: Record<ActivityEntityType, string> = { USER: 'purple', CLASS: 'blue', GROUP: 'cyan', PARTICIPANT: 'orange' }
const ENTITY_LABEL: Record<ActivityEntityType, string> = { USER: 'User', CLASS: 'Class', GROUP: 'Group', PARTICIPANT: 'Participant' }

const when = (v: string) => new Date(v).toLocaleString()

export default function ActivityLogs() {
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  const [entityType, setEntityType] = useState<ActivityEntityType | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search) query.set('search', search)
  if (entityType) query.set('entityType', entityType)

  const logs = useQuery({
    queryKey: ['activity-logs', query.toString()],
    queryFn: () => api<ActivityLogPage>(`/activity-logs?${query}`),
    placeholderData: (prev) => prev,
  })

  const columns: TableProps<ActivityLog>['columns'] = [
    { title: 'When', dataIndex: 'createdAt', width: 180, render: (v: string) => when(v) },
    { title: 'By', dataIndex: 'userName', width: 160, render: (v: string | null) => v ?? <Typography.Text type="secondary">System</Typography.Text> },
    { title: 'Type', dataIndex: 'entityType', width: 130, render: (t: ActivityEntityType) => <Tag color={ENTITY_COLOR[t]}>{ENTITY_LABEL[t]}</Tag> },
    { title: 'Action', dataIndex: 'action', width: 200, render: (a: string) => a.replace(/_/g, ' ').toLowerCase() },
    { title: 'Details', dataIndex: 'description' },
  ]

  const changes = (log: ActivityLog) => {
    if (!log.oldValues && !log.newValues) return <Typography.Text type="secondary">No field changes recorded.</Typography.Text>
    return (
      <Space align="start" size="large" wrap>
        <div>
          <Typography.Text strong>Before</Typography.Text>
          <pre className="mt-1 max-w-md overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(log.oldValues, null, 2) ?? 'null'}</pre>
        </div>
        <div>
          <Typography.Text strong>After</Typography.Text>
          <pre className="mt-1 max-w-md overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(log.newValues, null, 2) ?? 'null'}</pre>
        </div>
      </Space>
    )
  }

  return (
    <Card title="Activity logs">
      <Space wrap className="mb-4">
        <Input
          placeholder="Search by person, action or details"
          allowClear
          prefix={<Search size={14} />}
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setPage(1) }}
          style={{ width: 300 }}
        />
        <Select
          allowClear
          placeholder="All types"
          value={entityType}
          onChange={(v) => { setEntityType(v); setPage(1) }}
          options={(Object.keys(ENTITY_LABEL) as ActivityEntityType[]).map((k) => ({ value: k, label: ENTITY_LABEL[k] }))}
          style={{ width: 170 }}
        />
      </Space>
      {logs.isError && <Alert type="error" showIcon message="Could not load activity" description={logs.error.message} className="mb-4" />}
      <Table<ActivityLog>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={logs.data?.logs ?? []}
        loading={logs.isLoading}
        scroll={{ x: 900 }}
        expandable={{ expandedRowRender: changes, rowExpandable: (r) => Boolean(r.oldValues || r.newValues) }}
        pagination={{
          current: page,
          pageSize,
          total: logs.data?.total ?? 0,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />
    </Card>
  )
}
