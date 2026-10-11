/**
 * 题库分值处理工具：把 Markdown 正文中的「（N 分）」标注高亮，并汇总总分与题量。
 * 复用无第三方依赖的纯函数实现，渲染前一次性完成标注与统计，避免二次遍历 DOM。
 * 关键约束：必须跳过围栏代码块与 `$…$`／`$$…$$` 公式区段，否则代码与公式中的
 * 数字会被误判为分值；注入的 <mark> 依赖预览层已启用的 rehype-raw 才能保留 class。
 */

/** 分值标注：支持全/半角括号，如「（5 分）」「(10分)」 */
const SCORE_PATTERN = /[（(]\s*(\d+(?:\.\d+)?)\s*分\s*[)）]/g
/** 行内公式：$…$，用于保护其中的数字不被当作分值 */
const INLINE_MATH_PATTERN = /\$[^$\n]+\$/g
/** 围栏代码块起始标记：``` 或 ~~~ */
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/
/** 行内公式占位符（Unicode 私有使用区，正常正文不会出现） */
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE000/g

export interface LibraryScoreSummary {
    /** 已注入高亮标记的 Markdown 文本 */
    annotated: string
    /** 正文分值合计（无标注时为 0） */
    totalScore: number
    /** 分值标注出现次数 */
    count: number
}

export function analyzeLibraryContent(markdown: string): LibraryScoreSummary {
    const output: string[] = []
    let fenceMarker: string | null = null
    let inBlockMath = false
    let totalScore = 0
    let count = 0

    for (const line of markdown.split('\n')) {
        const fenceMatched = FENCE_PATTERN.exec(line)

        if (fenceMarker !== null) {
            if (fenceMatched && fenceMatched[1][0] === fenceMarker) {
                fenceMarker = null
            }
            output.push(line)
            continue
        }
        if (fenceMatched) {
            fenceMarker = fenceMatched[1][0]
            output.push(line)
            continue
        }

        const blockDelimiters = line.match(/\$\$/g)?.length ?? 0
        if (inBlockMath) {
            if (blockDelimiters % 2 === 1) inBlockMath = false
            output.push(line)
            continue
        }
        if (blockDelimiters % 2 === 1) {
            inBlockMath = true
            output.push(line)
            continue
        }

        const mathSegments: string[] = []
        const protectedLine = line.replace(INLINE_MATH_PATTERN, (matched) => {
            mathSegments.push(matched)
            return `\uE000${mathSegments.length - 1}\uE000`
        })
        const annotatedLine = protectedLine.replace(
            SCORE_PATTERN,
            (matched, num: string) => {
                totalScore += Number(num)
                count += 1
                return `<mark class="library-score">${matched}</mark>`
            },
        )
        output.push(
            annotatedLine.replace(
                PLACEHOLDER_PATTERN,
                (_matched, index: string) => mathSegments[Number(index)] ?? '',
            ),
        )
    }

    return { annotated: output.join('\n'), totalScore, count }
}
