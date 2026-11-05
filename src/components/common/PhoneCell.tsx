import { Button, Space, Typography } from 'antd'
import { MessageCircle } from 'lucide-react'
import { whatsappUrl } from '../../utils/whatsapp'

export default function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) return <Typography.Text type="secondary">—</Typography.Text>
  const url = whatsappUrl(phone)
  return (
    <Space size={4}>
      {phone}
      {url && (
        <Button
          type="text"
          size="small"
          aria-label={`Open WhatsApp chat with ${phone}`}
          icon={<MessageCircle size={16} color="#25D366" />}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        />
      )}
    </Space>
  )
}
