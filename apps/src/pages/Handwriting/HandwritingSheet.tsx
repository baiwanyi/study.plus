/**
 * A4 字帖渲染：底纹层（SheetPattern）与文字层（14 行 × 11 格 CSS Grid）叠放。
 * 复用约定：行列数、格边与行距全部取自 @shared/handwriting，与底纹 viewBox 同源换算；
 * 文字层只按 buildHandwritingSheet 的结果渲染，不再做任何边界裁剪。
 * 关键约束：所有尺寸以容器查询单位 cqw 表达（字帖宽记为 100cqw），由外层 viewport 的
 * container-type 提供换算基准，因此任意屏宽下都按比例铺满、打印时又还原为真实毫米；
 * 字体名须先经 sanitizeFontFamily 过滤，避免任意字符串拼进 style；字色、方格色、字号比例与边框线宽
 * 由属性注入，调用方需已用 sanitizeHexColor / clampGlyphScale / clampBorderWidthMm 处理。
 */
import type { CSSProperties } from 'react'
import {
    CELL_ROW_GAP_MM,
    CELL_SIZE_MM,
    SHEET_COLUMNS,
    SHEET_HEIGHT_MM,
    SHEET_PADDING_X_MM,
    SHEET_PADDING_Y_MM,
    SHEET_ROWS,
    SHEET_WIDTH_MM,
    sanitizeFontFamily,
    type GridKind,
    type HandwritingSheet as HandwritingSheetData,
} from '@shared/handwriting'
import { SheetPattern } from './SheetPattern'

interface HandwritingSheetProps {
    sheet: HandwritingSheetData
    grid: GridKind
    fontFamily: string
    /** 字色，已由页面侧 sanitizeHexColor 校验 */
    inkColor: string
    /** 方格颜色，已由页面侧 sanitizeHexColor 校验 */
    gridColor: string
    /** 字号占格比例（0.5–1），已由页面侧 clampGlyphScale 限制 */
    glyphScale: number
    /** 边框线宽（毫米），已由页面侧 clampBorderWidthMm 限制 */
    borderWidthMm: number
}

/** 内容区尺寸：宽度由列数决定，高度由行数加行间距决定，恰好铺满页内留白 */
const bodyWidthMm = SHEET_COLUMNS * CELL_SIZE_MM
const bodyHeightMm =
    SHEET_ROWS * CELL_SIZE_MM + (SHEET_ROWS - 1) * CELL_ROW_GAP_MM

/** 毫米换算为容器宽度的百分比单位：字帖宽 = 100cqw，所有尺寸随之等比缩放 */
function toCqw(mm: number): string {
    return `${((mm / SHEET_WIDTH_MM) * 100).toFixed(4)}cqw`
}

export function HandwritingSheet({
    sheet,
    grid,
    fontFamily,
    inkColor,
    gridColor,
    glyphScale,
    borderWidthMm,
}: HandwritingSheetProps) {
    const safeFont = sanitizeFontFamily(fontFamily)
    const cellSize = toCqw(CELL_SIZE_MM)

    const sheetStyle: CSSProperties = {
        width: '100%',
        height: toCqw(SHEET_HEIGHT_MM),
        padding: `${toCqw(SHEET_PADDING_Y_MM)} ${toCqw(SHEET_PADDING_X_MM)}`,
        color: inkColor,
        fontFamily: safeFont ? `"${safeFont}", serif` : undefined,
    }

    const bodyStyle: CSSProperties = {
        width: toCqw(bodyWidthMm),
        height: toCqw(bodyHeightMm),
        fontSize: toCqw(CELL_SIZE_MM * glyphScale),
    }

    const textStyle: CSSProperties = {
        gridTemplateColumns: `repeat(${SHEET_COLUMNS}, ${cellSize})`,
        gridTemplateRows: `repeat(${SHEET_ROWS}, ${cellSize})`,
        rowGap: toCqw(CELL_ROW_GAP_MM),
    }

    return (
        <div className="hw-sheet" style={sheetStyle}>
            <div className="hw-sheet-body" style={bodyStyle}>
                <SheetPattern
                    kind={grid}
                    color={gridColor}
                    borderWidthMm={borderWidthMm}
                />
                <div className="hw-sheet-text" style={textStyle}>
                    {sheet.rows.map((row, rowIndex) =>
                        row.map((cell, colIndex) => (
                            <div
                                className="hw-cell"
                                key={`${rowIndex}-${colIndex}`}>
                                {cell.char ? (
                                    <span className="hw-glyph">{cell.char}</span>
                                ) : null}
                                {cell.trailing ? (
                                    <span className="hw-trailing">
                                        {cell.trailing}
                                    </span>
                                ) : null}
                            </div>
                        )),
                    )}
                </div>
            </div>
        </div>
    )
}
