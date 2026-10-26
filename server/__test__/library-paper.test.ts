/**
 * AI 出卷格式规范化测试：覆盖标题补齐、做题要求/建议补齐、要求段编号压平与题项空行。
 * 用例只调用纯函数（不触发模型请求），并用 @shared/utils 的解析器断言结果能被题库识别。
 * 关键约束：要求/建议段内的 `1.` 必须压成 `-`，否则解析器会把它当成小题并渲染出思路入口；
 * 空行规范须对已合规文本幂等，避免同一份内容反复生成时排版漂移。
 */
import { describe, expect, it } from 'vitest'
import {
    flattenLibraryInstructionSections,
    parseLibraryQuestions,
    splitLibraryAnswer,
} from '@shared/utils'
import {
    ensurePaperStructure,
    normalizePaperSpacing,
} from '../src/services/ai/library'

const options = {
    grade: '六年级',
    subject: '数学',
    requirements: '',
    questionCount: 2,
}

/** 统计可被题库识别的小题数量 */
function countQuestions(markdown: string): number {
    const { question } = splitLibraryAnswer(markdown)
    return parseLibraryQuestions(question).filter(
        (block) => block.kind === 'question',
    ).length
}

const sample = `# 分数除法解决问题 4

**做题要求：**

1. **圈画关键词**：做题前先写出“单位‘1’”。

2. **写关系式**：先写出总量与分率的关系式。

---

**做题建议**：

- **画线段图**：先标出谁是“单位1”。

---

## 练习题（共2题）

1. 一株向日葵现在高143厘米，比上周高了 \\(\\frac{1}{10}\\)，上周高多少厘米？

2. 一件衣服打折后比原价便宜了 \\(\\frac{1}{5}\\)，现在售价160元，原价多少元？

---

## 参考答案与易错点解析

1. 130 厘米。

2. 200 元。易错点：先找对应量与对应分率。
`

describe('出卷结构补齐', () => {
    it('缺少标题时以「年级·学科」兜底标题前置补上', () => {
        const result = ensurePaperStructure('1. 题干。', options)
        expect(result.startsWith('# 六年级·数学练习')).toBe(true)
    })

    it('保留模型自拟的一级标题', () => {
        const result = ensurePaperStructure(
            '# 分数除法解决问题 4\n\n1. 题干。',
            options,
        )
        expect(result.startsWith('# 分数除法解决问题 4')).toBe(true)
    })

    it('缺少做题要求与做题建议时补齐两段', () => {
        const result = ensurePaperStructure(
            '# 小练习\n\n1. 题干。\n\n## 参考答案与易错点解析\n\n1. 答案。',
            options,
        )
        expect(result).toContain('**做题要求：**')
        expect(result).toContain('**做题建议**')
    })

    it('要求段的数字编号被压成无序列表，不再被识别为小题', () => {
        const result = ensurePaperStructure(sample, options)
        expect(result).toContain('- **圈画关键词**')
        expect(result).not.toMatch(/^1\. \*\*圈画关键词/m)
        expect(countQuestions(result)).toBe(2)
    })
})

describe('做题要求段编号压平（渲染前兜底）', () => {
    const legacy = `# 分数除法解决问题 1

**做题要求：**

1. **圈画关键词**：先写出“单位 1”。

2. **写关系式**：和倍问题先写总量 ÷（1 + 几分之几）。

---

## 练习题（共1题）

1. 一项工程，甲单独做 10 天完成。

2. 乙单独做 15 天完成。

## 参考答案与易错点解析

1. 略。
`

    it('要求段内的数字编号被改写为无序列表', () => {
        const result = flattenLibraryInstructionSections(legacy)
        expect(result).toContain('- **圈画关键词**')
        expect(result).toContain('- **写关系式**')
        expect(result).not.toMatch(/^1\. \*\*圈画关键词/m)
    })

    it('要求段外的题号保持原样', () => {
        const result = flattenLibraryInstructionSections(legacy)
        expect(result).toContain('1. 一项工程，甲单独做 10 天完成。')
        expect(result).toContain('2. 乙单独做 15 天完成。')
    })

    it('压平后要求不再被识别为小题，只剩真实的 2 道题', () => {
        const countQuestions = (text: string) =>
            parseLibraryQuestions(splitLibraryAnswer(text).question).filter(
                (block) => block.kind === 'question',
            ).length
        // 原文把 2 条要求也算成了题目（共 4），压平后应回到 2
        expect(countQuestions(legacy)).toBe(4)
        expect(countQuestions(flattenLibraryInstructionSections(legacy))).toBe(
            2,
        )
    })
})

describe('加粗分组标题', () => {
    it('独立成块并更新后续小题的 section', () => {
        const text = [
            '1. 第一题题干。',
            '',
            '**（二）先做后合作**',
            '',
            '2. 第二题题干。',
        ].join('\n')
        const blocks = parseLibraryQuestions(text)
        expect(blocks.map((block) => block.kind)).toEqual([
            'question',
            'text',
            'question',
        ])
        expect(blocks[2].section).toBe('（二）先做后合作')
    })

    it('普通加粗强调不会被当作分组标题', () => {
        const blocks = parseLibraryQuestions(
            '1. 题干。\n\n**注意：**先写关系式。',
        )
        expect(blocks).toHaveLength(1)
        expect(blocks[0].kind).toBe('question')
    })
})

describe('出卷空行规范', () => {
    it('每道题的题干之间补一个空行', () => {
        const result = normalizePaperSpacing(
            '# 测试\n\n1. 第一题。\n2. 第二题。',
        )
        expect(result).toContain('1. 第一题。\n\n2. 第二题。')
    })

    it('对已合规文本幂等：小题数量不变', () => {
        const normalized = normalizePaperSpacing(sample)
        expect(normalizePaperSpacing(normalized)).toBe(normalized)
        expect(countQuestions(normalized)).toBe(countQuestions(sample))
    })

    it('格式化后的样例可切出答案段与两道小题', () => {
        const result = normalizePaperSpacing(ensurePaperStructure(sample, options))
        const { question, answer } = splitLibraryAnswer(result)
        const blocks = parseLibraryQuestions(question)
        expect(answer).toBeTruthy()
        expect(answer?.startsWith('## 参考答案与易错点解析')).toBe(true)
        expect(blocks.filter((block) => block.kind === 'question')).toHaveLength(2)
        expect(blocks.some((block) => block.content.includes('**做题要求：**'))).toBe(
            true,
        )
        expect(blocks.some((block) => block.content.includes('**做题建议**'))).toBe(
            true,
        )
    })
})
