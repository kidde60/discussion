import type { ClassStatus } from './classes'

export type AttendanceMode = 'ONLINE' | 'PHYSICAL'

export type GroupSummary = {
  id: string
  classId: string
  className: string
  name: string
  groupNumber: number
  capacity: number
  attendanceMode: AttendanceMode
  status: ClassStatus
  whatsappLink: string | null
  groupLeaderId: string | null
  groupLeaderName: string | null
  currentMembers: number
  availableSpaces: number
  createdAt: string
}

export type GenerationMember = { enrollmentId: string; fullName: string; registrationNumber: string }

export type GenerationStep = {
  action: 'CREATE' | 'ASSIGN'
  groupId: string | null
  groupNumber: number | null
  name: string
  capacity: number
  members: GenerationMember[]
}

export type GenerationPlan = { steps: GenerationStep[]; totalToAssign: number; leftover: number }
