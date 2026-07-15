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
    Tv,
    Rss,
    NotebookPen,
} from 'lucide-react'
import { quotesApi } from '@apps/utils/api'
import { defaultQuotes } from '@shared/constants'
import { isAdmin } from '@apps/utils/client'

const baseNavItems = [
    { to: '/', label: '首页看板', icon: LayoutGrid },
    { to: '/weekly', label: '学习周报', icon: NotebookPen },
    { to: '/tasks', label: '作业管理', icon: ClipboardList },
    { to: '/feynman', label: '学习心得', icon: GraduationCap },
    { to: '/points', label: '积分记录', icon: Database },
    { to: '/exchanges', label: '兑换记录', icon: ArrowLeftRight },
    { to: '/borrow', label: '积分预支', icon: HandCoins },
    { to: '/tv', label: '学迹电台', icon: Tv },
    { to: '/rss', label: 'RSS 阅读', icon: Rss },
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

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <aside className="w-56 bg-sidebar border-r border-gray-200 flex flex-col fixed h-full">
                <div className="flex items-center gap-3 p-5 border-b border-gray-800">
                    <h1 className="text-background">
                        <GraduationCap className="w-7 h-7" strokeWidth={2} />
                        <span className="sr-only">学迹PLUS</span>
                    </h1>
                    <div className="flex items-center h-10 text-sm text-sidebar-link leading-relaxed">
                        {quote}
                    </div>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                    {[
                        ...baseNavItems,
                        ...(isAdminUser ? adminNavItems : []),
                    ].map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) =>
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

            {/* Main Content */}
            <main className="flex-1 ml-56 p-6">
                <Outlet />
            </main>
        </div>
    )
}
