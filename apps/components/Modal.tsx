import React from 'react'
import { X, LoaderCircle } from 'lucide-react'

export interface ModalProps {
    open: boolean
    onCancel: () => void
    onConfirm?: () => void | Promise<void>
    isLoading?: boolean
    isDisabled?: boolean
    title?: string
    children: React.ReactNode
    danger?: boolean
    confirmLabel?: string
    confirmIcon?: React.ReactNode
}

/** 默认的保存中图标：使用 LoaderCircle 并添加旋转动画 */
const DefaultConfirmIcon = () => (
    <LoaderCircle className="animate-spin h-4 w-4" />
)

const Modal: React.FC<ModalProps> = ({
    open,
    onCancel,
    onConfirm,
    isLoading = false,
    isDisabled = false,
    title = '',
    children,
    danger,
    confirmLabel = '保存更改',
    confirmIcon = <DefaultConfirmIcon />,
}) => {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="space-y-4 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3>{title}</h3>
                        <button
                            onClick={onCancel}
                            className="text-gray-600 hover:text-gray-900">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-4">{children}</div>
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                        <button onClick={onCancel} className="btn-outline">
                            取消
                        </button>
                        {onConfirm && (
                            <button
                                onClick={onConfirm}
                                disabled={isDisabled}
                                className={
                                    danger ? 'btn-danger' : 'btn-primary'
                                }>
                                {isLoading ? confirmIcon : confirmLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Modal
