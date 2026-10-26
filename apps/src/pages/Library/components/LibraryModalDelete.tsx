/**
 * 删除题目确认弹窗：二次确认后删除题库目录下的文档或图片，删除不可恢复。
 * 复用 @components/Modal（danger 主题）承载确认交互、libraryApi.remove 发起请求，
 * formatErrorMessage 统一错误文案；文件信息（标题/路径）由调用方传入，组件不自行查表。
 * 关键约束：删除期间禁用确认按钮防止重复提交；失败只展示文案并保留弹窗，不改动列表状态；
 * 成功后由 onDeleted 交回被删路径，由页面刷新清单并在必要时切到下一份题目。
 */
'use client'

import { useState } from 'react'
import { libraryApi } from '@apps/services'
import type { LibraryFileMeta } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'
import { Modal } from '@components/Modal'

interface LibraryModalDeleteProps {
    /** 待删除文件；为 null 时弹窗关闭 */
    file: LibraryFileMeta | null
    onCancel: () => void
    /** 删除成功回调，参数为被删除文件的题库相对路径 */
    onDeleted: (path: string) => void
}

export function LibraryModalDelete({
    file,
    onCancel,
    onDeleted,
}: LibraryModalDeleteProps) {
    const [isDeleting, setIsDeleting] = useState(false)
    const [error, setError] = useState('')

    const handleCancel = () => {
        if (isDeleting) return
        setError('')
        onCancel()
    }

    const handleConfirm = async () => {
        if (!file || isDeleting) return
        setIsDeleting(true)
        setError('')
        try {
            await libraryApi.remove(file.path)
            onDeleted(file.path)
        } catch (err) {
            setError(formatErrorMessage(err))
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Modal
            open={file !== null}
            title="确认删除"
            size="sm"
            autoHeight
            danger
            isLoading={isDeleting}
            isDisabled={isDeleting}
            onCancel={handleCancel}
            onConfirm={handleConfirm}
            confirmLabel="删除">
            <div className="space-y-3">
                <p>
                    确定删除「{file?.title ?? ''}」吗？文件会从题库目录中移除，此操作不可撤销。
                </p>
                {file ? (
                    <p className="text-xs text-gray-500 break-all">
                        {file.path}
                    </p>
                ) : null}
                {error && <p className="text-sm text-danger">{error}</p>}
            </div>
        </Modal>
    )
}
