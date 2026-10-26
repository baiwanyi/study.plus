/**
 * 字体清单 Hook：聚合项目内置字体与本机系统字体两类来源，供字帖下拉选择。
 * 复用约定：内置字体清单由 apps/plugins/handwriting-fonts.ts 扫描 public/fonts 生成（virtual:handwriting-fonts），
 * 由 ensureFont 按需用 FontFace 搭配 BASE_URL 加载，选中哪个才下载哪个，避免首屏拉取全部字体文件；
 * 系统字体先列候选表，queryLocalFonts 授权后替换为完整列表，该 API 不可用时用 canvas measureText 与 monospace
 * 基准宽度比对，筛出真实安装的字体。
 * 关键约束：queryLocalFonts 必须由用户手势触发，自动调用抛 SecurityError，故不进初始加载；
 * 探测结果按 family 去重并保持候选表顺序（楷体始终靠前）；同一内置字体并发请求只发一次，
 * 失败时清掉在途标记以便下次重试，单款字体不可用只回落 serif，不影响其它字体；
 * 局域网 http 不是安全上下文，需单独标记以便提示改用 localhost 或 https。
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { builtinFonts } from 'virtual:handwriting-fonts'
import { handwritingFontCandidates } from '@shared/handwriting'

/** queryLocalFonts 返回项的可用字段（浏览器未内置该类型，此处按实际返回声明） */
interface LocalFontData {
    family: string
    fullName: string
    postscriptName: string
    style: string
}

type QueryLocalFontsFn = () => Promise<LocalFontData[]>

interface UseLocalFontsResult {
    fonts: string[]
    isSupported: boolean
    isInsecureContext: boolean
    isLoading: boolean
    error: string
    requestAll: () => void
    /** 按需加载内置字体；族名不在内置清单、加载中或已就绪时为空操作 */
    ensureFont: (family: string) => void
}

/** 探测用样字：同时覆盖汉字、西文与数字，提高不同字体的宽度区分度 */
const probeSample = '永字八法练字帖Wg8'

/** 候选字体名列表，模块级常量，供探测与回落共用 */
const fontCandidates = handwritingFontCandidates.map((item) => item.family)

/** 取 navigator.queryLocalFonts；不支持或非安全上下文时返回 null */
function resolveQueryLocalFonts(): QueryLocalFontsFn | null {
    if (!window.isSecureContext) return null
    const navigatorWithFonts = navigator as Navigator & {
        queryLocalFonts?: QueryLocalFontsFn
    }
    if (typeof navigatorWithFonts.queryLocalFonts !== 'function') return null
    return navigatorWithFonts.queryLocalFonts.bind(navigatorWithFonts)
}

/** 用 canvas 比对字体渲染宽度，判断候选字体是否真实安装 */
function detectInstalledFonts(families: string[]): string[] {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return []
    context.font = '72px monospace'
    const baselineWidth = context.measureText(probeSample).width
    return families.filter((family) => {
        context.font = `72px "${family}", monospace`
        return Math.abs(context.measureText(probeSample).width - baselineWidth) > 0.5
    })
}

export function useLocalFonts(): UseLocalFontsResult {
    const [fonts, setFonts] = useState<string[]>(fontCandidates)
    const [isSupported, setIsSupported] = useState(false)
    const [isInsecureContext, setIsInsecureContext] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const queryRef = useRef<QueryLocalFontsFn | null>(null)
    /** 已注册进 document.fonts 的内置字体族名 */
    const loadedRef = useRef(new Set<string>())
    /** 在途的内置字体族名，防止同一族名并发重复下载 */
    const loadingRef = useRef(new Set<string>())

    useEffect(() => {
        queryRef.current = resolveQueryLocalFonts()
        setIsSupported(queryRef.current !== null)
        setIsInsecureContext(!window.isSecureContext)
        const installed = detectInstalledFonts(fontCandidates)
        // 一个都没探测到时保留候选表，交由 CSS 回落，避免下拉框为空
        if (installed.length > 0) setFonts(installed)
    }, [])

    // 字体文件随站点分发，注册进 document.fonts 后才能参与排版与打印
    const ensureFont = useCallback((family: string) => {
        const builtin = builtinFonts.find((font) => font.family === family)
        if (!builtin) return
        if (loadedRef.current.has(family) || loadingRef.current.has(family)) {
            return
        }
        loadingRef.current.add(family)
        const url = `${import.meta.env.BASE_URL}${encodeURI(builtin.file)}`
        void (async () => {
            try {
                const face = new FontFace(family, `url("${url}")`)
                await face.load()
                document.fonts.add(face)
                loadedRef.current.add(family)
            } catch {
                // 文件缺失或格式不支持：清掉在途标记允许下次重试，渲染回落到 serif
            } finally {
                loadingRef.current.delete(family)
            }
        })()
    }, [])

    const requestAll = useCallback(() => {
        const query = queryRef.current
        if (!query) return
        setIsLoading(true)
        setError('')
        query()
            .then((data) => {
                const families = Array.from(
                    new Set(data.map((item) => item.family).filter(Boolean)),
                ).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
                if (families.length > 0) setFonts(families)
            })
            .catch(() => {
                setError('读取本地字体被拒绝，可改用候选字体列表')
            })
            .finally(() => setIsLoading(false))
    }, [])

    return {
        fonts,
        isSupported,
        isInsecureContext,
        isLoading,
        error,
        requestAll,
        ensureFont,
    }
}
