import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@components/Layout'
import { SnackbarProvider } from '@components/Snackbar'
import { loadConfig, isAdmin } from '@apps/utils'
import Dashboard from '@apps/pages/Dashboard'
import Tasks from '@apps/pages/Tasks'
import Points from '@apps/pages/Points'
import Exchanges from '@apps/pages/Exchanges'
import Options from '@apps/pages/Options'
import Borrow from '@apps/pages/Borrow'
import VideoPlayer from '@apps/pages/VideoPlayer'
import TVFav from '@apps/pages/TVFav'
import AIUsage from '@apps/pages/AIUsage'
import RssReader from '@apps/pages/RssReader'
import Weekly from '@apps/pages/Weekly'
import '@apps/styles/index.css'

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
                <Route path="borrow" element={<Borrow />} />
                <Route path="rss" element={<RssReader />} />
                <Route path="weekly" element={<Weekly />} />
                <Route path="tv/fav" element={<TVFav />} />
                <Route path="tv/:md5" element={<VideoPlayer />} />
                <Route path="tv" element={<VideoPlayer />} />
                {isAdmin() && <Route path="options" element={<Options />} />}
                <Route path="usage" element={<AIUsage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    </SnackbarProvider>
)

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
