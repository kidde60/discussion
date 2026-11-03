import { useQuery } from '@tanstack/react-query'
import { Alert, Spin, Tag } from 'antd'
import PlaceholderPage from '../components/common/PlaceholderPage'
import { getHealth } from '../services/api'

export default function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth })

  return (
    <PlaceholderPage title="Dashboard" description="Summary statistics arrive in Phase 7.">
      {health.isLoading && <Spin />}
      {health.data && (
        <Alert
          type={health.data.ok ? 'success' : 'error'}
          showIcon
          message={<>Database <Tag color={health.data.ok ? 'green' : 'red'}>{health.data.database}</Tag></>}
        />
      )}
      {health.isError && <Alert type="error" showIcon message="Could not reach the API" description={health.error.message} />}
    </PlaceholderPage>
  )
}
