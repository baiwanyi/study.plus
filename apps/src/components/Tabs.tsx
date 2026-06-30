'use client'

export interface TabItem<T extends string = string> {
    key: T
    label: string
}

export interface TabsProps<T extends string = string> {
    tabs: TabItem<T>[]
    active: T
    background?: 'white' | 'gray'
    /** 激活态的额外 class，默认 bg-primary text-white */
    activeClassName?: string
    onChange: (key: T) => void
}

export function Tabs<T extends string = string>({
    tabs,
    active,
    background = 'white',
    activeClassName = 'bg-primary text-white',
    onChange,
}: TabsProps<T>) {
    return (
        <div className={`flex items-center gap-1 ${background === 'gray' ? 'bg-gray-100' : 'bg-white'} rounded-lg p-1 w-full`}>
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onChange(tab.key)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${
                        active === tab.key
                            ? `${activeClassName} shadow-sm`
                            : 'text-gray-600 hover:text-gray-800'
                    }`}>
                {tab.label}
                </button>
            ))}
        </div>
    )
}
