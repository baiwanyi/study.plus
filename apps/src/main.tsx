import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@components/Layout'
import { SnackbarProvider } from '@components/Snackbar'
import { loadConfig, isAdmin } from '@apps/utils/client'
import { enableLogTimestamp } from '@apps/utils/logger'
import '@apps/styles/index.css'
import { Loading } from './components/Loading'

// 路由级代码分割：各页面独立 chunk，避免 12 个页面全部打进主包（主包 >500 kB 告警根源）。
// 页面均为命名导出（export function X），需映射为 default 供 React.lazy 使用
const Dashboard = lazy(() =>
    import('@apps/pages/Dashboard').then((m) => ({ default: m.Dashboard })),
)
const Tasks = lazy(() =>
    import('@apps/pages/Tasks').then((m) => ({ default: m.Tasks })),
)
const Points = lazy(() =>
    import('@apps/pages/Points').then((m) => ({ default: m.Points })),
)
const Exchanges = lazy(() =>
    import('@apps/pages/Exchanges').then((m) => ({ default: m.Exchanges })),
)
const Rules = lazy(() =>
    import('@apps/pages/Options').then((m) => ({ default: m.Rules })),
)
const Borrow = lazy(() =>
    import('@apps/pages/Borrow').then((m) => ({ default: m.Borrow })),
)
const AIUsage = lazy(() =>
    import('@apps/pages/AIUsage').then((m) => ({ default: m.AIUsage })),
)
const Library = lazy(() =>
    import('@apps/pages/Library').then((m) => ({ default: m.Library })),
)
const Studynotes = lazy(() =>
    import('@apps/pages/Study').then((m) => ({ default: m.Studynotes })),
)
const Weekly = lazy(() =>
    import('@apps/pages/Weekly').then((m) => ({ default: m.Weekly })),
)

// 统一为控制台输出注入「时间 + 级别」前缀，须在任何日志产生之前执行
enableLogTimestamp()

// Preload runtime config (DB overrides env defaults)
loadConfig()

const queryClient = new QueryClient()

const AppRoutes = () => (
    <SnackbarProvider>
        <Suspense fallback={<Loading />}>
            <Routes>
                <Route element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="tasks" element={<Tasks />} />
                    <Route path="points" element={<Points />} />
                    <Route path="exchanges" element={<Exchanges />} />
                    <Route path="borrow" element={<Borrow />} />
                    <Route path="library" element={<Library />} />
                    <Route path="study" element={<Studynotes />} />
                    <Route path="weekly" element={<Weekly />} />
                    {isAdmin() && <Route path="options" element={<Rules />} />}
                    <Route path="usage" element={<AIUsage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </Suspense>
    </SnackbarProvider>
)

const rootElement = document.getElementById('app')
if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <AppRoutes />
                </BrowserRouter>
            </QueryClientProvider>
        </StrictMode>,
    )
}
