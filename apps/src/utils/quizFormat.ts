/**
 * 测验展示格式化工具模块：提供客观题答案字母到可读选项文本的还原、选项前缀剥离等纯函数。
 * 复用约定：答案编码解析复用 @shared/utils 的 decodeMultiSelection；供测验编辑器与错题本共用。
 * 关键约束：仅适用于客观题（单选/多选）上下文，简答题答案须原文展示，避免普通文本被误判为字母编码。
 */
import { decodeMultiSelection } from '@shared/utils'

/** 剥离选项文本自带的字母序号前缀（AI 出题可能返回 "A. 选项"，外层已拼 {letter}. 前缀避免重复序号） */
export function stripOptionPrefix(opt: string): string {
    return opt.replace(/^[A-Za-z]\.\s*/, '').trim()
}

/** 客观题答案展示：把答案字母编码映射为可读选项文本（如 "A,C" -> "A. 选项1；C. 选项2"）；
 * 答案字母超出选项范围时降级为仅显示字母本身 */
export function formatAnswerText(options: string[], answer: string): string {
    const letters = decodeMultiSelection(answer)
    if (letters.length === 0) {
        return '（未作答）'
    }
    return letters
        .map((letter) => {
            const idx = letter.charCodeAt(0) - 'A'.charCodeAt(0)
            const text = options[idx]
            return text ? `${letter}. ${stripOptionPrefix(text)}` : letter
        })
        .join('；')
}
