import { useEffect } from 'react'
import { Form, Input, InputNumber, Modal } from 'antd'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ClassSummary } from '../../types/classes'

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter a class name').max(120),
    description: z.string().trim().max(1000),
    groupCapacity: z.number({ error: 'Enter a capacity' }).int().min(1, 'At least 1').max(500),
    startDate: z.string().min(1, 'Choose a start date'),
    endDate: z.string(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, { message: 'End date cannot be before start date', path: ['endDate'] })

export type ClassFormValues = z.infer<typeof schema>

const empty: ClassFormValues = { name: '', description: '', groupCapacity: 10, startDate: '', endDate: '' }

type Props = {
  open: boolean
  editing: ClassSummary | null
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: ClassFormValues) => void
}

export default function ClassFormModal({ open, editing, submitting, onCancel, onSubmit }: Props) {
  const { control, handleSubmit, reset } = useForm<ClassFormValues>({ resolver: zodResolver(schema), defaultValues: empty })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { name: editing.name, description: editing.description ?? '', groupCapacity: editing.groupCapacity, startDate: editing.startDate, endDate: editing.endDate ?? '' }
        : empty,
    )
  }, [open, editing, reset])

  return (
    <Modal
      title={editing ? 'Edit class' : 'Create class'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit(onSubmit)}
      okText={editing ? 'Save changes' : 'Create class'}
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form layout="vertical" requiredMark={false} className="pt-2">
        <Controller
          name="name"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Class name" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Input {...field} placeholder="e.g. November 2026 Discussion Class" />
            </Form.Item>
          )}
        />
        <Controller
          name="description"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Description (optional)" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Input.TextArea {...field} rows={3} />
            </Form.Item>
          )}
        />
        <Controller
          name="groupCapacity"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Default group capacity" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <InputNumber {...field} min={1} max={500} style={{ width: '100%' }} />
            </Form.Item>
          )}
        />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Controller
            name="startDate"
            control={control}
            render={({ field, fieldState }) => (
              <Form.Item label="Start date" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                <Input {...field} type="date" />
              </Form.Item>
            )}
          />
          <Controller
            name="endDate"
            control={control}
            render={({ field, fieldState }) => (
              <Form.Item label="End date (optional)" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                <Input {...field} type="date" />
              </Form.Item>
            )}
          />
        </div>
      </Form>
    </Modal>
  )
}
