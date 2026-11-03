import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Space, Statistic, Row, Col, Select, Table, Tag, Typography, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import { api, ApiError } from '../../services/api'
import type { ImportRow, ImportSummary } from '../../types/participants'

type Props = {
  classOptions: { value: string; label: string }[]
  defaultClassId: string | null
  onClose: () => void
  onDone: () => void
}

type ImportResult = { summary: ImportSummary; rows: ImportRow[]; committed: boolean }

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

  const run = useMutation({
    mutationFn: async (commit: boolean) => {
      if (!classId || !file) throw new ApiError(400, 'Choose a class and a file')
      return api<ImportResult>(`/classes/${classId}/participants/import`, { body: { fileBase64: await fileToBase64(file), commit } })
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
    onClose()
  }

  const summary = result?.summary
  const problemRows = result?.rows.filter((r) => r.status === 'INVALID' || r.status === 'CONFLICT' || r.status === 'DUPLICATE') ?? []

  return (
    <Space direction="vertical" className="w-full" size="middle">
      <Typography.Paragraph type="secondary" className="!mb-0">
        Upload an Excel (.xlsx) file with columns for full name, phone number, registration number and attendance mode (Online or Physical). Preview shows what would change before anything is saved.
      </Typography.Paragraph>
      <Select
        className="w-full"
        placeholder="Choose the class to import into"
        value={classId}
        onChange={(v) => { setClassId(v); setResult(null) }}
        options={classOptions}
      />
      <Upload
        accept=".xlsx"
        maxCount={1}
        beforeUpload={(f) => { setFile(f); setResult(null); return false }}
        onRemove={() => { setFile(null); setResult(null) }}
        fileList={file ? [{ uid: '1', name: file.name, status: 'done' } as UploadFile] : []}
      >
        <Button>Choose .xlsx file</Button>
      </Upload>
      <Space>
        <Button onClick={() => run.mutate(false)} disabled={!classId || !file} loading={run.isPending && run.variables === false}>Preview</Button>
        <Button type="primary" onClick={() => run.mutate(true)} disabled={!result || result.committed || result.summary.toImport === 0} loading={run.isPending && run.variables === true}>
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
          {!result?.committed && problemRows.length > 0 && (
            <Alert type="warning" showIcon message="Some rows will be skipped. Fix them in the file and preview again if needed." />
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
