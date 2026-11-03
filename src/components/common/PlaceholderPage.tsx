import { Card, Typography } from 'antd'

type Props = { title: string; description: string; children?: React.ReactNode }

export default function PlaceholderPage({ title, description, children }: Props) {
  return (
    <Card>
      <Typography.Title level={3} style={{ marginTop: 0 }}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      {children}
    </Card>
  )
}
