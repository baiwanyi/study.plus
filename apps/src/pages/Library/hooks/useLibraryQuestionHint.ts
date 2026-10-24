/**
 * 单道小题解题思路 Hook：管理思路正文、展开状态、加载态与错误，支持「换一种思路」重新生成。
 * 复用 libraryApi.hint（只提交路径与小题索引，题干由服务端读取，生成后写回题目文件），
 * 初始内容来自题目文件中已保存的思路区，因此二次进入页面无需重新请求。
 * 关键约束：同一时刻只允许一个请求在飞，重新生成前先中止上一个；组件卸载必须 abort 且不再回写状态；
 * 重新生成失败时保留上一次的可用思路，避免已经看到的引导被清空。
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { libraryApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'

export interface UseLibraryQuestionHintResult {
    /** 思路 Markdown 正文；空串表示尚未生成 */
    hint: string
    /** 面板是否展开 */
    isOpen: boolean
    isLoading: boolean
    error: string
    /** 最近一次结果是否成功写入题目文件 */
    isSaved: boolean
    /** 展开：已有内容直接展开，没有则发起首次生成 */
    open: () => void
    /** 收起面板（内容保留，再次展开不再请求） */
    close: () => void
    /** 生成思路：isRegenerate 为真时要求换一种切入角度并覆盖已保存内容 */
    request: (isRegenerate: boolean) => void
}

export function useLibraryQuestionHint(
    relPath: string,
    questionIndex: number,
    initialHint: string,
): UseLibraryQuestionHintResult {
    const [hint, setHint] = useState(initialHint)
    const [isOpen, setIsOpen] = useState(initialHint !== '')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [isSaved, setIsSaved] = useState(true)
    const controllerRef = useRef<AbortController | null>(null)

    useEffect(
        () => () => {
            controllerRef.current?.abort()
        },
        [],
    )

    const request = useCallback(
        (isRegenerate: boolean) => {
            controllerRef.current?.abort()
            const controller = new AbortController()
            controllerRef.current = controller
            setIsOpen(true)
            setIsLoading(true)
            setError('')
            libraryApi
                .hint(relPath, questionIndex, isRegenerate, controller.signal)
                .then((data) => {
                    if (controller.signal.aborted) return
                    setHint(data.hint)
                    setIsSaved(data.saved)
                })
                .catch((err: unknown) => {
                    if (controller.signal.aborted) return
                    setError(formatErrorMessage(err))
                })
                .finally(() => {
                    if (controller.signal.aborted) return
                    setIsLoading(false)
                })
        },
        [relPath, questionIndex],
    )

    const open = useCallback(() => {
        if (hint !== '') {
            setIsOpen(true)
            return
        }
        request(false)
    }, [hint, request])

    const close = useCallback(() => {
        controllerRef.current?.abort()
        setIsOpen(false)
        setError('')
        setIsLoading(false)
    }, [])

    return { hint, isOpen, isLoading, error, isSaved, open, close, request }
}
