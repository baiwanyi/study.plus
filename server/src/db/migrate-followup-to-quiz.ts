/**
 * 一次性迁移脚本：将旧的「AI 对话式逐题追问」数据迁移到新的 studynote_quiz 表。
 *
 * 旧结构：studynote_conversations + studynote_messages（一问一答 11 轮自然语言）。
 * 新结构：studynote_quiz（一次 10 题，批量作答 + 批量批改）。
 *
 * 迁移映射：
 * - 每个 conversation 的 assistant 消息（老师提问）→ questions
 * - 每个 conversation 的 user 消息（学生答案）→ answers（按时间顺序配对）
 * - 若最后一条 assistant 消息含「掌握程度评分：XX」正则命中 → 记为一次已提交记录，
 *   并把分数写入 studynotes.quizScore；results 留空（旧数据无法还原逐题正误）。
 *
 * 用法（仅执行一次）：
 *   pnpm --filter @study/server tsx src/db/migrate-followup-to-quiz.ts
 *
 * 注意：旧表 studynote_conversations / studynote_messages 保留但已停用写入，不删除。
 */

import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { studynotes, studynoteConversations, studynoteMessages, studynoteQuiz } from '../db/schema'

interface OldMessage {
    role: 'user' | 'assistant'
    content: string
    createdAt: string
}

const SCORE_REGEX = /掌握程度评分[^0-9]*(\d+)/

function cleanQuestion(text: string): string {
    // 去掉旧数据里常见的「第N题：」前缀，仅保留题干
    return text.replace(/^\s*第\s*\d+\s*题\s*[:：]\s*/, '').trim()
}

async function main(): Promise<void> {
    const conversations = await db
        .select()
        .from(studynoteConversations)
        .orderBy(asc(studynoteConversations.id))

    console.log(`[迁移] 找到 ${conversations.length} 条旧对话，开始迁移...`)

    let migratedCount = 0

    for (const conv of conversations) {
        const messages = (await db
            .select()
            .from(studynoteMessages)
            .where(eq(studynoteMessages.conversationId, conv.id))
            .orderBy(asc(studynoteMessages.createdAt))) as OldMessage[]

        if (messages.length === 0) continue

        const assistantMsgs = messages.filter((m) => m.role === 'assistant')
        const userMsgs = messages.filter((m) => m.role === 'user')

        if (assistantMsgs.length === 0) continue

        const questions = assistantMsgs.map((m, i) => ({
            index: i + 1,
            question: cleanQuestion(m.content),
        }))
        const answers = userMsgs.map((m) => m.content)

        // 尝试从最后一条 assistant 消息解析评分
        const lastAssistant = assistantMsgs[assistantMsgs.length - 1]
        const scoreMatch = lastAssistant.content.match(SCORE_REGEX)
        const score = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null
        const isSubmitted =
            score !== null && !Number.isNaN(score) && score >= 0 && score <= 100

        const now = new Date().toISOString()
        const inserted = await db
            .insert(studynoteQuiz)
            .values({
                studynoteId: conv.studynoteId,
                questionsJson: JSON.stringify(questions),
                answersJson: answers.length > 0 ? JSON.stringify(answers) : null,
                resultsJson: null,
                score: isSubmitted ? score : null,
                correctCount: null,
                comment: '',
                suggestionsJson: '[]',
                generatedAt: conv.createdAt,
                submittedAt: isSubmitted ? conv.updatedAt : null,
                createdAt: now,
            })
            .returning()

        if (isSubmitted) {
            await db
                .update(studynotes)
                .set({
                    quizScore: score,
                    updatedAt: now,
                })
                .where(eq(studynotes.id, conv.studynoteId))
        }

        console.log(
            `[迁移] 卡片 ${conv.studynoteId} → 测验记录 #${inserted[0].id}，题目 ${questions.length} 道，提交：${isSubmitted ? `是（${score} 分）` : '否'}`,
        )
        migratedCount += 1
    }

    console.log(`[迁移] 完成，共迁移 ${migratedCount} 条测验记录。`)
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[迁移] 失败：', message)
        process.exit(1)
    })
