import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface RulesPageProps {
    title: string
    add?: () => void
    save: () => void
    disabled: boolean
    children: ReactNode
}

export function RulesPage({
    title,
    add,
    save,
    disabled,
    children,
}: RulesPageProps) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <div className="flex items-center gap-3">
                    {add && (
                        <button onClick={add} className="btn-outline">
                            <Plus className="w-4 h-4" />
                            <span className="sr-only">添加</span>
                        </button>
                    )}
                    <button
                        onClick={save}
                        disabled={disabled}
                        className="btn-primary">
                        {disabled ? '保存中...' : '保存更改'}
                    </button>
                </div>
            </div>
            {children}
        </div>
    )
}

export function RenderDeleteButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="text-red-500 hover:text-red-900 transition-colors">
            <Trash2 className="w-4 h-4" />
        </button>
    )
}

export function RenderInput({
    value,
    type = 'text',
    onChange,
    placeholder,
}: {
    value: string | number
    type?: 'text' | 'number'
    onChange: (value: string | number) => void
    placeholder?: string
}) {
    return (
        <input
            className="input"
            type={type}
            value={value}
            onChange={(e) =>
                onChange(type === 'number' ? Number(e.target.value) : e.target.value)
            }
            placeholder={placeholder}
        />
    )
}
