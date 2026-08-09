import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index'
import { studyNotes, studyQuiz } from '../db/schema'
import {
    evaluateStudynotesReflection,
    generateStudynotesQuiz,
    gradeStudynotesQuiz,
} from './ai'
import { studynotesSubjectValues } from '@shared/utils'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizResult,
} from '@shared/types'

type StudyNoteRow = typeof studyNotes.$inferSelect
type StudyQuizRow = typeof studyQuiz.$inferSelect

const QUIZ_ANSWER_MAX_LEN = 5000
const QUIZ_SIZE = 10
// 学科白名单需与原路由保持一致：基础学科来自 shared，science/custom 为兼容历史数据额外允许
const STUDYNOTE_SUBJECTS = new Set<string>([
    ...studynotesSubjectValues,
    'science',
    'custom',
])

// === 纯函数（数据转换/校验，无副作用） ===

// 入库前清洗：剔除 index>10 越界题与空题干，重排 index 为连续 1..N，杜绝脏数据入库
export function sanitizeQuizQuestions(
    questions: StudynotesQuizQuestion[],
): StudynotesQuizQuestion[] {
    const kept = questions.filter((q) => {
        if (!Number.isInteger(q.index) || q.index > QUIZ_SIZE) return false
        const text = q.question.trim()
        if (!text) return false
        return true
    })
    return kept.map((q, i) => ({ ...q, index: i + 1 }))
}

// JSON 字段可能损坏（迁移异常/手工改库），解析失败时回退安全默认值，避免整个接口 500
export function safeJsonParse<T>(raw: string | null, fallback: T): T
export function safeJsonParse<T>(raw: string | null, fallback: null): T | null
export function safeJsonParse<T>(
    raw: string | null,
    fallback: T | null,
): T | null {
    if (raw === null || raw === undefined) return fallback as T | null
    try {
        return JSON.parse(raw) as T
    } catch (error) {
        console.warn(
            '学习心得 JSON 字段解析失败，已回退默认值:',
            (error as Error).message,
        )
        return fallback as T | null
    }
}

export function mapQuizRow(row: StudyQuizRow): StudynotesQuiz {
    return {
        id: row.id,
        studynoteId: row.studynoteId,
        questions: safeJsonParse<StudynotesQuizQuestion[]>(
            row.questionsJson,
            [],
        ),
        answers: row.answersJson
            ? safeJsonParse<string[]>(row.answersJson, [])
            : null,
        results: row.resultsJson
            ? safeJsonParse<StudynotesQuizResult[]>(row.resultsJson, [])
            : null,
        score: row.score,
        correctCount: row.correctCount,
        comment: row.comment,
        suggestions: safeJsonParse<string[]>(row.suggestionsJson, []),
        generatedAt: row.generatedAt,
        submittedAt: row.submittedAt,
    }
}

// 校验答案：必须为长度 QUIZ_SIZE 的 string[]，任一非字符串即拒绝
export function validateAnswers(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null
    if (raw.length !== QUIZ_SIZE) return null
    if (!raw.every((item) => typeof item === 'string')) return null
    return raw.map((item) => (item as string).slice(0, QUIZ_ANSWER_MAX_LEN))
}

// === 业务函数（含 DB 操作，路由层仅负责参数解析与响应格式化） ===

export async function listStudyNotes(params: {
    subject?: string
    search?: string
}): Promise<Array<StudyNoteRow & { quizCount: number }>> {
    const filters = []
    if (
        params.subject &&
        typeof params.subject === 'string' &&
        STUDYNOTE_SUBJECTS.has(params.subject)
    ) {
        filters.push(eq(studyNotes.subject, params.subject))
    }

    const cards = await db
        .select()
        .from(studyNotes)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(studyNotes.createdAt))

    const countRows = await db
        .select({
            cardId: studyQuiz.studynoteId,
            count: sql<number>`COUNT(*)`,
        })
        .from(studyQuiz)
        .groupBy(studyQuiz.studynoteId)

    const countMap = new Map(countRows.map((r) => [r.cardId, r.count]))

    const result = cards.map((card) => ({
        ...card,
        quizCount: countMap.get(card.id) ?? 0,
    }))

    if (params.search && typeof params.search === 'string') {
        const keyword = params.search.toLowerCase()
        return result.filter(
            (r) =>
                r.topic.toLowerCase().includes(keyword) ||
                r.summary.toLowerCase().includes(keyword) ||
                r.example.toLowerCase().includes(keyword) ||
                r.stuckPoints.toLowerCase().includes(keyword),
        )
    }

    return result
}

export async function getStudyNote(
    id: number,
): Promise<StudyNoteRow | null> {
    const rows = await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.id, id))
        .limit(1)
    return rows[0] ?? null
}

export interface CreateStudyNoteInput {
    subject: string
    topic?: unknown
    summary: string
    example: string
    stuckPoints: string
    memoryHook?: unknown
    lessonId?: unknown
}

export async function createStudyNote(
    input: CreateStudyNoteInput,
): Promise<StudyNoteRow> {
    const normalizedLessonId =
        input.lessonId == null || input.lessonId === ''
            ? null
            : Number(input.lessonId)
    const inserted = await db
        .insert(studyNotes)
        .values({
            subject: input.subject,
            topic: typeof input.topic === 'string' ? input.topic : '',
            summary: input.summary,
            example: input.example,
            stuckPoints: input.stuckPoints,
            memoryHook:
                typeof input.memoryHook === 'string'
                    ? input.memoryHook
                    : null,
            lessonId: normalizedLessonId,
        })
        .returning()
    return inserted[0]
}

export interface UpdateStudyNotePatch {
    subject?: string
    topic?: string
    summary?: string
    example?: string
    stuckPoints?: string
    memoryHook?: string | null
}

export async function updateStudyNote(
    id: number,
    patch: UpdateStudyNotePatch,
): Promise<StudyNoteRow | null> {
    const setValues: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (patch.subject !== undefined) setValues.subject = patch.subject
    if (patch.topic !== undefined) setValues.topic = patch.topic
    if (patch.summary !== undefined) setValues.summary = patch.summary
    if (patch.example !== undefined) setValues.example = patch.example
    if (patch.stuckPoints !== undefined) setValues.stuckPoints = patch.stuckPoints
    if (patch.memoryHook !== undefined) setValues.memoryHook = patch.memoryHook

    const updated = await db
        .update(studyNotes)
        .set(setValues)
        .where(eq(studyNotes.id, id))
        .returning()
    return updated[0] ?? null
}

export async function deleteStudyNote(id: number): Promise<boolean> {
    const deleted = await db
        .delete(studyNotes)
        .where(eq(studyNotes.id, id))
        .returning()
    return deleted.length > 0
}

interface StudynotesCardInput {
    subject: string
    topic: string
    summary: string
    example: string
    stuckPoints: string
    memoryHook?: string | null
}

/** 把笔记行组装为 AI 评估/出题/批改所需的卡片输入 */
function buildCard(note: StudyNoteRow): StudynotesCardInput {
    return {
        subject: note.subject,
        topic: note.topic,
        summary: note.summary,
        example: note.example,
        stuckPoints: note.stuckPoints,
        memoryHook: note.memoryHook,
    }
}

export interface EvaluationResult {
    evaluation: Record<string, unknown>
    evaluatedAt: string
    reused: boolean
}

export async function evaluateStudyNote(
    id: number,
): Promise<EvaluationResult | null> {
    const rows = await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.id, id))
        .limit(1)
    if (!rows[0]) return null

    const card = rows[0]
    const existingEval = card.evaluation
        ? safeJsonParse<Record<string, unknown>>(card.evaluation, null)
        : null
    // 已有有效评估则直接复用，避免重复高成本 AI 调用（防止账单刷爆）
    if (
        existingEval &&
        typeof existingEval.completenessScore === 'number'
    ) {
        return {
            evaluation: existingEval,
            evaluatedAt: card.evaluatedAt ?? '',
            reused: true,
        }
    }

    const evaluationRaw = await evaluateStudynotesReflection(
        card.subject,
        card.topic,
        card.summary,
        card.example,
        card.stuckPoints,
    )
    const evaluation = safeJsonParse<Record<string, unknown>>(
        evaluationRaw,
        null,
    )
    if (!evaluation) {
        throw new Error('AI 返回内容无法解析')
    }

    const now = new Date().toISOString()
    await db
        .update(studyNotes)
        .set({
            evaluation: evaluationRaw,
            evaluatedAt: now,
            updatedAt: now,
        })
        .where(eq(studyNotes.id, id))

    return { evaluation, evaluatedAt: now, reused: false }
}

export interface GenerateQuizResult {
    quiz: StudynotesQuiz
}

export async function generateQuiz(
    id: number,
): Promise<GenerateQuizResult | null> {
    const rows = await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.id, id))
        .limit(1)
    if (!rows[0]) return null

    const card = rows[0]
    const evaluation = card.evaluation
        ? safeJsonParse<Record<string, unknown>>(card.evaluation, null)
        : null
    const completenessScore = evaluation?.completenessScore
    if (typeof completenessScore !== 'number' || completenessScore < 80) {
        throw new Error('AI 评估未达 80 分，暂不能开始测验')
    }

    // 幂等：复用已存在但未提交的测验，避免重复生成与孤儿记录
    const pending = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.studynoteId, id),
                sql`${studyQuiz.submittedAt} IS NULL`,
            ),
        )
        .limit(1)

    if (pending[0]) {
        return { quiz: mapQuizRow(pending[0]) }
    }

    const questions = await generateStudynotesQuiz(buildCard(card))
    // 入库前清洗：剔除越界题与空题干，重排 index 为连续 1..N
    const sanitized = sanitizeQuizQuestions(questions)

    const now = new Date().toISOString()
    let quizRow: StudyQuizRow | undefined

    // 并发竞态下 insert 可能因唯一约束冲突抛异常，捕获后回退复用已有未提交记录
    try {
        quizRow = (
            await db
                .insert(studyQuiz)
                .values({
                    studynoteId: id,
                    questionsJson: JSON.stringify(sanitized),
                    generatedAt: now,
                })
                .returning()
        )[0]
    } catch (insertError: unknown) {
        const message =
            insertError instanceof Error
                ? insertError.message
                : String(insertError)
        console.warn('并发生成测验冲突，回退复用已有记录:', message)
        const fallback = await db
            .select()
            .from(studyQuiz)
            .where(eq(studyQuiz.studynoteId, id))
            .orderBy(desc(studyQuiz.id))
            .limit(1)
        quizRow = fallback[0]
    }

    if (!quizRow) {
        throw new Error('生成测验失败')
    }

    return { quiz: mapQuizRow(quizRow) }
}

export async function saveQuizAnswers(
    id: number,
    quizId: number,
    answers: string[],
): Promise<{ success: true } | null> {
    const existing = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.id, quizId),
                eq(studyQuiz.studynoteId, id),
            ),
        )
        .limit(1)

    if (!existing[0]) return null
    if (existing[0].submittedAt) {
        throw new Error('该测验已提交，无法修改')
    }

    await db
        .update(studyQuiz)
        .set({
            answersJson: JSON.stringify(answers),
        })
        .where(eq(studyQuiz.id, quizId))

    return { success: true }
}

export async function submitQuiz(
    id: number,
    quizId: number,
    answers: string[],
): Promise<{ quiz: StudynotesQuiz } | null> {
    const existing = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.id, quizId),
                eq(studyQuiz.studynoteId, id),
            ),
        )
        .limit(1)

    if (!existing[0]) return null
    if (existing[0].submittedAt) {
        throw new Error('该测验已提交')
    }

    const card = await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.id, id))
        .limit(1)
    if (!card[0]) return null

    const questions =
        safeJsonParse<StudynotesQuizQuestion[]>(
            existing[0].questionsJson,
            [],
        ) ?? []

    const grade = await gradeStudynotesQuiz(
        buildCard(card[0]),
        questions,
        answers,
    )

    const now = new Date().toISOString()
    await db
        .update(studyQuiz)
        .set({
            answersJson: JSON.stringify(answers),
            resultsJson: JSON.stringify(grade.results),
            score: grade.score,
            correctCount: grade.correctCount,
            comment: grade.comment,
            suggestionsJson: JSON.stringify(grade.suggestions),
            submittedAt: now,
        })
        .where(eq(studyQuiz.id, quizId))

    // 回写最新分数快照到卡片
    await db
        .update(studyNotes)
        .set({
            quizScore: grade.score,
            updatedAt: now,
        })
        .where(eq(studyNotes.id, id))

    const updated = await db
        .select()
        .from(studyQuiz)
        .where(eq(studyQuiz.id, quizId))
        .limit(1)

    return { quiz: mapQuizRow(updated[0]) }
}

export async function gradeQuiz(
    id: number,
    quizId: number,
): Promise<{ quiz: StudynotesQuiz } | null> {
    const existing = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.id, quizId),
                eq(studyQuiz.studynoteId, id),
            ),
        )
        .limit(1)

    if (!existing[0]) return null
    // 仅允许「已提交但未批改」的旧记录执行补批改；已批改的记录不允许重复
    if (!existing[0].submittedAt || existing[0].resultsJson) {
        throw new Error('该记录当前状态不可批改')
    }

    const questions =
        safeJsonParse<StudynotesQuizQuestion[]>(
            existing[0].questionsJson,
            [],
        ) ?? []
    const answers = existing[0].answersJson
        ? safeJsonParse<string[]>(existing[0].answersJson, [])
        : []
    if (questions.length === 0) {
        throw new Error('该记录无题目，无法批改')
    }
    // 库内答案损坏为空数组时，批改会下标错位，直接拒绝而非静默批改
    if (answers.length === 0) {
        throw new Error('该记录无答题内容，无法批改')
    }

    const card = await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.id, id))
        .limit(1)
    if (!card[0]) return null

    const grade = await gradeStudynotesQuiz(
        buildCard(card[0]),
        questions,
        answers,
    )

    const now = new Date().toISOString()
    await db
        .update(studyQuiz)
        .set({
            resultsJson: JSON.stringify(grade.results),
            score: grade.score,
            correctCount: grade.correctCount,
            comment: grade.comment,
            suggestionsJson: JSON.stringify(grade.suggestions),
        })
        .where(eq(studyQuiz.id, quizId))

    // 回写最新分数快照到卡片
    await db
        .update(studyNotes)
        .set({
            quizScore: grade.score,
            updatedAt: now,
        })
        .where(eq(studyNotes.id, id))

    const updated = await db
        .select()
        .from(studyQuiz)
        .where(eq(studyQuiz.id, quizId))
        .limit(1)

    return { quiz: mapQuizRow(updated[0]) }
}

export async function getLatestQuiz(
    id: number,
): Promise<{ quiz: StudynotesQuiz | null }> {
    const rows = await db
        .select()
        .from(studyQuiz)
        .where(eq(studyQuiz.studynoteId, id))
        .orderBy(desc(studyQuiz.id))
        .limit(1)

    return { quiz: rows[0] ? mapQuizRow(rows[0]) : null }
}

export type { StudynotesQuizResult, StudynotesQuizQuestion }
