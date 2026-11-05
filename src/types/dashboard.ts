export type DashboardData = {
  isAdmin: boolean
  stats: {
    totalClasses: number
    activeClasses: number
    archivedClasses: number
    totalParticipants: number
    onlineParticipants: number
    physicalParticipants: number | null
    unassignedParticipants: number
    totalGroups: number
    onlineGroups: number
    physicalGroups: number | null
  }
  recentClasses: { id: string; name: string; classCode: string; status: 'ACTIVE' | 'ARCHIVED'; createdAt: string; totalParticipants: number; totalGroups: number }[]
  recentParticipants: { fullName: string; className: string; attendanceMode: 'ONLINE' | 'PHYSICAL'; groupName: string | null; createdAt: string }[]
  groupDistribution: { id: string; name: string; groups: number; onlineGroups: number; physicalGroups?: number; members: number; capacity: number }[]
  recentActivity: { createdAt: string; action: string; description: string; userName: string | null }[] | null
}
