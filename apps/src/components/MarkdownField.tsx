'use client'

import MDEditor from '@uiw/react-md-editor'

export interface MarkdownFieldProps {
    label?: string
    value: string
    onChange: (val: string) => void
    placeholder?: string
}

export function MarkdownField({
    label = '',
    value,
    onChange,
    placeholder,
}: MarkdownFieldProps) {
    return (
        <div className="space-y-1">
            {label && (
                <label className="text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <div className="[&_.w-md-editor]:h-auto! [&_.w-md-editor-content]:h-auto! [&_.w-md-editor-text]:min-h-15!">
                <MDEditor
                    value={value}
                    onChange={(val: string | undefined) => onChange(val ?? '')}
                    preview="edit"
                    hideToolbar
                    textareaProps={{ placeholder }}
                />
            </div>
        </div>
    )
}
