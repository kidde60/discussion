export type ActivityEntityType = 'USER' | 'CLASS' | 'GROUP' | 'PARTICIPANT'

export type ActivityLog = {
  id: string
  createdAt: string
  action: string
  entityType: ActivityEntityType
  entityId: string | null
  description: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  userName: string | null
}

export type ActivityLogPage = { logs: ActivityLog[]; total: number; page: number; pageSize: number }
