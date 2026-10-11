/**
 * 本地题目状态 Hook：负责清单加载、当前文件定位、内容拉取与前后切换。
 * 复用 react-router 的 searchParams 作为「当前文件」的唯一真源（?file=相对路径），
 * 刷新与分享链接都能回到同一份题目，无需额外全局状态。
 * 关键约束：键盘左右键切换须避开输入控件（搜索框内不得触发翻页）；
 * file 参数失效（文件被删除）时回落首份；内容请求需防竞态，卸载后丢弃过期响应。
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { libraryApi } from '@apps/services'
import type { LibraryFileDetail, LibraryFileMeta } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'

export interface UseLibraryResult {
    dir: string
    exists: boolean
    files: LibraryFileMeta[]
    currentIndex: number
    detail: LibraryFileDetail | null
    listLoading: boolean
    detailLoading: boolean
    listError: string
    detailError: string
    selectFile: (path: string) => void
    goPrev: () => void
    goNext: () => void
    reload: () => void
}

export function useLibrary(): UseLibraryResult {
    const [searchParams, setSearchParams] = useSearchParams()
    const [files, setFiles] = useState<LibraryFileMeta[]>([])
    const [dir, setDir] = useState('')
    const [exists, setExists] = useState(true)
    const [listLoading, setListLoading] = useState(true)
    const [listError, setListError] = useState('')
    const [detail, setDetail] = useState<LibraryFileDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailError, setDetailError] = useState('')
    const [reloadToken, setReloadToken] = useState(0)

    const fileParam = searchParams.get('file') ?? ''

    useEffect(() => {
        let cancelled = false
        setListLoading(true)
        setListError('')
        libraryApi
            .list()
            .then((data) => {
                if (cancelled) return
                setDir(data.dir)
                setExists(data.exists)
                setFiles(Array.isArray(data.files) ? data.files : [])
            })
            .catch((err) => {
                if (cancelled) return
                setListError(formatErrorMessage(err))
            })
            .finally(() => {
                if (!cancelled) setListLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [reloadToken])

    const currentIndex = useMemo(
        () => files.findIndex((file) => file.path === fileParam),
        [files, fileParam],
    )

    // 未指定文件或该文件已不存在时，回落到首份并同步 URL（replace 不污染历史）
    useEffect(() => {
        if (listLoading || files.length === 0) return
        if (fileParam && currentIndex >= 0) return
        setSearchParams({ file: files[0].path }, { replace: true })
    }, [listLoading, files, fileParam, currentIndex, setSearchParams])

    useEffect(() => {
        if (!fileParam) {
            setDetail(null)
            return
        }
        let cancelled = false
        setDetailLoading(true)
        setDetailError('')
        libraryApi
            .content(fileParam)
            .then((data) => {
                if (!cancelled) setDetail(data)
            })
            .catch((err) => {
                if (cancelled) return
                setDetail(null)
                setDetailError(formatErrorMessage(err))
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [fileParam])

    const selectFile = useCallback(
        (target: string) => {
            setSearchParams({ file: target })
        },
        [setSearchParams],
    )

    const goBy = useCallback(
        (offset: number) => {
            setSearchParams((prev) => {
                const current = prev.get('file') ?? ''
                const index = files.findIndex((file) => file.path === current)
                const next = (index < 0 ? 0 : index) + offset
                if (next < 0 || next >= files.length) return prev
                const params = new URLSearchParams(prev)
                params.set('file', files[next].path)
                return params
            })
        },
        [files, setSearchParams],
    )

    const goPrev = useCallback(() => goBy(-1), [goBy])
    const goNext = useCallback(() => goBy(1), [goBy])
    const reload = useCallback(() => setReloadToken((token) => token + 1), [])

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
                return
            }
            const target = event.target as HTMLElement | null
            const tag = target?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
                return
            }
            if (event.key === 'ArrowLeft') {
                goPrev()
            } else if (event.key === 'ArrowRight') {
                goNext()
            }
        }
        window.addEventListener('keydown', handler)
        return () => {
            window.removeEventListener('keydown', handler)
        }
    }, [goPrev, goNext])

    return {
        dir,
        exists,
        files,
        currentIndex,
        detail,
        listLoading,
        detailLoading,
        listError,
        detailError,
        selectFile,
        goPrev,
        goNext,
        reload,
    }
}
