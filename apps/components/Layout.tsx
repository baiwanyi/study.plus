import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
    GraduationCap,
    LayoutGrid,
    ClipboardList,
    Database,
    ArrowLeftRight,
    SlidersHorizontal,
    Bot,
} from 'lucide-react'
import quotes from '../../data/quotes.json'

const navItems = [
    { to: '/', label: '首页看板', icon: LayoutGrid },
    { to: '/tasks', label: '作业管理', icon: ClipboardList },
    { to: '/points', label: '积分记录', icon: Database },
    { to: '/exchanges', label: '兑换记录', icon: ArrowLeftRight },
    { to: '/rules', label: '规则配置', icon: SlidersHorizontal },
    { to: '/usage', label: 'AI使用量', icon: Bot },
]

function getRandomQuote(): string {
    return quotes[Math.floor(Math.random() * quotes.length)]
}

export default function Layout() {
    const [quote, setQuote] = useState(getRandomQuote)

    useEffect(() => {
        const timer = setInterval(() => {
            setQuote(getRandomQuote())
        }, 30000)
        return () => clearInterval(timer)
    }, [])
    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Sidebar */}
            <aside className="w-56 bg-white border-r border-gray-200 flex flex-col fixed h-full">
                <div className="flex items-center gap-3 p-5 border-b border-gray-100">
                    <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
                        <GraduationCap className="w-7 h-7" strokeWidth={2} />
                        <span className='sr-only'>学迹PLUS</span>
                    </h1>
                    <div className="flex items-center h-10 text-sm text-gray-700 leading-relaxed">{quote}</div>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isActive
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`
                            }>
                            <item.icon
                                className="w-5 h-5 flex-shrink-0"
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
