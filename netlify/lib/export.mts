import ExcelJS from 'exceljs'
import { query } from './db.mts'
import type { SessionUser } from './auth.mts'
import { jsonError } from './http.mts'

type ExportRow = { createdAt: string; fullName: string; registrationNumber: string; phoneNumber: string; groupNumber: number | null }

const HEADERS = ['Timestamp', 'NAME', 'REGISTRATION NUMBER', 'E-MAIL', 'CONTACT', 'GROUP']

// Same layout as the Google Form response export, so the file can be used wherever that one is.
async function spreadsheet(rows: ExportRow[], filename: string) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Form Responses 1')
  sheet.columns = [
    { header: HEADERS[0], key: 'timestamp', width: 22 },
    { header: HEADERS[1], key: 'name', width: 40 },
    { header: HEADERS[2], key: 'registration', width: 30 },
    { header: HEADERS[3], key: 'email', width: 36 },
    { header: HEADERS[4], key: 'contact', width: 20 },
    { header: HEADERS[5], key: 'group', width: 12 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const r of rows) {
    sheet.addRow({
      timestamp: new Date(r.createdAt),
      name: r.fullName,
      registration: r.registrationNumber,
      email: '',
      contact: r.phoneNumber,
      group: r.groupNumber ?? '',
    })
  }
  sheet.getColumn('timestamp').numFmt = 'yyyy-mm-dd hh:mm:ss'
  sheet.eachRow((row) => row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } }))

  const buffer = await workbook.xlsx.writeBuffer()
  const safeName = filename.replace(/[^\w .()-]+/g, '_')
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  })
}

const requireAdmin = (user: SessionUser | null) => (user?.role === 'ADMIN' ? null : jsonError(403, 'Forbidden'))

// Class-level export. attendanceMode is ONLINE, PHYSICAL or ALL (default).
export async function classExport(user: SessionUser | null, classId: number, url: URL) {
  const denied = requireAdmin(user)
  if (denied) return denied
  const [cls] = await query(`SELECT name FROM classes WHERE id = $1`, [classId])
  if (!cls) return jsonError(404, 'Class not found')

  const modeParam = url.searchParams.get('attendanceMode')
  const mode = modeParam === 'ONLINE' || modeParam === 'PHYSICAL' ? modeParam : null
  const label = mode === 'ONLINE' ? 'Online' : mode === 'PHYSICAL' ? 'Physical' : 'All'
  const rows = (await query(
    `SELECT created_at AS "createdAt", full_name AS "fullName", registration_number AS "registrationNumber",
            phone_number AS "phoneNumber", group_number AS "groupNumber"
     FROM enrollment_overview
     WHERE class_id = $1 AND ($2::text IS NULL OR attendance_mode = $2::text)
     ORDER BY group_number NULLS LAST, full_name`,
    [classId, mode],
  )) as ExportRow[]
  return spreadsheet(rows, `${cls.name} - ${label}.xlsx`)
}

// Single-group export: the members of one group.
export async function groupExport(user: SessionUser | null, groupId: number) {
  const denied = requireAdmin(user)
  if (denied) return denied
  const [group] = await query(`SELECT name, class_name AS "className" FROM group_overview WHERE id = $1`, [groupId])
  if (!group) return jsonError(404, 'Group not found')

  const rows = (await query(
    `SELECT created_at AS "createdAt", full_name AS "fullName", registration_number AS "registrationNumber",
            phone_number AS "phoneNumber", group_number AS "groupNumber"
     FROM enrollment_overview
     WHERE group_id = $1
     ORDER BY full_name`,
    [groupId],
  )) as ExportRow[]
  return spreadsheet(rows, `${group.className} - ${group.name}.xlsx`)
}
