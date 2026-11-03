import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Layers } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../services/api'

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

type FormValues = z.infer<typeof schema>

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    setSubmitting(true)
    try {
      await login(values.email, values.password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Layers size={36} className="text-blue-600" />
          <Typography.Title level={3} style={{ margin: 0 }}>Discussion Group Manager</Typography.Title>
          <Typography.Text type="secondary">Sign in to continue</Typography.Text>
        </div>

        {serverError && <Alert type="error" showIcon message={serverError} className="mb-4" />}

        <Form layout="vertical" onFinish={handleSubmit(onSubmit)} requiredMark={false}>
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <Form.Item label="Email" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                <Input {...field} type="email" autoComplete="username" size="large" placeholder="you@example.com" />
              </Form.Item>
            )}
          />
          <Controller
            name="password"
            control={control}
            render={({ field, fieldState }) => (
              <Form.Item label="Password" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                <Input.Password {...field} autoComplete="current-password" size="large" />
              </Form.Item>
            )}
          />
          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  )
}
