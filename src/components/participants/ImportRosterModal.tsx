import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Col, Radio, Row, Select, Space, Statistic, Table, Tag, Typography, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import { api, ApiError } from '../../services/api'
import type { ImportFlag, ImportRow, ImportSummary } from '../../types/participants'

type Props = {
  classOptions: { value: string; label: string }[]
  defaultClassId: string | null
  onClose: () => void
  onDone: () => void
}

type Decision = 'IMPORT' | 'SKIP'
type ImportResult = { summary: ImportSummary; rows: ImportRow[]; flags: ImportFlag[]; committed: boolean }

const STATUS_COLOR: Record<ImportRow['status'], string> = { NEW: 'green', EXISTING: 'blue', DUPLICATE: 'default', INVALID: 'red', CONFLICT: 'orange' }
const STATUS_LABEL: Record<ImportRow['status'], string> = { NEW: 'New', EXISTING: 'Existing person', DUPLICATE: 'Skipped (duplicate)', INVALID: 'Needs correction', CONFLICT: 'Conflict' }

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export default function ImportRosterModal({ classOptions, defaultClassId, onClose, onDone }: Props) {
  const [classId, setClassId] = useState<string | null>(defaultClassId)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})

  const run = useMutation({
    mutationFn: async (commit: boolean) => {
      if (!classId || !file) throw new ApiError(400, 'Choose a class and a file')
      const body = { fileBase64: await fileToBase64(file), commit, decisions: Object.fromEntries(Object.entries(decisions)) }
      return api<ImportResult>(`/classes/${classId}/participants/import`, { body })
    },
    onSuccess: (data, commit) => {
      setResult(data)
      if (commit) {
        message.success(`Imported ${data.summary.toImport} participants`)
        onDone()
      }
    },
    onError: (err) => message.error(err instanceof ApiError ? err.message : 'Could not read the file'),
  })

  const reset = () => {
    setFile(null)
    setResult(null)
    setDecisions({})
    onClose()
  }

  const summary = result?.summary
  const flags = result?.flags ?? []
  const undecided = flags.filter((f) => !decisions[f.rowNumber]).length
  const problemRows = result?.rows.filter((r) => r.status === 'INVALID' || r.status === 'CONFLICT' || r.status === 'DUPLICATE') ?? []

  return (
    <Space direction="vertical" className="w-full" size="middle">
      <Typography.Paragraph type="secondary" className="!mb-0">
        Upload an Excel (.xlsx) file with columns for full name, phone number, registration number and attendance mode. Preview shows what would change before anything is saved.
      </Typography.Paragraph>
      <Select
        className="w-full"
        placeholder="Choose the class to import into"
        value={classId}
        onChange={(v) => { setClassId(v); setResult(null); setDecisions({}) }}
        options={classOptions}
      />
      <Upload
        accept=".xlsx"
        maxCount={1}
        beforeUpload={(f) => { setFile(f); setResult(null); setDecisions({}); return false }}
        onRemove={() => { setFile(null); setResult(null); setDecisions({}) }}
        fileList={file ? [{ uid: '1', name: file.name, status: 'done' } as UploadFile] : []}
      >
        <Button>Choose .xlsx file</Button>
      </Upload>
      <Space>
        <Button onClick={() => { setDecisions({}); run.mutate(false) }} disabled={!classId || !file} loading={run.isPending && run.variables === false}>Preview</Button>
        <Button type="primary" onClick={() => run.mutate(true)} disabled={!result || result.committed || result.summary.toImport === 0 || undecided > 0} loading={run.isPending && run.variables === true}>
          Confirm import
        </Button>
        <Button onClick={reset}>Close</Button>
      </Space>

      {summary && (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={6}><Statistic title="Records" value={summary.totalRecords} /></Col>
            <Col xs={12} sm={6}><Statistic title={result?.committed ? 'Imported' : 'Will import'} value={summary.toImport} /></Col>
            <Col xs={12} sm={6}><Statistic title="Duplicates" value={summary.duplicates} /></Col>
            <Col xs={12} sm={6}><Statistic title="Need correction" value={summary.invalid + summary.conflicts} /></Col>
          </Row>
          {result?.committed && <Alert type="success" showIcon message="Import complete." />}

          {!result?.committed && flags.length > 0 && (
            <>
              <Alert
                type="warning"
                showIcon
                message={`${flags.length} row(s) look like someone already in the list or database. Confirm each one before importing.`}
                description={`${undecided} still need a decision. "Same person" leaves the row out. "Different person" imports it as a new participant.`}
              />
              <Table
                size="small"
                rowKey="rowNumber"
                pagination={false}
                dataSource={flags}
                columns={[
                  { title: 'Row', dataIndex: 'rowNumber', width: 70 },
                  { title: 'Name in file', dataIndex: 'fullName' },
                  { title: 'Registration', dataIndex: 'registrationNumber' },
                  {
                    title: 'Looks like',
                    key: 'match',
                    render: (_, f: ImportFlag) => (
                      <>
                        {f.matchName} <Typography.Text type="secondary">({f.matchRegistrationNumber})</Typography.Text>
                        {f.matchSource === 'SYSTEM' && <Tag className="ml-2">in database</Tag>}
                      </>
                    ),
                  },
                  {
                    title: 'Decision',
                    key: 'decision',
                    render: (_, f: ImportFlag) => (
                      <Radio.Group
                        size="small"
                        value={decisions[f.rowNumber]}
                        onChange={(e) => setDecisions({ ...decisions, [f.rowNumber]: e.target.value as Decision })}
                        options={[
                          { value: 'IMPORT', label: 'Different person' },
                          { value: 'SKIP', label: 'Same person' },
                        ]}
                        optionType="button"
                      />
                    ),
                  },
                ]}
              />
            </>
          )}

          {!result?.committed && problemRows.length > 0 && (
            <Alert type="info" showIcon message={`${problemRows.length} row(s) will be left out. Fix them in the file and preview again if needed.`} />
          )}
          <Table
            size="small"
            rowKey="rowNumber"
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            dataSource={result?.rows ?? []}
            columns={[
              { title: 'Row', dataIndex: 'rowNumber', width: 70 },
              { title: 'Name', dataIndex: 'fullName' },
              { title: 'Registration', dataIndex: 'registrationNumber' },
              { title: 'Attendance', dataIndex: 'attendanceMode' },
              { title: 'Status', dataIndex: 'status', render: (s: ImportRow['status']) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
              { title: 'Details', dataIndex: 'reason', render: (v: string | null) => v ?? '' },
            ]}
          />
        </>
      )}
    </Space>
  )
}
