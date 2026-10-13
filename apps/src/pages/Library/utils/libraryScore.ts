/**
 * 题库内容预处理：把题目 Markdown 调整为「可直接渲染」的形态。
 * 复用纯正则实现，一次完成「数学定界符归一化 + 行内分数尺寸统一 + 选项换行与间距」，
 * 不引入额外依赖；splitLibraryAnswer 按标题把答案段切出，供页面默认折叠。
 * 关键约束：必须跳过围栏代码块；remark-math 只识别 `$…$`/`$$…$$`，故 `\(…\)` 归一化为
 * `$…$`、块级定界符统一归一化为 `$$`——`\[…\]` 既可同行成对，也常写成开闭符号各自独占一行
 * （逐行处理须按行首/行尾锚定补上，否则跨行写法会整段退化为裸 LaTeX 文本）；
 * 且只有「独占整行」的 `$$…$$` 才按块级样式渲染，同行写法会被当作行内数学，
 * 故除独占行的 `$$…$$` 外，公式中的 `\frac` 一律改写为 `\dfrac` 以统一分数尺寸；
 * 选项行的硬换行只能补在「上一行行尾」，且撑高元素须排在那两个空格之前（补在选项行自身无效）；
 * 注入的 <span> 依赖预览层默认启用的 rehype-raw 解析，样式须随页面引入 markdown-viewer.css。
 */

/** 行内数学定界符 `\(…\)`：remark-math 不识别，需归一化为 `$…$` */
const INLINE_MATH_DELIMITER = /\\\(([\s\S]+?)\\\)/g
/** 块级公式同行成对写法 `\[…\]`：归一化为 `$$…$$`（逐行处理，故不跨行匹配） */
const BLOCK_MATH_PAIR = /\\\[([^\n]*?)\\\]/g
/** 块级公式起始 `\[`：位于行首（可带缩进），归一化为 `$$` */
const BLOCK_MATH_OPEN = /^(\s*)\\\[/
/** 块级公式结束 `\]`：位于行尾（可带尾随空白），归一化为 `$$` */
const BLOCK_MATH_CLOSE = /\\\](\s*)$/
/** 公式片段：`$$…$$` 与 `$…$` 两类写法，是否改写 `\frac` 由 isStandaloneDisplay 判定 */
const MATH_SEGMENT = /\$\$[^$\n]*\$\$|\$[^$\n]+\$/g
/** 分数命令 `\frac`：`\b` 保证不误伤 `\dfrac`/`\tfrac`/`\cfrac` */
const FRAC_COMMAND = /\\frac\b/g
/** 围栏代码块起始标记：``` 或 ~~~ */
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/
/** 答案区标题行：1–6 级标题且整行含「参考答案」（如「# 参考答案与评分标准」） */
const ANSWER_HEADING = /^#{1,6}[ \t]+.*参考答案/
/** 选择题选项行：缩进后的单个大写字母加分隔符（`.、．)）` 或半/全角括号包裹），如「A. 第一根长」「（C）一样长」 */
const OPTION_LINE = /^[ \t]{0,8}(?:[A-H][.、．)）]|[（(][A-H][）)])[ \t]*\S/
/** 选项间距占位元素：行内分数的高度远超默认行盒，靠该元素撑开行盒，样式见 markdown-viewer.css */
const LINE_SPACE = '<span class="library-line-space"></span>'

/**
 * 判断公式片段是否独占整行：remark-math 只对这种写法的 `$$…$$` 用块级（display）样式渲染，
 * 分数不会被缩小；同行写法会被当作行内数学，其中的 `\frac` 仍被 KaTeX 缩为 scriptstyle，
 * 故须一并改写为 `\dfrac` 才能与块级公式的分数同尺寸。
 */
function isStandaloneDisplay(
    segment: string,
    offset: number,
    line: string,
): boolean {
    if (!segment.startsWith('$$')) return false
    return (
        line.slice(0, offset).trim() === '' &&
        line.slice(offset + segment.length).trim() === ''
    )
}

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
            .replace(BLOCK_MATH_PAIR, (_matched, inner: string) => '$$' + inner + '$$')
            .replace(BLOCK_MATH_OPEN, (_matched, indent: string) => indent + '$$')
            .replace(BLOCK_MATH_CLOSE, (_matched, trailing: string) => '$$' + trailing)
            .replace(INLINE_MATH_DELIMITER, (_matched, inner: string) => '$' + inner + '$')
            // 行内公式的 \frac 会被 KaTeX 缩为 scriptstyle，与块级公式中的分数大小不一，
            // 故一律改为 \dfrac（显示样式分数）使分子分母字号一致；
            // 仅「独占整行」的 $$…$$ 例外——它是真正的块级公式，分数本就不缩小
            .replace(MATH_SEGMENT, (segment: string, offset: number, line: string) =>
                isStandaloneDisplay(segment, offset, line)
                    ? segment
                    : segment.replace(FRAC_COMMAND, '\\dfrac'),
            )

        // 选择题的选项在题干下方逐个占一行，Markdown 视为同一段落的软换行，
        // 浏览器会把 A/B/C/D 连成一行，故在选项行前补硬换行（上一行行尾两空格）；
        // 硬换行只能补在上一行行尾，故撑高元素一并补在该行（两空格之前，不破坏硬换行）
        if (OPTION_LINE.test(line)) {
            const previous = output[output.length - 1]
            if (previous !== undefined && previous.trim() !== '') {
                output[output.length - 1] = `${previous}${LINE_SPACE}  `
            }
        }
        output.push(normalized)
    }

    return output.join('\n')
}

export interface LibraryArticle {
    /** 题干部分：答案标题之前的全部内容，已去掉尾部分隔线与空行 */
    question: string
    /** 答案部分：答案标题及其后内容；未声明答案时为 null */
    answer: string | null
}

/**
 * 按「参考答案」标题把题目切成题干与答案两段，答案段交给调用方决定是否展示。
 * 复用与 prepareLibraryContent 相同的围栏判定，避免代码块内出现的同名标题被误切。
 * 关键约束：识别依据是行首的 Markdown 标题（1–6 级）且整行含「参考答案」，
 * 只有占位声明而无实际答案时按「无答案」处理；题干尾部的 `---` 分隔线须一并去掉，
 * 否则折叠后题干末尾会残留一条水平线。
 */
export function splitLibraryAnswer(markdown: string): LibraryArticle {
    const lines = markdown.split('\n')
    let fenceMarker: string | null = null

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const fenceMatched = FENCE_PATTERN.exec(line)

        if (fenceMarker !== null) {
            if (fenceMatched && fenceMatched[1][0] === fenceMarker) {
                fenceMarker = null
            }
            continue
        }
        if (fenceMatched) {
            fenceMarker = fenceMatched[1][0]
            continue
        }
        if (!ANSWER_HEADING.test(line)) continue

        const answer = lines.slice(index).join('\n').trim()
        if (!lines.slice(index + 1).join('\n').trim()) {
            return { question: markdown, answer: null }
        }
        const head = lines.slice(0, index)
        // 折叠后题干末尾不应留下孤立的分隔线与空行，逐项从尾部剥掉
        while (head.length > 0) {
            const tail = head[head.length - 1].trim()
            if (tail === '' || /^-{3,}$/.test(tail)) {
                head.pop()
                continue
            }
            break
        }
        return { question: head.join('\n'), answer }
    }

    return { question: markdown, answer: null }
}
