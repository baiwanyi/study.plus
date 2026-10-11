/**
 * 题库内容预处理：把题目 Markdown 调整为「可直接渲染」的形态。
 * 复用纯正则实现，一次完成「数学定界符归一化 + 分值标注高亮」，不引入额外依赖。
 * 关键约束：必须跳过围栏代码块，并在替换分值前用占位符保护公式段，否则代码与公式中的
 * 数字会被误判为分值；remark-math 只识别 `$…$`/`$$…$$`，故需把 `\(…\)`/`\[…\]` 归一化；
 * 注入的 <mark> 依赖预览层默认启用的 rehype-raw 解析，样式须随页面引入 markdown-viewer.css。
 */

/** 分值标注：兼容「（5 分）」「(共 100 分)」「（每题 5 分）」，排除「（3 分钟）」 */
const SCORE_PATTERN = /[（(]\s*(?:共|满分|总分|每题|各)?\s*(\d+(?:\.\d+)?)\s*分(?!钟)\s*[)）]/g
/** 行内数学定界符 `\(…\)`：remark-math 不识别，需归一化为 `$…$` */
const INLINE_MATH_DELIMITER = /\\\(([\s\S]+?)\\\)/g
/** 块级数学定界符 `\[…\]`：归一化为 `$$…$$` */
const BLOCK_MATH_DELIMITER = /\\\[([\s\S]+?)\\\]/g
/** 已就位的 `$…$` 公式段：替换分值前先占位保护 */
const DOLLAR_MATH = /\$[^$\n]+\$/g
/** 围栏代码块起始标记：``` 或 ~~~ */
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/
/** 公式占位符（Unicode 私有使用区，正常正文不会出现） */
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE000/g

export function prepareLibraryContent(markdown: string): string {
    const output: string[] = []
    let fenceMarker: string | null = null

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

        const normalized = line
            .replace(BLOCK_MATH_DELIMITER, (_matched, inner: string) => '$$' + inner + '$$')
            .replace(INLINE_MATH_DELIMITER, (_matched, inner: string) => '$' + inner + '$')

        const mathSegments: string[] = []
        const protectedLine = normalized.replace(DOLLAR_MATH, (matched) => {
            mathSegments.push(matched)
            return `\uE000${mathSegments.length - 1}\uE000`
        })
        const annotated = protectedLine.replace(
            SCORE_PATTERN,
            (matched) => `<mark class="library-score">${matched}</mark>`,
        )
        output.push(
            annotated.replace(
                PLACEHOLDER_PATTERN,
                (_matched, index: string) => mathSegments[Number(index)] ?? '',
            ),
        )
    }

    return output.join('\n')
}
