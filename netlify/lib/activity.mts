import { sql } from './db.mts'

export type EntityType = 'USER' | 'CLASS' | 'GROUP' | 'PARTICIPANT'

export async function logActivity(entry: {
  userId: string
  action: string
  entityType: EntityType
  entityId: string | number
  description: string
  oldValues?: unknown
  newValues?: unknown
}) {
  const { userId, action, entityType, entityId, description, oldValues, newValues } = entry
  await sql`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, old_values, new_values)
    VALUES (${userId}, ${action}, ${entityType}, ${entityId}, ${description},
            ${oldValues === undefined ? null : JSON.stringify(oldValues)},
            ${newValues === undefined ? null : JSON.stringify(newValues)})`
}
