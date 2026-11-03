import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, InputNumber, Modal, Radio, Select, Space, Table, Typography, message } from 'antd'
import { api, ApiError } from '../../services/api'
import type { AttendanceMode, GenerationPlan } from '../../types/groups'

type Props = {
  open: boolean
  classId: string
  defaultCapacity: number
  onClose: () => void
  onDone: () => void
}

type Options = { attendanceMode: AttendanceMode; strategy: 'NEW' | 'FILL'; capacity: number | null }

export default function GenerateGroupsModal({ open, classId, defaultCapacity, onClose, onDone }: Props) {
  const [options, setOptions] = useState<Options>({ attendanceMode: 'ONLINE', strategy: 'NEW', capacity: null })
  const [plan, setPlan] = useState<GenerationPlan | null>(null)

  const run = useMutation({
    mutationFn: (confirm: boolean) =>
      api<{ plan: GenerationPlan; confirmed: boolean }>(`/classes/${classId}/groups/generate`, {
        body: { ...options, capacity: options.strategy === 'NEW' ? options.capacity ?? undefined : undefined, confirm },
      }),
    onSuccess: ({ plan, confirmed }, confirm) => {
      setPlan(plan)
      if (confirm) {
        if (confirmed) {
          message.success(`Allocated ${plan.totalToAssign} participants`)
          onDone()
        } else {
          message.info('Nobody was left to allocate')
        }
        close()
      }
    },
    onError: (err) => message.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  })

  const close = () => {
    setPlan(null)
    onClose()
  }

  const nothingToAllocate = plan !== null && plan.totalToAssign === 0

  return (
    <Modal
      title="Generate groups"
      open={open}
      onCancel={close}
      width={720}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>Cancel</Button>
          <Button onClick={() => run.mutate(false)} loading={run.isPending && run.variables === false}>Preview</Button>
          <Button type="primary" disabled={!plan || nothingToAllocate} onClick={() => run.mutate(true)} loading={run.isPending && run.variables === true}>
            Confirm allocation
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Attendance type">
          <Select
            value={options.attendanceMode}
            onChange={(attendanceMode) => { setOptions({ ...options, attendanceMode }); setPlan(null) }}
            options={[{ value: 'ONLINE', label: 'Online participants' }, { value: 'PHYSICAL', label: 'Physical participants' }]}
          />
        </Form.Item>
        <Form.Item label="What should happen?">
          <Radio.Group
            value={options.strategy}
            onChange={(e) => { setOptions({ ...options, strategy: e.target.value }); setPlan(null) }}
            options={[
              { value: 'NEW', label: 'Create new groups' },
              { value: 'FILL', label: 'Fill available spaces in existing groups' },
            ]}
          />
        </Form.Item>
        {options.strategy === 'NEW' && (
          <Form.Item label="Group capacity" extra={`Leave empty to use the class default (${defaultCapacity}).`}>
            <InputNumber
              value={options.capacity}
              onChange={(capacity) => { setOptions({ ...options, capacity }); setPlan(null) }}
              min={1}
              max={500}
              placeholder={String(defaultCapacity)}
              style={{ width: 200 }}
            />
          </Form.Item>
        )}
      </Form>

      {!plan && <Typography.Text type="secondary">Preview the allocation first. Nothing is saved until you confirm.</Typography.Text>}
      {nothingToAllocate && <Alert type="info" showIcon message="No unassigned participants match this attendance type." />}
      {plan && !nothingToAllocate && (
        <>
          <Alert
            className="mb-3"
            type={plan.leftover > 0 ? 'warning' : 'success'}
            showIcon
            message={`${plan.totalToAssign} participants will be placed in ${plan.steps.length} ${plan.steps.length === 1 ? 'group' : 'groups'}.${plan.leftover > 0 ? ` ${plan.leftover} will stay unassigned because the existing groups are full.` : ''}`}
          />
          <Table
            size="small"
            rowKey={(s) => `${s.action}-${s.groupId ?? s.groupNumber}`}
            pagination={false}
            dataSource={plan.steps}
            columns={[
              { title: 'Group', dataIndex: 'name' },
              { title: 'Action', dataIndex: 'action', render: (a: string) => (a === 'CREATE' ? 'New group' : 'Add to existing') },
              { title: 'Capacity', dataIndex: 'capacity', align: 'right' },
              { title: 'Adding', key: 'adding', align: 'right', render: (_, s) => s.members.length },
            ]}
            expandable={{
              expandedRowRender: (s) => (
                <Typography.Text>{s.members.map((m) => `${m.fullName} (${m.registrationNumber})`).join(', ')}</Typography.Text>
              ),
            }}
          />
        </>
      )}
    </Modal>
  )
}
