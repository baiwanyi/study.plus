export interface TabItem<T extends string = string> {
    key: T
    label: string
}

export interface TabsProps<T extends string = string> {
    tabs: TabItem<T>[]
    active: T
    onChange: (key: T) => void
}

export default function Tabs<T extends string = string>({
    tabs,
    active,
    onChange,
}: TabsProps<T>) {
    return (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onChange(tab.key)}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                        active === tab.key
                            ? 'bg-white text-primary-700 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                    }`}>
                    {tab.label}
                </button>
            ))}
        </div>
    )
}
