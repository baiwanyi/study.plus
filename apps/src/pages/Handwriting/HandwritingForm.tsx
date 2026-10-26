/**
 * 字帖配置面板：内容来源切换、自定义文本编辑、方格类型、字体、样式（字色/方格色/字号比例/方格线宽）
 * 与打印入口；线宽以毫米为单位调节，取值范围由 @shared/handwriting 的 min/maxBorderWidthMm 决定。
 * 复用约定：来源文案取自 @shared/handwriting 的 labels，分段控件复用 @components/Tabs；
 * 字体下拉分「内置字体」（清单由构建插件扫描 public/fonts 生成）与「系统字体」（探测/授权所得）两组，
 * 均从清单中选择，不接受手填字体名。
 * 关键约束：面板整体标记为 hw-no-print，打印时由 handwriting.css 隐藏，只输出字帖本身；
 * 自定义文本与预设内容互不写入，文本域仅承载自定义文本，聚焦动作交由页面侧决定是否切回自定义态；
 * 预设标题只读展示且可省略，自定义态因无随机池而禁用「换一个」；小屏抽屉关闭按钮由 lg:hidden 控制。
 */
'use client'

import { Printer, RefreshCw, X } from 'lucide-react'
import { builtinFonts } from 'virtual:handwriting-fonts'
import { Tabs, type TabItem } from '@components/Tabs'
import {
    contentModeLabels,
    gridKindLabels,
    maxBorderWidthMm,
    maxGlyphScale,
    minBorderWidthMm,
    minGlyphScale,
    type ContentMode,
    type GridKind,
} from '@shared/handwriting'

const sourceModes: ContentMode[] = ['poem', 'textbook', 'reading']
const gridKinds: GridKind[] = ['tian', 'mi', 'jiugong']

/** 常用字色：墨黑、墨绿灰、中灰、浅灰（描红） */
const inkPresets = ['#1f2937', '#44524a', '#8a8a8a', '#c8c8c8']

/** 常用方格色：浅绿、灰、蓝、粉 */
const gridPresets = ['#7dcb9c', '#9aa5b1', '#7ea6d8', '#d8a2a2']

const sourceTabs: TabItem<ContentMode>[] = sourceModes.map((key) => ({
    key,
    label: contentModeLabels[key],
}))

/** 内置字体的 family 列表，模块级常量，供下拉回显与去重共用 */
const builtinFamilies = builtinFonts.map((font) => font.family)

export interface HandwritingFormProps {
    customText: string
    currentTitle: string
    sourceMode: ContentMode
    grid: GridKind
    fontFamily: string
    fontOptions: string[]
    inkColor: string
    gridColor: string
    glyphScale: number
    borderWidth: number
    isFontSupported: boolean
    isInsecureContext: boolean
    isFontLoading: boolean
    fontError: string
    onCustomTextChange: (text: string) => void
    onCustomFocus: () => void
    onSourceChange: (mode: ContentMode) => void
    onGridChange: (grid: GridKind) => void
    onFontChange: (family: string) => void
    onInkColorChange: (color: string) => void
    onGridColorChange: (color: string) => void
    onGlyphScaleChange: (scale: number) => void
    onBorderWidthChange: (width: number) => void
    onRequestAllFonts: () => void
    onRandom: () => void
    onPrint: () => void
    onClose: () => void
}

interface ColorPickerProps {
    id: string
    label: string
    value: string
    presets: string[]
    onChange: (color: string) => void
}

/** 颜色选择行：原生取色器 + 色值回显 + 常用色快捷按钮，字色与方格色共用 */
function ColorPicker({
    id,
    label,
    value,
    presets,
    onChange,
}: ColorPickerProps) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs text-gray-600" htmlFor={id}>
                {label}
            </label>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    id={id}
                    type="color"
                    className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
                <span className="font-mono text-xs text-gray-500">
                    {value.toUpperCase()}
                </span>
                <div className="ml-auto flex gap-1.5">
                    {presets.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            aria-label={`${label} ${preset}`}
                            onClick={() => onChange(preset)}
                            className={`size-6 cursor-pointer rounded-full border transition-all ${
                                value.toLowerCase() === preset
                                    ? 'border-primary ring-2 ring-primary ring-offset-1'
                                    : 'border-gray-300 hover:border-gray-400'
                            }`}
                            style={{ backgroundColor: preset }}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

export function HandwritingForm({
    customText,
    currentTitle,
    sourceMode,
    grid,
    fontFamily,
    fontOptions,
    inkColor,
    gridColor,
    glyphScale,
    borderWidth,
    isFontSupported,
    isInsecureContext,
    isFontLoading,
    fontError,
    onCustomTextChange,
    onCustomFocus,
    onSourceChange,
    onGridChange,
    onFontChange,
    onInkColorChange,
    onGridColorChange,
    onGlyphScaleChange,
    onBorderWidthChange,
    onRequestAllFonts,
    onRandom,
    onPrint,
    onClose,
}: HandwritingFormProps) {
    // 系统字体若与内置字体同族则不再重复列出，内置字体固定排在下拉最前
    const systemFamilies = fontOptions.filter(
        (family) => !builtinFamilies.includes(family),
    )
    const allFontFamilies = [...builtinFamilies, ...systemFamilies]

    let fontHint = '内置字体随站点加载，无需本机安装；系统字体当前仅列出探测到的候选字体'
    if (isFontSupported) {
        fontHint = '系统字体仅暴露已安装的那些，可点「读取全部本地字体」拉取完整列表'
    } else if (isInsecureContext) {
        fontHint =
            'http 局域网地址无法读取全部系统字体，可改用 localhost / https，或直接使用内置字体'
    }

    return (
        <div className="card space-y-5 hw-no-print">
            <div className="flex items-center justify-between lg:hidden">
                <h2 className="text-base font-semibold text-headline">
                    字帖设置
                </h2>
                <button
                    type="button"
                    className="text-gray-600 hover:text-gray-900"
                    onClick={onClose}>
                    <X className="size-5" />
                </button>
            </div>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-800">字帖内容</h2>
                <Tabs<ContentMode>
                    tabs={sourceTabs}
                    active={sourceMode}
                    background="gray"
                    onChange={onSourceChange}
                />
                <textarea
                    className="regular-text h-32 resize-y leading-relaxed"
                    placeholder={
                        '自定义内容\n每行一句，直接换行分段；行首加空格可实现缩进'
                    }
                    value={customText}
                    onChange={(event) => onCustomTextChange(event.target.value)}
                    onFocus={onCustomFocus}
                />
                <div className="flex min-w-0 items-center gap-2">
                    {currentTitle ? (
                        <div
                            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-700">
                            {currentTitle}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        className="btn btn-outline btn-sm ml-auto shrink-0"
                        title={
                            sourceMode === 'custom'
                                ? '自定义内容没有随机池，请先选择一个来源'
                                : '随机换一条预设内容'
                        }
                        disabled={sourceMode === 'custom'}
                        onClick={onRandom}>
                        <RefreshCw className="size-4 mr-1.5" />
                        换一个
                    </button>
                </div>
            </section>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-800">方格类型</h2>
                <div className="grid grid-cols-3 gap-2">
                    {gridKinds.map((kind) => (
                        <button
                            key={kind}
                            type="button"
                            onClick={() => onGridChange(kind)}
                            className={`cursor-pointer rounded-lg border py-2 text-sm transition-all ${
                                grid === kind
                                    ? 'border-primary bg-primary-background font-medium text-primary'
                                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                            }`}>
                            {gridKindLabels[kind]}
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <label
                        className="text-sm font-semibold text-gray-800"
                        htmlFor="hw-font-select">
                        字体
                    </label>
                    {isFontSupported ? (
                        <button
                            type="button"
                            className="btn btn-link btn-sm"
                            disabled={isFontLoading}
                            onClick={onRequestAllFonts}>
                            {isFontLoading ? '读取中…' : '读取全部本地字体'}
                        </button>
                    ) : null}
                </div>
                <select
                    id="hw-font-select"
                    className="regular-text"
                    value={
                        allFontFamilies.includes(fontFamily) ? fontFamily : ''
                    }
                    onChange={(event) => onFontChange(event.target.value)}>
                    {allFontFamilies.includes(fontFamily) ? null : (
                        <option value="">当前：{fontFamily || '默认字体'}</option>
                    )}
                    <optgroup label="内置字体">
                        {builtinFonts.map((font) => (
                            <option key={font.family} value={font.family}>
                                {font.label}
                            </option>
                        ))}
                    </optgroup>
                    {systemFamilies.length > 0 ? (
                        <optgroup label="系统字体">
                            {systemFamilies.map((family) => (
                                <option key={family} value={family}>
                                    {family}
                                </option>
                            ))}
                        </optgroup>
                    ) : null}
                </select>
                {fontError ? (
                    <p className="text-xs text-danger">{fontError}</p>
                ) : (
                    <p className="text-xs text-gray-400">{fontHint}</p>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">样式</h2>
                <ColorPicker
                    id="hw-ink-color"
                    label="字体颜色"
                    value={inkColor}
                    presets={inkPresets}
                    onChange={onInkColorChange}
                />
                <ColorPicker
                    id="hw-grid-color"
                    label="方格颜色"
                    value={gridColor}
                    presets={gridPresets}
                    onChange={onGridColorChange}
                />
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label
                            className="text-xs text-gray-600"
                            htmlFor="hw-glyph-scale">
                            字号占格比例
                        </label>
                        <span className="text-xs text-gray-500">
                            {Math.round(glyphScale * 100)}%
                        </span>
                    </div>
                    <input
                        id="hw-glyph-scale"
                        type="range"
                        className="w-full cursor-pointer accent-primary"
                        min={Math.round(minGlyphScale * 100)}
                        max={Math.round(maxGlyphScale * 100)}
                        step={2}
                        value={Math.round(glyphScale * 100)}
                        onChange={(event) =>
                            onGlyphScaleChange(Number(event.target.value) / 100)
                        }
                    />
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label
                            className="text-xs text-gray-600"
                            htmlFor="hw-border-width">
                            方格线宽
                        </label>
                        <span className="text-xs text-gray-500">
                            {borderWidth.toFixed(2)} mm
                        </span>
                    </div>
                    <input
                        id="hw-border-width"
                        type="range"
                        className="w-full cursor-pointer accent-primary"
                        min={minBorderWidthMm}
                        max={maxBorderWidthMm}
                        step={0.05}
                        value={borderWidth}
                        onChange={(event) =>
                            onBorderWidthChange(Number(event.target.value))
                        }
                    />
                </div>
            </section>

            <button type="button" className="btn btn-primary w-full" onClick={onPrint}>
                <Printer className="size-4 mr-1.5" />
                打印字帖
            </button>
        </div>
    )
}
