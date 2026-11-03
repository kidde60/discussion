import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import RequireAuth from './components/common/RequireAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Classes from './pages/Classes'
import ClassDetails from './pages/ClassDetails'
import Groups from './pages/Groups'
import GroupDetails from './pages/GroupDetails'
import Participants from './pages/Participants'
import Users from './pages/Users'
import ActivityLogs from './pages/ActivityLogs'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/classes/:classId" element={<ClassDetails />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:groupId" element={<GroupDetails />} />
        <Route path="/participants" element={<Participants />} />
        <Route element={<RequireAuth roles={['ADMIN']} />}>
          <Route path="/users" element={<Users />} />
          <Route path="/activity-logs" element={<ActivityLogs />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
