import { z } from 'zod'
import ExcelJS from 'exceljs'
import { query, transaction, type Query } from './db.mts'
import { logActivity } from './activity.mts'
import { canSeePhone, type SessionUser } from './auth.mts'
import { ENROLLMENT_SELECT, PHONE_PATTERN, hidePhone } from './enrollments.mts'
import { json, jsonError } from './http.mts'

const MAX_IMPORT_ROWS = 2000

const modeSchema = z.enum(['ONLINE', 'PHYSICAL'])
const phoneSchema = z.string().trim().regex(PHONE_PATTERN, 'Enter a valid phone number')

const personSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  phoneNumber: phoneSchema,
  registrationNumber: z.string().trim().min(1, 'Enter the registration number').max(60),
  attendanceMode: modeSchema,
})

const editPersonSchema = personSchema.omit({ attendanceMode: true })
const editEnrollmentSchema = z.object({ attendanceMode: modeSchema })
const assignSchema = z.object({ groupId: z.union([z.coerce.number().int().positive(), z.null()]) })
const importSchema = z.object({
  fileBase64: z.string().min(1),
  commit: z.boolean().default(false),
  decisions: z.record(z.string(), z.enum(['IMPORT', 'SKIP'])).optional(),
})

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()
const requireAdmin = (user: SessionUser | null) => (user?.role === 'ADMIN' ? null : jsonError(403, 'Forbidden'))

// Lists enrollments. classId null means across all classes.
export async function listEnrollments(user: SessionUser | null, url: URL, classId: number | null) {
  const search = (url.searchParams.get('search') ?? '').trim()
  const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
  const modeParam = url.searchParams.get('attendanceMode')
  const mode = modeParam === 'ONLINE' || modeParam === 'PHYSICAL' ? modeParam : null
  const groupParam = url.searchParams.get('groupId')
  const group = groupParam === 'unassigned' || (groupParam && /^\d+$/.test(groupParam)) ? groupParam : null

  const rows = await query(
    `${ENROLLMENT_SELECT}
     WHERE ($1::bigint IS NULL OR class_id = $1::bigint)
       AND ($2::text = '' OR full_name ILIKE $3 OR registration_number ILIKE $3 OR ($4::boolean AND phone_number ILIKE $3))
       AND ($5::text IS NULL OR attendance_mode = $5::text)
       AND ($6::text IS NULL OR ($6::text = 'unassigned' AND group_id IS NULL) OR group_id::text = $6::text)
     ORDER BY full_name`,
    [classId, search, pattern, canSeePhone(user), mode, group],
  )
  return json({ participants: rows.map((r) => hidePhone(r, user)) })
}

// Routes under /api/classes/:id/participants
export async function classParticipants(req: Request, user: SessionUser | null, classId: number, rest: string[], url: URL) {
  const [cls] = await query(`SELECT id FROM classes WHERE id = $1`, [classId])
  if (!cls) return jsonError(404, 'Class not found')

  if (req.method === 'GET' && rest.length === 0) return listEnrollments(user, url, classId)

  const denied = requireAdmin(user)
  if (denied) return denied
  const actor = user as SessionUser

  if (req.method === 'POST' && rest.length === 0) {
    const parsed = personSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    const result = await transaction((q) => enroll(q, classId, parsed.data))
    if (result.status === 'CONFLICT' || result.status === 'ALREADY_ENROLLED') return jsonError(409, result.message)
    await logActivity({ userId: actor.id, action: 'PARTICIPANT_ADDED', entityType: 'PARTICIPANT', entityId: result.participantId, description: `Added ${parsed.data.fullName} (${parsed.data.registrationNumber})`, newValues: parsed.data })
    const [row] = await query(`${ENROLLMENT_SELECT} WHERE enrollment_id = $1`, [result.enrollmentId])
    return json({ participant: row }, 201)
  }

  if (req.method === 'POST' && rest.length === 1 && rest[0] === 'import') return importRoster(req, actor, classId)

  return jsonError(404, 'Not found')
}

// Adds one person to a class. Reuses the person record when the registration number already exists.
async function enroll(q: Query, classId: number, v: z.infer<typeof personSchema>) {
  const [existing] = await q(`SELECT id, full_name AS "fullName" FROM participants WHERE registration_number = $1`, [v.registrationNumber])
  if (existing && !sameName(existing.fullName, v.fullName)) {
    return { status: 'CONFLICT' as const, message: `Registration number ${v.registrationNumber} already belongs to ${existing.fullName}` }
  }

  let participantId: string = existing?.id
  if (!existing) {
    const [created] = await q(
      `INSERT INTO participants (full_name, phone_number, registration_number) VALUES ($1, $2, $3) RETURNING id`,
      [v.fullName, v.phoneNumber, v.registrationNumber],
    )
    participantId = created.id
  }

  const [already] = await q(`SELECT id FROM class_enrollments WHERE participant_id = $1 AND class_id = $2`, [participantId, classId])
  if (already) return { status: 'ALREADY_ENROLLED' as const, message: `${v.fullName} is already enrolled in this class` }

  const [enrollment] = await q(
    `INSERT INTO class_enrollments (participant_id, class_id, attendance_mode) VALUES ($1, $2, $3) RETURNING id`,
    [participantId, classId, v.attendanceMode],
  )
  return { status: existing ? ('EXISTING' as const) : ('NEW' as const), participantId, enrollmentId: enrollment.id as string }
}

// Matched against normalized headers, so Google Form questions like "What is your name?" work too.
const FIELD_MATCHERS: Record<'fullName' | 'phoneNumber' | 'registrationNumber' | 'attendanceMode', (h: string) => boolean> = {
  fullName: (h) => h.includes('name') && !h.includes('registration') && !h.includes('course'),
  phoneNumber: (h) => /phone|whatsapp|mobile|contact|telephone/.test(h),
  registrationNumber: (h) => h.includes('registration') || h.includes('regnumber') || h.includes('regno'),
  attendanceMode: (h) => /attend|mode/.test(h),
}

const MODE_ALIASES: Record<string, 'ONLINE' | 'PHYSICAL'> = { online: 'ONLINE', physical: 'PHYSICAL', inperson: 'PHYSICAL' }
const normalize = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
// Removes invisible directional marks that get pasted in from spreadsheets and web forms.
const clean = (s: unknown) => String(s ?? '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').replace(/\s+/g, ' ').trim()
// A registration number must contain a year-and-number part such as 2611-0205.
const REG_CORE = /\d{4}-\d{4}/

type RosterRow = { rowNumber: number; fullName: string; phoneNumber: string; registrationNumber: string; attendanceMode: string; error: string | null }

async function parseRoster(buffer: Buffer<ArrayBuffer>): Promise<{ error: string } | { rows: RosterRow[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const sheet = workbook.worksheets[0]
  if (!sheet) return { error: 'The file has no worksheets' }

  const headers: Record<number, string> = {}
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col] = normalize(cell.text)
  })
  const columns = {} as Record<keyof typeof FIELD_MATCHERS, number>
  for (const field of Object.keys(FIELD_MATCHERS) as (keyof typeof FIELD_MATCHERS)[]) {
    const col = Object.keys(headers).map(Number).find((c) => FIELD_MATCHERS[field](headers[c]))
    if (col === undefined) {
      const found = Object.values(headers).filter(Boolean).join(', ')
      return { error: `Could not find a column for ${field}. Found columns: ${found || 'none'}` }
    }
    columns[field] = col
  }

  const rows: RosterRow[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const cell = (field: keyof typeof FIELD_MATCHERS) => clean(row.getCell(columns[field]).text)
    const values = {
      fullName: cell('fullName'),
      phoneNumber: cell('phoneNumber').replace(/^[Oo](?=\d)/, '0'),
      registrationNumber: cell('registrationNumber').toUpperCase(),
      attendanceMode: cell('attendanceMode'),
    }
    if (!Object.values(values).some(Boolean)) continue
    if (rows.length >= MAX_IMPORT_ROWS) return { error: `A single import is limited to ${MAX_IMPORT_ROWS} rows` }
    const mode = MODE_ALIASES[normalize(values.attendanceMode)]
    const error =
      values.fullName.length < 2 ? 'Missing or short name'
      : !PHONE_PATTERN.test(values.phoneNumber) ? 'Invalid phone number'
      : !values.registrationNumber ? 'Missing registration number'
      : !REG_CORE.test(values.registrationNumber) ? 'Registration number is not in a recognised format'
      : !mode ? 'Attendance mode must be Online or Physical'
      : null
    rows.push({ rowNumber: r, ...values, attendanceMode: mode ?? values.attendanceMode, error })
  }
  return { rows }
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return dp[b.length]
}

// Names are compared without case, spacing or word order, and allow a small typo.
const nameKey = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join('')
const regKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

const namesLike = (a: string, b: string) => {
  const na = nameKey(a)
  const nb = nameKey(b)
  return na === nb || (na.length >= 6 && levenshtein(na, nb) <= 2)
}
const regsLike = (a: string, b: string) => levenshtein(regKey(a), regKey(b)) <= 1

// Preview (commit: false) classifies every row without writing. Commit (commit: true) writes the valid rows in one transaction.
async function importRoster(req: Request, actor: SessionUser, classId: number) {
  const parsed = importSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)

  const parsedFile = await parseRoster(Buffer.from(parsed.data.fileBase64, 'base64')).catch(() => ({ error: 'Could not read the file. Upload an .xlsx spreadsheet.' }))
  if ('error' in parsedFile) return jsonError(400, parsedFile.error)

  const regs = [...new Set(parsedFile.rows.filter((r) => !r.error).map((r) => r.registrationNumber))]
  const existing = regs.length
    ? await query(
        `SELECT p.id, p.registration_number AS "registrationNumber", p.full_name AS "fullName", (e.id IS NOT NULL) AS enrolled
         FROM participants p LEFT JOIN class_enrollments e ON e.participant_id = p.id AND e.class_id = $1
         WHERE p.registration_number = ANY($2::text[])`,
        [classId, regs],
      )
    : []
  const known = new Map(existing.map((e) => [e.registrationNumber as string, e]))

  const seen = new Set<string>()
  const classified = parsedFile.rows.map((row) => {
    const { error, ...data } = row
    if (error) return { ...data, status: 'INVALID', reason: error }
    if (seen.has(row.registrationNumber)) return { ...data, status: 'DUPLICATE', reason: 'Registration number appears earlier in this file' }
    seen.add(row.registrationNumber)
    const match = known.get(row.registrationNumber)
    if (match && !sameName(match.fullName, row.fullName)) return { ...data, status: 'CONFLICT', reason: `Registration number belongs to ${match.fullName}` }
    if (match?.enrolled) return { ...data, status: 'DUPLICATE', reason: 'Already enrolled in this class' }
    return { ...data, status: match ? 'EXISTING' : 'NEW', reason: null }
  })

  // Rows that look like someone already known (same name with different registration, or a one-character difference).
  // Each needs an explicit decision before the import can be confirmed.
  const importable = classified.filter((r) => r.status === 'NEW' || r.status === 'EXISTING')
  const people = (await query(`SELECT id, full_name AS "fullName", registration_number AS "registrationNumber" FROM participants`)) as { id: string; fullName: string; registrationNumber: string }[]
  const flags = importable.flatMap((row) => {
    const fileMatches = importable
      .filter((o) => o.rowNumber < row.rowNumber)
      .map((o) => ({ match: o, source: 'FILE' as const }))
    const systemMatches = people.map((p) => ({ match: p, source: 'SYSTEM' as const }))
    const candidates = [...fileMatches, ...systemMatches].filter(({ match }) => match.registrationNumber !== row.registrationNumber)
    // A name match is the stronger signal, so it is reported ahead of a registration-only match.
    const hit =
      candidates.find(({ match }) => namesLike(row.fullName, match.fullName)) ??
      candidates.find(({ match }) => regsLike(row.registrationNumber, match.registrationNumber))
    if (!hit) return []
    return [{
      rowNumber: row.rowNumber,
      fullName: row.fullName,
      registrationNumber: row.registrationNumber,
      matchName: hit.match.fullName as string,
      matchRegistrationNumber: hit.match.registrationNumber as string,
      matchSource: hit.source,
    }]
  })

  const decisions = parsed.data.decisions ?? {}
  const undecided = flags.filter((f) => !decisions[String(f.rowNumber)])
  const skipped = new Set(flags.filter((f) => decisions[String(f.rowNumber)] === 'SKIP').map((f) => f.rowNumber))

  const count = (s: string) => classified.filter((r) => r.status === s).length
  const summary = {
    totalRecords: classified.length,
    toImport: importable.filter((r) => !skipped.has(r.rowNumber)).length,
    duplicates: count('DUPLICATE'),
    invalid: count('INVALID'),
    conflicts: count('CONFLICT'),
    needsReview: flags.length,
    skippedAsSamePerson: skipped.size,
  }

  if (!parsed.data.commit) return json({ summary, rows: classified, flags, committed: false })
  if (undecided.length) return jsonError(400, `Confirm the ${undecided.length} possible duplicate(s) before importing`)

  // Bulk inserts keep large rosters well inside function time limits. Preview already resolved duplicates and conflicts.
  const toEnroll = importable.filter((r) => !skipped.has(r.rowNumber))
  const newPeople = toEnroll.filter((r) => r.status === 'NEW')
  if (toEnroll.length) {
    await transaction(async (q) => {
      const created = newPeople.length
        ? ((await q(
            `INSERT INTO participants (full_name, phone_number, registration_number)
             SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
             RETURNING id, registration_number AS "registrationNumber"`,
            [newPeople.map((r) => r.fullName), newPeople.map((r) => r.phoneNumber), newPeople.map((r) => r.registrationNumber)],
          )) as { id: string; registrationNumber: string }[])
        : []
      const idByReg = new Map(created.map((c) => [c.registrationNumber, c.id]))
      for (const r of toEnroll) if (r.status === 'EXISTING') idByReg.set(r.registrationNumber, known.get(r.registrationNumber)!.id)
      await q(
        `INSERT INTO class_enrollments (participant_id, class_id, attendance_mode)
         SELECT u.pid, $1::bigint, u.mode FROM unnest($2::bigint[], $3::text[]) AS u(pid, mode)`,
        [classId, toEnroll.map((r) => idByReg.get(r.registrationNumber)), toEnroll.map((r) => r.attendanceMode)],
      )
    })
  }
  await logActivity({
    userId: actor.id,
    action: 'PARTICIPANTS_IMPORTED',
    entityType: 'PARTICIPANT',
    entityId: classId,
    description: `Imported ${summary.toImport} participants into class ${classId} (${summary.duplicates} duplicates, ${summary.invalid} invalid, ${summary.conflicts} conflicts skipped)`,
    newValues: summary,
  })
  return json({ summary, committed: true })
}

// Routes under /api/participants (person records and the all-classes list)
export async function participants(req: Request, user: SessionUser | null, segments: string[], url: URL) {
  if (segments.length === 0 && req.method === 'GET') return listEnrollments(user, url, url.searchParams.get('classId') ? Number(url.searchParams.get('classId')) : null)

  const id = Number(segments[0])
  if (!Number.isInteger(id)) return jsonError(404, 'Not found')

  if (segments.length === 1 && req.method === 'GET') {
    const [person] = await query(
      `SELECT id, full_name AS "fullName", phone_number AS "phoneNumber", registration_number AS "registrationNumber" FROM participants WHERE id = $1`,
      [id],
    )
    if (!person) return jsonError(404, 'Participant not found')
    return json({ participant: hidePhone(person, user) })
  }

  const denied = requireAdmin(user)
  if (denied) return denied
  const actor = user as SessionUser

  if (segments.length === 1 && req.method === 'PUT') {
    const parsed = editPersonSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    const [before] = await query(`SELECT full_name AS "fullName", phone_number AS "phoneNumber", registration_number AS "registrationNumber" FROM participants WHERE id = $1`, [id])
    if (!before) return jsonError(404, 'Participant not found')
    const v = parsed.data
    await query(`UPDATE participants SET full_name = $1, phone_number = $2, registration_number = $3, updated_at = now() WHERE id = $4`, [v.fullName, v.phoneNumber, v.registrationNumber, id])
    await logActivity({ userId: actor.id, action: 'PARTICIPANT_UPDATED', entityType: 'PARTICIPANT', entityId: id, description: `Updated ${v.fullName}`, oldValues: before, newValues: v })
    const [person] = await query(`SELECT id, full_name AS "fullName", phone_number AS "phoneNumber", registration_number AS "registrationNumber" FROM participants WHERE id = $1`, [id])
    return json({ participant: person })
  }

  return jsonError(404, 'Not found')
}

// Routes under /api/enrollments/:id (a person's place in one class)
export async function enrollments(req: Request, user: SessionUser | null, enrollmentId: number, rest: string[]) {
  const denied = requireAdmin(user)
  if (denied) return denied
  const actor = user as SessionUser

  const [before] = await query(`${ENROLLMENT_SELECT} WHERE enrollment_id = $1`, [enrollmentId])
  if (!before) return jsonError(404, 'Enrollment not found')

  if (req.method === 'PUT' && rest.length === 0) {
    const parsed = editEnrollmentSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, parsed.error.issues[0].message)
    await query(`UPDATE class_enrollments SET attendance_mode = $1, updated_at = now() WHERE id = $2`, [parsed.data.attendanceMode, enrollmentId])
    const [after] = await query(`${ENROLLMENT_SELECT} WHERE enrollment_id = $1`, [enrollmentId])
    await logActivity({ userId: actor.id, action: 'ENROLLMENT_UPDATED', entityType: 'PARTICIPANT', entityId: before.participantId, description: `Changed attendance for ${before.fullName} in ${before.className}`, oldValues: { attendanceMode: before.attendanceMode }, newValues: { attendanceMode: after.attendanceMode } })
    return json({ participant: after })
  }

  // Assigns an unassigned participant to a group, or removes them from their group (groupId null).
  // Moving someone straight from one group to another is a transfer (Phase 6).
  if (req.method === 'PATCH' && rest.length === 1 && rest[0] === 'group') {
    const parsed = assignSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'Choose a group, or remove the participant from their group')
    const groupId = parsed.data.groupId

    if (groupId === null) {
      if (!before.groupId) return jsonError(409, `${before.fullName} is not in a group`)
      await query(`UPDATE class_enrollments SET group_id = NULL, updated_at = now() WHERE id = $1`, [enrollmentId])
      const [after] = await query(`${ENROLLMENT_SELECT} WHERE enrollment_id = $1`, [enrollmentId])
      await logActivity({ userId: actor.id, action: 'PARTICIPANT_UNASSIGNED', entityType: 'PARTICIPANT', entityId: before.participantId, description: `Removed ${before.fullName} from ${before.groupName}`, oldValues: { groupId: before.groupId }, newValues: { groupId: null } })
      return json({ participant: after })
    }

    if (before.groupId) return jsonError(409, `${before.fullName} is already in ${before.groupName}. Use Move to change groups.`)
    await query(`UPDATE class_enrollments SET group_id = $1, updated_at = now() WHERE id = $2`, [groupId, enrollmentId])
    const [after] = await query(`${ENROLLMENT_SELECT} WHERE enrollment_id = $1`, [enrollmentId])
    await logActivity({ userId: actor.id, action: 'PARTICIPANT_ASSIGNED', entityType: 'PARTICIPANT', entityId: before.participantId, description: `Assigned ${before.fullName} to ${after.groupName}`, oldValues: { groupId: null }, newValues: { groupId } })
    return json({ participant: after })
  }

  return jsonError(404, 'Not found')
}
