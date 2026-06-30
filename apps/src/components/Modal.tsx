'use client'

import { useEffect, type FC, type ReactNode } from 'react'
import { X, LoaderCircle } from 'lucide-react'

export interface ModalProps {
    open: boolean
    onCancel: () => void
    onConfirm?: () => void | Promise<void>
    isLoading?: boolean
    isDisabled?: boolean
    isScroll?: boolean
    title?: ReactNode
    children: ReactNode
    danger?: boolean
    footer?: boolean | ReactNode
    confirmLabel?: string
    confirmIcon?: ReactNode
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

/** 默认的保存中图标：使用 LoaderCircle 并添加旋转动画 */
const DefaultConfirmIcon = () => (
    <LoaderCircle className="animate-spin h-4 w-4" />
)

const sizeClasses: Record<string, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]',
}

export const Modal: FC<ModalProps> = ({
    open,
    onCancel,
    onConfirm,
    isLoading = false,
    isDisabled = false,
    isScroll = false,
    title = '',
    children,
    danger,
    footer = true,
    confirmLabel = '保存更改',
    confirmIcon = <DefaultConfirmIcon />,
    size = 'md',
}) => {
    useEffect(() => {
        if (isScroll && open) {
            document.body.classList.add('overflow-hidden')
        }
        return () => {
            document.body.classList.remove('overflow-hidden')
        }
    }, [isScroll, open])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="fixed left-0 inset-0 bg-black/50"
                onClick={onCancel}
            />
            <div
                className={`relative bg-white rounded-xl shadow-xl w-full ${sizeClasses[size]} mx-4 max-h-[90vh] flex flex-col`}>
                <header className="flex items-center justify-between px-6 pt-6 pb-0 shrink-0">
                    <h3>{title}</h3>
                    <button
                        onClick={onCancel}
                        className="text-gray-600 hover:text-gray-900">
                        <X className="size-5" />
                    </button>
                </header>
                <div
                    className={`flex-1 p-6 ${isScroll ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                    {children}
                </div>
                {footer !== false && (
                    <footer className="flex justify-end gap-3 px-6 pb-6 pt-3 border-t border-gray-200 shrink-0">
                        {typeof footer === 'object' ? (
                            footer
                        ) : (
                            <>
                                <button
                                    onClick={onCancel}
                                    className="btn btn-outline">
                                    取消
                                </button>
                                {onConfirm && (
                                    <button
                                        onClick={onConfirm}
                                        disabled={isDisabled}
                                        className={
                                            danger
                                                ? 'btn btn-danger'
                                                : 'btn btn-primary'
                                        }>
                                        {isLoading ? confirmIcon : confirmLabel}
                                    </button>
                                )}
                            </>
                        )}
                    </footer>
                )}
            </div>
        </div>
    )
}
