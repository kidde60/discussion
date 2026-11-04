import { useEffect } from 'react'
import { Form, Input, Modal, Select } from 'antd'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { Enrollment } from '../../types/participants'

const PHONE = /^\+?[0-9 ()-]{5,30}$/

const schema = z.object({
  classId: z.string(),
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  phoneNumber: z.string().trim().regex(PHONE, 'Enter a valid phone number'),
  registrationNumber: z.string().trim().min(1, 'Enter the registration number').max(60),
  attendanceMode: z.enum(['ONLINE', 'PHYSICAL']),
})

export type ParticipantFormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  editing: Enrollment | null
  classOptions: { value: string; label: string }[]
  defaultClassId: string | null
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: ParticipantFormValues) => void
}

export default function ParticipantFormModal({ open, editing, classOptions, defaultClassId, submitting, onCancel, onSubmit }: Props) {
  const { control, handleSubmit, reset } = useForm<ParticipantFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { classId: defaultClassId ?? '', fullName: '', phoneNumber: '', registrationNumber: '', attendanceMode: 'ONLINE' },
  })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { classId: editing.classId, fullName: editing.fullName, phoneNumber: editing.phoneNumber ?? '', registrationNumber: editing.registrationNumber, attendanceMode: editing.attendanceMode }
        : { classId: defaultClassId ?? '', fullName: '', phoneNumber: '', registrationNumber: '', attendanceMode: 'ONLINE' },
    )
  }, [open, editing, defaultClassId, reset])

  return (
    <Modal
      title={editing ? 'Edit participant' : 'Add participant'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit(onSubmit)}
      okText={editing ? 'Save changes' : 'Add participant'}
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form layout="vertical" requiredMark={false} className="pt-2">
        {!editing && (
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
          name="fullName"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Full name" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          name="registrationNumber"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Registration number" extra="Used to recognise the same person across classes." validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          name="phoneNumber"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Phone number" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          name="attendanceMode"
          control={control}
          render={({ field }) => (
            <Form.Item label="Attendance type" extra={editing ? 'Applies to this class only. A participant in a group can only change to the group\'s type after leaving it.' : undefined}>
              <Select {...field} options={[{ value: 'ONLINE', label: 'Online' }, { value: 'PHYSICAL', label: 'Physical' }]} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}
