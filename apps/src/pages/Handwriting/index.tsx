/**
 * 每日练字页面：左侧字帖预览按容器宽度铺满，右侧为字帖设置，窄屏时设置面板收为按钮弹层。
 * 复用约定：排版与解析全部来自 @shared/handwriting 的纯函数，页面只维护选择状态；
 * 语料走 useHandwritingCorpus 拉取 Markdown；字体走 useLocalFonts，内置字体按需加载、系统字体靠候选表与授权探测，
 * 两者都只从清单里选，不接受手填字体名。
 * 关键约束：标点固定按规范占格（不提供切换）；方格、字体、字色、方格色、字号比例与方格线宽均持久化到
 * localStorage，读取值非法或越界时经 sanitize/clamp 回落到默认值；手动编辑正文会切回自定义态，此时「换一个」按古诗词重新抽取；
 * 预设版面由正文行数决定（resolveLayoutKind）：多行按诗歌排版——题名与作者居中、正文逐句居中；
 * 单行按节选排版——正文首行缩进两格、末尾右对齐署「书名 + 作者」且顶部不再重复题名；
 * 自定义内容没有题名可署名，固定左起不缩进；打印由 handwriting.css 隐藏所有 hw-no-print 元素并锁定 A4 单页。
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PenLine, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import {
    buildHandwritingSheet,
    clampBorderWidthMm,
    clampGlyphScale,
    defaultBorderWidthMm,
    defaultGridColor,
    defaultInkColor,
    GLYPH_SCALE,
    pickRandomEntry,
    resolveLayoutKind,
    sanitizeHexColor,
    toSheetData,
    type ContentMode,
    type GridKind,
    type HandwritingEntry,
    type HandwritingSheetData,
    type LayoutKind,
} from '@shared/handwriting'
import '@apps/styles/handwriting.css'
import { Loading } from '@components/Loading'
import { HandwritingForm } from './HandwritingForm'
import { HandwritingSheet } from './HandwritingSheet'
import { useHandwritingCorpus } from './hooks/useHandwritingCorpus'
import { useLocalFonts } from './hooks/useLocalFonts'

const fontStorageKey = 'handwriting.font'
const gridStorageKey = 'handwriting.grid'
const inkColorStorageKey = 'handwriting.ink'
const gridColorStorageKey = 'handwriting.gridColor'
const glyphScaleStorageKey = 'handwriting.glyphScale'
const borderWidthStorageKey = 'handwriting.borderWidth'
const defaultFontFamily = 'KaiTi'

const emptySheetData: HandwritingSheetData = {
    title: '',
    subtitle: '',
    lines: [],
}

/** 版面：诗歌居中排版、节选缩进两格 + 末尾右对齐署名、自定义纯左起 */
type SheetLayout = LayoutKind | 'custom'

function readStoredValue(key: string, fallback: string): string {
    try {
        return localStorage.getItem(key) ?? fallback
    } catch {
        return fallback
    }
}

function writeStoredValue(key: string, value: string) {
    try {
        localStorage.setItem(key, value)
    } catch {
        // 隐私模式或配额受限时写入会抛错，仅影响下次进入的默认值，不阻断当前使用
    }
}

function resolveStoredGrid(): GridKind {
    const stored = readStoredValue(gridStorageKey, 'tian')
    return stored === 'mi' || stored === 'jiugong' ? stored : 'tian'
}

export function Handwriting() {
    const { corpus, isLoading: isCorpusLoading, error: corpusError } =
        useHandwritingCorpus()
    const {
        fonts,
        isSupported: isFontSupported,
        isInsecureContext,
        isLoading: isFontLoading,
        error: fontError,
        requestAll: requestAllFonts,
        ensureFont,
    } = useLocalFonts()

    const [grid, setGrid] = useState<GridKind>(resolveStoredGrid)
    const [fontFamily, setFontFamily] = useState(() =>
        readStoredValue(fontStorageKey, defaultFontFamily),
    )
    const [inkColor, setInkColor] = useState(() =>
        sanitizeHexColor(
            readStoredValue(inkColorStorageKey, defaultInkColor),
            defaultInkColor,
        ),
    )
    const [gridColor, setGridColor] = useState(() =>
        sanitizeHexColor(
            readStoredValue(gridColorStorageKey, defaultGridColor),
            defaultGridColor,
        ),
    )
    const [glyphScale, setGlyphScale] = useState(() =>
        clampGlyphScale(
            Number(readStoredValue(glyphScaleStorageKey, String(GLYPH_SCALE))),
        ),
    )
    const [borderWidth, setBorderWidth] = useState(() =>
        clampBorderWidthMm(
            Number(
                readStoredValue(
                    borderWidthStorageKey,
                    String(defaultBorderWidthMm),
                ),
            ),
        ),
    )
    const [sourceMode, setSourceMode] = useState<ContentMode>('poem')
    const [entry, setEntry] = useState<HandwritingEntry | null>(null)
    const [customText, setCustomText] = useState('')
    const [isPanelOpen, setIsPanelOpen] = useState(false)

    // 切换来源或语料就绪时随机取一条预设；预设只留在 entry 里，绝不写进自定义文本域
    useEffect(() => {
        if (sourceMode === 'custom') return
        const picked = pickRandomEntry(corpus[sourceMode])
        if (!picked) return
        setEntry(picked)
    }, [sourceMode, corpus])

    // 内置字体按需加载：刷新后恢复的、手动切换到内置字体都会触发，未选中的字体文件不请求
    useEffect(() => {
        ensureFont(fontFamily)
    }, [ensureFont, fontFamily])

    const handleSourceChange = useCallback((mode: ContentMode) => {
        setSourceMode(mode)
    }, [])

    const handleRandom = useCallback(() => {
        if (sourceMode === 'custom') return
        setEntry(pickRandomEntry(corpus[sourceMode]))
    }, [corpus, sourceMode])

    const handleCustomTextChange = useCallback((text: string) => {
        setCustomText(text)
        setSourceMode('custom')
    }, [])

    // 文本域已有内容时聚焦即切回自定义：预设不进文本域，只能靠这个动作找回自己写的内容
    const handleCustomFocus = useCallback(() => {
        if (!customText.trim()) return
        setSourceMode('custom')
    }, [customText])

    const handleGridChange = useCallback((next: GridKind) => {
        setGrid(next)
        writeStoredValue(gridStorageKey, next)
    }, [])

    const handleFontChange = useCallback((next: string) => {
        setFontFamily(next)
        writeStoredValue(fontStorageKey, next)
    }, [])

    const handleInkColorChange = useCallback((next: string) => {
        const safe = sanitizeHexColor(next, defaultInkColor)
        setInkColor(safe)
        writeStoredValue(inkColorStorageKey, safe)
    }, [])

    const handleGridColorChange = useCallback((next: string) => {
        const safe = sanitizeHexColor(next, defaultGridColor)
        setGridColor(safe)
        writeStoredValue(gridColorStorageKey, safe)
    }, [])

    const handleGlyphScaleChange = useCallback((next: number) => {
        const safe = clampGlyphScale(next)
        setGlyphScale(safe)
        writeStoredValue(glyphScaleStorageKey, String(safe))
    }, [])

    const handleBorderWidthChange = useCallback((next: number) => {
        const safe = clampBorderWidthMm(next)
        setBorderWidth(safe)
        writeStoredValue(borderWidthStorageKey, String(safe))
    }, [])

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

    // 自定义态只取文本域内容且不带标题；预设态取语料条目，两者互不写入
    const sheetData = useMemo<HandwritingSheetData>(() => {
        if (sourceMode === 'custom') {
            return {
                title: '',
                subtitle: '',
                lines: customText.split(/\r?\n/),
            }
        }
        if (!entry) return emptySheetData
        // 节选的题名与作者由排版层压到正文之后右对齐，数据仍原样交给 toSheetData
        return toSheetData(entry)
    }, [customText, entry, sourceMode])

    // 版式只看正文行数：多行按诗歌（题名居中、逐句居中），单行按节选（首行空两格、末尾右对齐署名）；
    // 自定义内容没有题名可署名，固定左起且不缩进
    const sheet = useMemo(() => {
        const layout: SheetLayout =
            sourceMode === 'custom'
                ? 'custom'
                : resolveLayoutKind(entry?.lines ?? [])
        return buildHandwritingSheet(sheetData, {
            punctuation: 'grid',
            indent: layout === 'passage' ? 2 : 0,
            bodyAlign: layout === 'poem' ? 'center' : 'left',
            titlePlacement: layout === 'passage' ? 'footer' : 'top',
        })
    }, [entry, sheetData, sourceMode])

    // 自定义内容不显示标题（草图中已标注），预设则显示「诗名 · 作者」
    const currentTitle =
        sourceMode !== 'custom' && entry
            ? `${entry.title}${entry.subtitle ? ` · ${entry.subtitle}` : ''}`
            : ''

    if (isCorpusLoading) return <Loading />

    return (
        <div className="hw-page">
            <div className="hw-no-print mb-4 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <PenLine className="size-5 text-primary" />
                    <h1 className="text-xl font-semibold text-headline">
                        每日练字
                    </h1>
                    <p className="text-xs text-gray-500">
                        A4 纵向 · 11 格 × 14 行 · 打印后直接临写
                    </p>
                </div>
                <button
                    type="button"
                    className="btn btn-outline btn-sm shrink-0 lg:hidden"
                    onClick={() => setIsPanelOpen(true)}>
                    <SlidersHorizontal className="size-4" />
                    设置
                </button>
            </div>

            {corpusError ? (
                <p className="hw-no-print mb-4 rounded-lg bg-warning-background px-3 py-2 text-xs text-warning">
                    {corpusError}，请确认 apps/public/handwriting 下的语料文件存在。
                </p>
            ) : null}

            <div className="flex items-start gap-6">
                <div className="min-w-0 flex-1">
                    {sheet.isOverflow ? (
                        <p className="hw-no-print mb-3 flex items-center gap-1.5 text-xs text-warning">
                            <TriangleAlert className="size-3.5" />
                            内容超出单页容量，已截断到 14 行，请精简后再打印。
                        </p>
                    ) : null}
                    <div className="hw-sheet-viewport">
                        <HandwritingSheet
                            sheet={sheet}
                            grid={grid}
                            fontFamily={fontFamily}
                            inkColor={inkColor}
                            gridColor={gridColor}
                            glyphScale={glyphScale}
                            borderWidthMm={borderWidth}
                        />
                    </div>
                    <p className="hw-no-print mt-3 text-xs leading-relaxed text-gray-500">
                        打印对话框请选择 A4 纸张、缩放 100%、边距「默认」，并关闭页眉页脚。
                    </p>
                </div>

                <div
                    className={`hw-no-print w-full shrink-0 lg:w-80 max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:overflow-y-auto max-lg:bg-background max-lg:p-4 ${
                        isPanelOpen ? '' : 'max-lg:hidden'
                    }`}>
                    <HandwritingForm
                        customText={customText}
                        currentTitle={currentTitle}
                        sourceMode={sourceMode}
                        grid={grid}
                        fontFamily={fontFamily}
                        fontOptions={fonts}
                        inkColor={inkColor}
                        gridColor={gridColor}
                        glyphScale={glyphScale}
                        borderWidth={borderWidth}
                        isFontSupported={isFontSupported}
                        isInsecureContext={isInsecureContext}
                        isFontLoading={isFontLoading}
                        fontError={fontError}
                        onCustomTextChange={handleCustomTextChange}
                        onCustomFocus={handleCustomFocus}
                        onSourceChange={handleSourceChange}
                        onGridChange={handleGridChange}
                        onFontChange={handleFontChange}
                        onInkColorChange={handleInkColorChange}
                        onGridColorChange={handleGridColorChange}
                        onGlyphScaleChange={handleGlyphScaleChange}
                        onBorderWidthChange={handleBorderWidthChange}
                        onRequestAllFonts={requestAllFonts}
                        onRandom={handleRandom}
                        onPrint={handlePrint}
                        onClose={() => setIsPanelOpen(false)}
                    />
                </div>
            </div>
        </div>
    )
}
