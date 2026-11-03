import type { AttendanceMode } from './groups'

export type Enrollment = {
  enrollmentId: string
  participantId: string
  classId: string
  className: string
  classCode: string
  fullName: string
  phoneNumber: string | null
  registrationNumber: string
  attendanceMode: AttendanceMode
  groupId: string | null
  groupName: string | null
  groupNumber: number | null
}

export type ImportSummary = {
  totalRecords: number
  toImport: number
  duplicates: number
  invalid: number
  conflicts: number
  needsReview: number
  skippedAsSamePerson: number
}

export type ImportFlag = {
  rowNumber: number
  fullName: string
  registrationNumber: string
  matchName: string
  matchRegistrationNumber: string
  matchSource: 'FILE' | 'SYSTEM'
}

export type ImportRow = {
  rowNumber: number
  fullName: string
  phoneNumber: string
  registrationNumber: string
  attendanceMode: string
  status: 'NEW' | 'EXISTING' | 'DUPLICATE' | 'INVALID' | 'CONFLICT'
  reason: string | null
}
