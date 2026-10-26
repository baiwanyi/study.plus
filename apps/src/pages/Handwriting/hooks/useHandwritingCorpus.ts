/**
 * 练字语料加载 Hook：并行拉取三份 Markdown 语料并解析为随机池。
 * 复用约定：解析与节选校验走 @shared/handwriting 的 parseHandwritingCorpus / filterPassageEntries，
 * 与 server 侧单测同源；资源路径基于 import.meta.env.BASE_URL，兼容部署在子路径的场景。
 * 关键约束：单个语料文件缺失不得拖垮整页，各自吞掉错误并回落空数组，只汇总告警文案；
 * 组件卸载后丢弃过期响应，避免重复进入页面时状态错乱。
 */
'use client'

import { useEffect, useState } from 'react'
import {
    filterPassageEntries,
    parseHandwritingCorpus,
    type HandwritingEntry,
} from '@shared/handwriting'

/** 语料文件位于 apps/public/handwriting，构建后随 dist 一起分发 */
const corpusFiles = {
    poem: 'handwriting/poems.md',
    textbook: 'handwriting/textbook.md',
    reading: 'handwriting/reading.md',
} as const

export type CorpusKind = keyof typeof corpusFiles

export type HandwritingCorpus = Record<CorpusKind, HandwritingEntry[]>

const emptyCorpus: HandwritingCorpus = {
    poem: [],
    textbook: [],
    reading: [],
}

interface UseHandwritingCorpusResult {
    corpus: HandwritingCorpus
    isLoading: boolean
    error: string
}

async function loadCorpus(kind: CorpusKind): Promise<HandwritingEntry[]> {
    const resource = `${import.meta.env.BASE_URL}${corpusFiles[kind]}`
    const response = await fetch(resource, { cache: 'no-cache' })
    if (!response.ok) {
        throw new Error(`语料 ${resource} 加载失败（${response.status}）`)
    }
    const entries = parseHandwritingCorpus(await response.text())
    // 古诗词不校验字数（整首必须完整），节选类不在 20–40 字范围的条目在此丢弃
    if (kind === 'poem') return entries
    const { entries: accepted, rejected } = filterPassageEntries(entries)
    if (rejected.length > 0) {
        console.warn(
            `[练字] ${corpusFiles[kind]} 有 ${rejected.length} 条节选不在 20–40 字范围已跳过：${rejected
                .map((entry) => `《${entry.title}》`)
                .join('、')}`,
        )
    }
    return accepted
}

export function useHandwritingCorpus(): UseHandwritingCorpusResult {
    const [corpus, setCorpus] = useState<HandwritingCorpus>(emptyCorpus)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        setIsLoading(true)
        setError('')

        const failures: string[] = []
        const load = (kind: CorpusKind) =>
            loadCorpus(kind).catch((reason: unknown) => {
                failures.push(
                    reason instanceof Error ? reason.message : String(reason),
                )
                return [] as HandwritingEntry[]
            })

        Promise.all([load('poem'), load('textbook'), load('reading')])
            .then(([poem, textbook, reading]) => {
                if (cancelled) return
                setCorpus({ poem, textbook, reading })
                if (failures.length > 0) setError(failures.join('；'))
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [])

    return { corpus, isLoading, error }
}
