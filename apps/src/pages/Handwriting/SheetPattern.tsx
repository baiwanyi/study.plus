/**
 * 整页字帖底纹：把 14 行 × 11 格的边框与辅助线合并为单个 SVG 绘制。
 * 复用约定：几何值全部来自 @shared/handwriting 的常量换算成 viewBox 坐标（单格 100 单位，
 * 行间距按同一比例换算），与文字层的 CSS Grid 严格对齐；线宽以毫米为单位换算成 viewBox 单位，
 * 随字帖等比缩放，屏幕预览与打印输出的粗细一致。
 * 关键约束：相邻格子共享边框，必须在整页层面合并绘制，逐格渲染会因亚像素取整出现错位双线；
 * 虚线颜色偏浅，打印样式需开启 print-color-adjust: exact，否则浏览器会丢弃。
 */
import type { ReactNode } from 'react'
import {
    CELL_ROW_GAP_MM,
    CELL_SIZE_MM,
    SHEET_COLUMNS,
    SHEET_ROWS,
    type GridKind,
} from '@shared/handwriting'

/** 辅助线相对外框的透明度：同色减淡，只需一个方格颜色设置项 */
const guideOpacity = 0.55

/** 行间距换算到单格坐标系的偏移量（单格边长记为 100） */
const rowGapUnits = (CELL_ROW_GAP_MM / CELL_SIZE_MM) * 100

/** 行距：单格高度 + 行间距 */
const rowPitch = 100 + rowGapUnits

/** 整页底纹的 viewBox 尺寸 */
const viewWidth = SHEET_COLUMNS * 100
const viewHeight = SHEET_ROWS * 100 + (SHEET_ROWS - 1) * rowGapUnits

export function SheetPattern({
    kind,
    color,
    borderWidthMm,
}: {
    kind: GridKind
    color: string
    /** 外框线宽（毫米），调用方需已用 clampBorderWidthMm 夹到可调范围 */
    borderWidthMm: number
}) {
    // 单格边长记为 100，故 1mm 对应 100 / CELL_SIZE_MM 个 viewBox 单位
    const frameStroke = (borderWidthMm / CELL_SIZE_MM) * 100
    // 辅助线比外框细一档，保持「框粗线细」的层次
    const guideStroke = frameStroke * 0.6

    const frameLines: ReactNode[] = []
    for (let col = 0; col <= SHEET_COLUMNS; col += 1) {
        const x = col * 100
        frameLines.push(
            <line key={`v-${col}`} x1={x} y1={0} x2={x} y2={viewHeight} />,
        )
    }
    for (let row = 0; row < SHEET_ROWS; row += 1) {
        const top = row * rowPitch
        frameLines.push(
            <line key={`t-${row}`} x1={0} y1={top} x2={viewWidth} y2={top} />,
        )
        frameLines.push(
            <line
                key={`b-${row}`}
                x1={0}
                y1={top + 100}
                x2={viewWidth}
                y2={top + 100}
            />,
        )
    }

    const guideLines: ReactNode[] = []
    for (let row = 0; row < SHEET_ROWS; row += 1) {
        const top = row * rowPitch
        // 横向辅助线贯穿整行（列之间没有间隙，逐格绘制会让虚线节奏错位）
        if (kind === 'jiugong') {
            guideLines.push(
                <line
                    key={`gh-a-${row}`}
                    x1={0}
                    y1={top + 33.33}
                    x2={viewWidth}
                    y2={top + 33.33}
                />,
            )
            guideLines.push(
                <line
                    key={`gh-b-${row}`}
                    x1={0}
                    y1={top + 66.67}
                    x2={viewWidth}
                    y2={top + 66.67}
                />,
            )
        } else {
            guideLines.push(
                <line
                    key={`gh-${row}`}
                    x1={0}
                    y1={top + 50}
                    x2={viewWidth}
                    y2={top + 50}
                />,
            )
        }

        for (let col = 0; col < SHEET_COLUMNS; col += 1) {
            const left = col * 100
            if (kind === 'jiugong') {
                guideLines.push(
                    <line
                        key={`gv-a-${row}-${col}`}
                        x1={left + 33.33}
                        y1={top}
                        x2={left + 33.33}
                        y2={top + 100}
                    />,
                )
                guideLines.push(
                    <line
                        key={`gv-b-${row}-${col}`}
                        x1={left + 66.67}
                        y1={top}
                        x2={left + 66.67}
                        y2={top + 100}
                    />,
                )
                continue
            }
            guideLines.push(
                <line
                    key={`gv-${row}-${col}`}
                    x1={left + 50}
                    y1={top}
                    x2={left + 50}
                    y2={top + 100}
                />,
            )
            if (kind === 'mi') {
                guideLines.push(
                    <line
                        key={`gd-a-${row}-${col}`}
                        x1={left}
                        y1={top}
                        x2={left + 100}
                        y2={top + 100}
                    />,
                )
                guideLines.push(
                    <line
                        key={`gd-b-${row}-${col}`}
                        x1={left + 100}
                        y1={top}
                        x2={left}
                        y2={top + 100}
                    />,
                )
            }
        }
    }

    return (
        <svg
            className="hw-sheet-pattern"
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            // 描边以路径为轴线向两侧扩展，外圈线若被 viewBox 裁掉一半会在粗线时明显变细
            style={{ overflow: 'visible' }}>
            <g stroke={color} strokeWidth={frameStroke}>
                {frameLines}
            </g>
            <g
                stroke={color}
                strokeOpacity={guideOpacity}
                strokeWidth={guideStroke}
                strokeDasharray="3 3">
                {guideLines}
            </g>
        </svg>
    )
}
