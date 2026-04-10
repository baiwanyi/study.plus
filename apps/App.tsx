import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { SnackbarProvider } from './components/Snackbar'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Points from './pages/Points'
import Exchanges from './pages/Exchanges'
import Rules from './pages/Rules'
import AIUsage from './pages/AIUsage'

export default function App() {
  return (
    <SnackbarProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="points" element={<Points />} />
          <Route path="exchanges" element={<Exchanges />} />
          <Route path="rules" element={<Rules />} />
          <Route path="usage" element={<AIUsage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SnackbarProvider>
  )
}
