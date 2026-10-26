/**
 * 应用布局组件：渲染导航（管理员身份下追加配置入口）、随机学习格言与页面内容出口。
 * 复用约定：导航项为模块内常量，格言经 quotesApi 获取并回落 defaultQuotes，
 * 管理员判定复用 @apps/utils/client 的 isAdmin。
 * 关键约束：NavLink 的 className 回调参数须显式标注类型——react-router v7 下该联合类型
 * 无法自动推导出参数类型，strict 模式会报 TS7031（隐式 any）。
 * 响应式：lg 及以上为左侧固定导航；小屏收为顶部栏 + 抽屉菜单，抽屉开关状态由本组件持有。
 */
import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
    GraduationCap,
    LayoutGrid,
    ClipboardList,
    Database,
    ArrowLeftRight,
    HandCoins,
    SlidersHorizontal,
    Bot,
    BookOpen,
    NotebookPen,
    PenTool,
    X,
} from 'lucide-react'
import { quotesApi } from '@apps/services'
import { defaultQuotes } from '@shared/constants'
import { isAdmin } from '@apps/utils/client'

const baseNavItems = [
    { to: '/', label: '首页看板', icon: LayoutGrid },
    { to: '/weekly', label: '学习周报', icon: NotebookPen },
    { to: '/tasks', label: '作业管理', icon: ClipboardList },
    { to: '/study', label: '学习管理', icon: GraduationCap },
    { to: '/library', label: '本地题目', icon: BookOpen },
    { to: '/handwriting', label: '每日练字', icon: PenTool },
    { to: '/points', label: '积分记录', icon: Database },
    { to: '/exchanges', label: '兑换记录', icon: ArrowLeftRight },
    { to: '/borrow', label: '积分预支', icon: HandCoins },
    { to: '/usage', label: 'AI使用量', icon: Bot },
]

const adminNavItems = [
    { to: '/options', label: '配置选项', icon: SlidersHorizontal },
]

function getRandomQuote(quotes: string[]): string {
    return quotes[Math.floor(Math.random() * quotes.length)]
}

export const Layout: React.FC = () => {
    const [quotes, setQuotes] = useState<string[]>(defaultQuotes as string[])
    const [quote, setQuote] = useState('')
    const [isAdminUser, setIsAdminUser] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    useEffect(() => {
        setIsAdminUser(isAdmin())
        quotesApi.get().then((data) => {
            setQuotes(Array.isArray(data) ? data : defaultQuotes)
        })
    }, [])

    useEffect(() => {
        setQuote(getRandomQuote(quotes))
        const timer = setInterval(() => {
            setQuote(getRandomQuote(quotes))
        }, 30000)
        return () => clearInterval(timer)
    }, [quotes])

    const navItems = [...baseNavItems, ...(isAdminUser ? adminNavItems : [])]
    const closeSidebar = () => setIsSidebarOpen(false)

    return (
        <div className="min-h-screen bg-background">
            {/* 小屏顶部栏：品牌 + 格言 + 菜单按钮 */}
            <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-16 bg-sidebar border-b border-gray-800">
                <GraduationCap
                    className="w-7 h-7 shrink-0 text-background"
                    strokeWidth={2}
                />
                <span className="sr-only">学迹PLUS</span>
                <p className="flex-1 min-w-0 truncate text-sm text-sidebar-link leading-relaxed">
                    {quote}
                </p>
                <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    aria-label="打开导航菜单"
                    aria-expanded={isSidebarOpen}
                    className="shrink-0 p-2 rounded-lg text-sidebar-link transition-colors duration-200 hover:bg-sidebar-hover hover:text-background">
                    <LayoutGrid className="size-6" strokeWidth={1.5} />
                </button>
            </header>

            {/* 小屏抽屉遮罩 */}
            {isSidebarOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/40"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            {/* 侧边栏：大屏常驻，小屏抽屉 */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-56 flex flex-col bg-sidebar transition-transform duration-300 lg:translate-x-0 ${
                    isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}>
                {/* 品牌区仅大屏展示，小屏抽屉只留导航列表 */}
                <div className="hidden lg:flex items-center gap-3 p-5 border-b border-gray-800">
                    <h1 className="text-background">
                        <GraduationCap className="w-7 h-7" strokeWidth={2} />
                        <span className="sr-only">学迹PLUS</span>
                    </h1>
                    <div className="flex items-center h-10 text-sm text-sidebar-link leading-relaxed">
                        {quote}
                    </div>
                </div>
                {/* 小屏抽屉的关闭按钮，置于导航列表之上 */}
                <div className="lg:hidden flex justify-end px-3 pt-3">
                    <button
                        type="button"
                        onClick={closeSidebar}
                        aria-label="关闭导航菜单"
                        className="p-2 rounded-lg text-sidebar-link transition-colors duration-200 hover:bg-sidebar-hover hover:text-background">
                        <X className="size-6" strokeWidth={1.5} />
                    </button>
                </div>
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            onClick={closeSidebar}
                            className={({ isActive }: { isActive: boolean }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isActive
                                        ? 'bg-primary text-background hover:bg-primary-foreground'
                                        : 'text-sidebar-link hover:bg-sidebar-hover hover:text-background'
                                }`
                            }>
                            <item.icon
                                className="size-5 shrink-0"
                                strokeWidth={1.5}
                            />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* 主内容：大屏让出侧边栏宽度 */}
            <main className="p-6 lg:ml-56">
                <Outlet />
            </main>
        </div>
    )
}
