import { useEffect } from 'react'
import { Form, Input, Modal, Select } from 'antd'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ManagedUser } from '../../types/auth'

const baseFields = {
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  role: z.enum(['ADMIN', 'USER']),
}

const createSchema = z.object({
  ...baseFields,
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

const editSchema = z.object({
  ...baseFields,
  email: z.string(),
  password: z.string(),
})

type FormValues = z.infer<typeof createSchema>

type Props = {
  open: boolean
  editing: ManagedUser | null
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: FormValues) => void
}

export default function UserFormModal({ open, editing, submitting, onCancel, onSubmit }: Props) {
  const isEdit = editing !== null
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: { fullName: '', email: '', password: '', role: 'USER' },
  })

  useEffect(() => {
    if (open) reset(editing ? { fullName: editing.fullName, email: editing.email, password: '', role: editing.role } : { fullName: '', email: '', password: '', role: 'USER' })
  }, [open, editing, reset])

  return (
    <Modal
      title={isEdit ? 'Edit user' : 'Create user'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit(onSubmit)}
      okText={isEdit ? 'Save changes' : 'Create user'}
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form layout="vertical" requiredMark={false} className="pt-2">
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
          name="email"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Email" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Input {...field} type="email" disabled={isEdit} autoComplete="off" />
            </Form.Item>
          )}
        />
        {!isEdit && (
          <Controller
            name="password"
            control={control}
            render={({ field, fieldState }) => (
              <Form.Item label="Temporary password" extra="At least 8 characters. Share it with the user securely." validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                <Input.Password {...field} autoComplete="new-password" />
              </Form.Item>
            )}
          />
        )}
        <Controller
          name="role"
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item label="Role" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
              <Select
                {...field}
                options={[
                  { value: 'USER', label: 'User (read-only)' },
                  { value: 'ADMIN', label: 'Administrator' },
                ]}
              />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}
