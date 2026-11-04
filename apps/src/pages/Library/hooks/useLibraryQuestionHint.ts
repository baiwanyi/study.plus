/**
 * 单道小题解题思路 Hook：管理思路正文、加载态与错误，支持「换一种思路」重新生成。
 * 复用 libraryApi.hint（只提交路径与小题索引，题干由服务端读取，生成后写回题目文件），
 * 初始内容来自题目文件中已保存的思路区，因此二次进入页面无需重新请求。
 * 展开状态由页面受控传入（同时只展开一道小题），本 Hook 只负责按展开态取数与中止请求。
 * 关键约束：同一时刻只允许一个请求在飞，重新生成前先中止上一个；收起与卸载都必须 abort 且不再回写状态；
 * 重新生成失败时保留上一次的可用思路，避免已经看到的引导被清空；空思路仅在展开时自动请求一次。
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { libraryApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'

export interface UseLibraryQuestionHintResult {
    /** 思路 Markdown 正文；空串表示尚未生成 */
    hint: string
    isLoading: boolean
    error: string
    /** 最近一次结果是否成功写入题目文件 */
    isSaved: boolean
    /** 生成思路：isRegenerate 为真时要求换一种切入角度并覆盖已保存内容 */
    request: (isRegenerate: boolean) => void
}

export function useLibraryQuestionHint(
    relPath: string,
    questionIndex: number,
    initialHint: string,
    isOpen: boolean,
): UseLibraryQuestionHintResult {
    const [hint, setHint] = useState(initialHint)
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

    // 收起即中止在飞请求：面板已不可见，结果无需回写，也避免为看不见的思路继续生成
    useEffect(() => {
        if (isOpen) return
        controllerRef.current?.abort()
        controllerRef.current = null
        setError('')
        setIsLoading(false)
    }, [isOpen])

    // 展开时若尚无思路则自动生成一次；已有内容（含文件中已保存的思路）直接展示，不再请求
    useEffect(() => {
        if (!isOpen || hint !== '') return
        request(false)
    }, [isOpen, hint, request])

    return { hint, isLoading, error, isSaved, request }
}
