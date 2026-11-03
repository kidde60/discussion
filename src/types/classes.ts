export type ClassStatus = 'ACTIVE' | 'ARCHIVED'

export type ClassSummary = {
  id: string
  name: string
  classCode: string
  description: string | null
  groupCapacity: number
  startDate: string
  endDate: string | null
  status: ClassStatus
  createdAt: string
  totalParticipants: number
  onlineParticipants: number
  physicalParticipants: number
  unassignedParticipants: number
  totalGroups: number
}
