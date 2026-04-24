import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@components/Layout'
import { SnackbarProvider } from '@components/Snackbar'
import { loadConfig, isAdmin } from '@apps/lib/utils'
import Dashboard from '@pages/Dashboard'
import Tasks from '@pages/Tasks'
import Points from '@pages/Points'
import Exchanges from '@pages/Exchanges'
import Options from '@pages/Options'
import AIUsage from '@pages/AIUsage'
import '@pages/index.css'

// Preload runtime config (DB overrides env defaults)
loadConfig()

const AppRoutes = () => (
    <SnackbarProvider>
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="points" element={<Points />} />
                <Route path="exchanges" element={<Exchanges />} />
                {isAdmin() && <Route path="options" element={<Options />} />}
                <Route path="usage" element={<AIUsage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    </SnackbarProvider>
)

// 获取根元素
const rootElement = document.getElementById('app')
if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </StrictMode>,
    )
}
