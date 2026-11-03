import { Tag } from 'antd'
import type { AttendanceMode } from '../../types/groups'

const LABELS: Record<AttendanceMode, { label: string; color: string }> = {
  ONLINE: { label: 'Online', color: 'blue' },
  PHYSICAL: { label: 'Physical', color: 'orange' },
}

export default function AttendanceTag({ mode }: { mode: AttendanceMode }) {
  return <Tag color={LABELS[mode].color}>{LABELS[mode].label}</Tag>
}
