import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Form, Input, InputNumber, Modal, Select } from 'antd'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { api } from '../../services/api'
import type { AttendanceMode, GroupSummary } from '../../types/groups'
import type { Enrollment } from '../../types/participants'

const schema = z.object({
  classId: z.string().min(1, 'Choose a class'),
  name: z.string().trim().max(120),
  capacity: z.number({ error: 'Enter a capacity' }).int().min(1, 'At least 1').max(500),
  attendanceMode: z.enum(['ONLINE', 'PHYSICAL']),
  groupLeaderId: z.string().nullable(),
})

export type GroupFormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  editing: GroupSummary | null
  classId: string | null
  classOptions?: { value: string; label: string }[]
  defaultCapacity: number
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: GroupFormValues) => void
}

export default function GroupFormModal({ open, editing, classId, classOptions, defaultCapacity, submitting, onCancel, onSubmit }: Props) {
  const { control, handleSubmit, reset, setValue } = useForm<GroupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { classId: classId ?? '', name: '', capacity: defaultCapacity, attendanceMode: 'ONLINE', groupLeaderId: null },
  })
  const selectedClass = useWatch({ control, name: 'classId' })
  const leaderClass = editing?.classId ?? (selectedClass || null)

  const enrollments = useQuery({
    queryKey: ['class-participants', leaderClass],
    enabled: Boolean(leaderClass) && open,
    queryFn: () => api<{ participants: Enrollment[] }>(`/classes/${leaderClass}/participants`).then((r) => r.participants),
  })

  const nextName = useQuery({
    queryKey: ['next-group-name', selectedClass],
    enabled: open && !editing && Boolean(selectedClass),
    queryFn: () => api<{ name: string }>(`/classes/${selectedClass}/groups/next-name`).then((r) => r.name),
  })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { classId: editing.classId, name: editing.name, capacity: editing.capacity, attendanceMode: editing.attendanceMode, groupLeaderId: editing.groupLeaderId }
        : { classId: classId ?? '', name: '', capacity: defaultCapacity, attendanceMode: 'ONLINE' as AttendanceMode, groupLeaderId: null },
    )
  }, [open, editing, classId, defaultCapacity, reset])

  useEffect(() => {
    if (open && !editing && selectedClass && nextName.data) setValue('name', nextName.data)
  }, [open, editing, selectedClass, nextName.data, setValue])

  const leaderOptions = (enrollments.data ?? []).map((p) => ({ value: p.enrollmentId, label: `${p.fullName} (${p.registrationNumber}) · ${p.attendanceMode === 'ONLINE' ? 'Online' : 'Physical'}` }))

  return (
    <Modal
      title={editing ? `Edit ${editing.name}` : 'Create group'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit(onSubmit)}
      okText={editing ? 'Save changes' : 'Create group'}
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form layout="vertical" requiredMark={false} className="pt-2">
        {!editing && classOptions && (
          <Controller
            name="classId"
            control={control}
            render={({ field, fieldState }) => (
              <Form.Item label="Class" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                <Select {...field} options={classOptions} placeholder="Choose a class" />
              </Form.Item>
            )}
          />
        )}
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <Form.Item label="Group name" extra={editing ? undefined : 'Filled in with the next free number for this class. You can change it.'}>
              <Input {...field} placeholder="Group name" />
            </Form.Item>
          )}
        />
        <Controller
          name="capacity"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Capacity" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <InputNumber {...field} min={1} max={500} style={{ width: '100%' }} />
            </Form.Item>
          )}
        />
        {!editing && (
          <Controller
            name="attendanceMode"
            control={control}
            render={({ field }) => (
              <Form.Item label="Attendance type" extra="Only participants with this attendance type can join the group.">
                <Select {...field} options={[{ value: 'ONLINE', label: 'Online' }, { value: 'PHYSICAL', label: 'Physical' }]} />
              </Form.Item>
            )}
          />
        )}
        <Controller
          name="groupLeaderId"
          control={control}
          render={({ field }) => (
            <Form.Item label="Group leader (optional)">
              <Select
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v ?? null)}
                allowClear
                showSearch
                optionFilterProp="label"
                loading={enrollments.isLoading}
                options={leaderOptions}
                placeholder="Choose a participant from this class"
              />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}
