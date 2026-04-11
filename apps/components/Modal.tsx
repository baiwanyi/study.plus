import React from 'react'
import { X, LoaderCircle } from 'lucide-react'

export interface ModalProps {
    open: boolean
    onClose: () => void
    onSave?: () => void | Promise<void>
    isSaving?: boolean
    title?: string
    children: React.ReactNode
    footer?: React.ReactNode
    saveText?: string
    savingIcon?: React.ReactNode
}

/** 默认的保存中图标：使用 LoaderCircle 并添加旋转动画 */
const DefaultSavingIcon = () => (
    <LoaderCircle className="animate-spin h-4 w-4" />
)

const Modal: React.FC<ModalProps> = ({
    open,
    onClose,
    onSave,
    isSaving = false,
    title = '编辑作业',
    children,
    footer,
    saveText = '保存',
    savingIcon = <DefaultSavingIcon />,
}) => {
    if (!open) return null

    const defaultFooter = (
        <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-outline">
                取消
            </button>
            {onSave && (
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="btn-primary">
                    {isSaving ? savingIcon : saveText}
                </button>
            )}
        </div>
    )

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-4">{children}</div>
                    {footer !== undefined ? footer : defaultFooter}
                </div>
            </div>
        </div>
    )
}

export default Modal
