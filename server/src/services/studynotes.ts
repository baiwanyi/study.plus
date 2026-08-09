import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index'
import { studyNotes, studyQuiz, studyLessons } from '../db/schema'
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
            '学习管理 JSON 字段解析失败，已回退默认值:',
            (error as Error).message,
        )
        return fallback as T | null
    }
}

export function mapQuizRow(row: StudyQuizRow): StudynotesQuiz {
    return {
        id: row.id,
        studyId: row.studyId,
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
}): Promise<
    Array<StudyNoteRow & { quizCount: number; subject: string; topic: string }>
> {
    const filters = []
    if (
        params.subject &&
        typeof params.subject === 'string' &&
        STUDYNOTE_SUBJECTS.has(params.subject)
    ) {
        filters.push(eq(studyLessons.subject, params.subject))
    }

    const base = db
        .select({
            note: studyNotes,
            lessonSubject: studyLessons.subject,
            lessonTopic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(studyNotes.createdAt))
        .$dynamic()

    const rows = await base

    const countRows = await db
        .select({
            cardId: studyQuiz.studyId,
            count: sql<number>`COUNT(*)`,
        })
        .from(studyQuiz)
        .groupBy(studyQuiz.studyId)

    const countMap = new Map(countRows.map((r) => [r.cardId, r.count]))

    const result = rows.map((row) => ({
        ...row.note,
        subject: row.lessonSubject,
        topic: row.lessonTopic,
        quizCount: countMap.get(row.note.lessonId) ?? 0,
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
): Promise<(StudyNoteRow & { subject: string; topic: string }) | null> {
    const [row] = await db
        .select({
            note: studyNotes,
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(eq(studyNotes.id, id))
        .limit(1)
    if (!row) {
        return null
    }
    return {
        ...row.note,
        subject: row.subject,
        topic: row.topic,
    }
}

export interface CreateStudyNoteInput {
    summary: string
    example: string
    stuckPoints: string
    memoryHook?: unknown
    lessonId?: unknown
}

export async function createStudyNote(
    input: CreateStudyNoteInput,
): Promise<StudyNoteRow & { subject: string; topic: string }> {
    if (input.lessonId == null || input.lessonId === '') {
        throw new Error('创建学习笔记必须关联 lessonId')
    }
    const normalizedLessonId = Number(input.lessonId)
    // 非法非数字输入（如 'abc'）归一化为 NaN，写入 notNull 整型列会出错，须提前拒绝
    if (!Number.isFinite(normalizedLessonId) || normalizedLessonId <= 0) {
        throw new Error('创建学习笔记必须关联有效的 lessonId')
    }
    // 先取关联 lesson 的 subject/topic，回写笔记冗余列（当前 schema 仍保留）
    const [lesson] = await db
        .select({
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyLessons)
        .where(eq(studyLessons.id, normalizedLessonId))
        .limit(1)
    const inserted = await db
        .insert(studyNotes)
        .values({
            subject: lesson?.subject ?? '',
            topic: lesson?.topic ?? '',
            summary: input.summary,
            example: input.example,
            stuckPoints: input.stuckPoints,
            memoryHook:
                typeof input.memoryHook === 'string' ? input.memoryHook : null,
            lessonId: normalizedLessonId,
        })
        .returning()
    return {
        ...inserted[0],
        subject: lesson?.subject ?? '',
        topic: lesson?.topic ?? '',
    }
}

export interface UpdateStudyNotePatch {
    summary?: string
    example?: string
    stuckPoints?: string
    memoryHook?: string | null
    lessonId?: number
}

export async function updateStudyNote(
    id: number,
    patch: UpdateStudyNotePatch,
): Promise<StudyNoteRow | null> {
    const setValues: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
    }
    if (patch.summary !== undefined) setValues.summary = patch.summary
    if (patch.example !== undefined) setValues.example = patch.example
    if (patch.stuckPoints !== undefined)
        setValues.stuckPoints = patch.stuckPoints
    if (patch.memoryHook !== undefined) setValues.memoryHook = patch.memoryHook
    if (patch.lessonId !== undefined) {
        // 改关联 lesson 时校验目标存在，并同步回填 subject/topic 冗余列，避免与 lesson 脱节
        const [lesson] = await db
            .select({
                subject: studyLessons.subject,
                topic: studyLessons.topic,
            })
            .from(studyLessons)
            .where(eq(studyLessons.id, patch.lessonId))
            .limit(1)
        if (!lesson) {
            throw new Error('目标 lesson 不存在，无法更新学习笔记')
        }
        setValues.lessonId = patch.lessonId
        setValues.subject = lesson.subject
        setValues.topic = lesson.topic
    }

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

/** 把笔记行组装为 AI 评估/出题/批改所需的卡片输入（subject/topic 来自关联 lesson） */
function buildCard(
    note: StudyNoteRow & { subject: string; topic: string },
): StudynotesCardInput {
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
    const [row] = await db
        .select({
            note: studyNotes,
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(eq(studyNotes.id, id))
        .limit(1)
    if (!row) return null

    const card = { ...row.note, subject: row.subject, topic: row.topic }
    const existingEval = card.evaluation
        ? safeJsonParse<Record<string, unknown>>(card.evaluation, null)
        : null
    // 已有有效评估则直接复用，避免重复高成本 AI 调用（防止账单刷爆）
    if (existingEval && typeof existingEval.completenessScore === 'number') {
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
    // id 此处语义为 lesson.id：quiz 直接关联 study_lessons，笔记经 lessonId 回溯
    const [noteRow] = await db
        .select({
            note: studyNotes,
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(eq(studyNotes.lessonId, id))
        .orderBy(asc(studyNotes.id))
        .limit(1)
    if (!noteRow) return null

    const card = {
        ...noteRow.note,
        subject: noteRow.subject,
        topic: noteRow.topic,
    }
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
                eq(studyQuiz.studyId, id),
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

    // 并发竞态处理：基于 study_id 唯一约束，冲突时静默跳过（onConflictDoNothing），
    // 再复用首条成功写入的“未提交且题目非空”记录，避免重复生成与误复用历史旧题。
    await db
        .insert(studyQuiz)
        .values({
            studyId: id,
            questionsJson: JSON.stringify(sanitized),
            generatedAt: now,
        })
        .onConflictDoNothing({ target: studyQuiz.studyId })

    const fallback = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.studyId, id),
                sql`${studyQuiz.submittedAt} IS NULL`,
                sql`json_array_length(${studyQuiz.questionsJson}) > 0`,
            ),
        )
        .orderBy(desc(studyQuiz.id))
        .limit(1)
    quizRow = fallback[0]

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
        .where(and(eq(studyQuiz.id, quizId), eq(studyQuiz.studyId, id)))
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
        .where(and(eq(studyQuiz.id, quizId), eq(studyQuiz.studyId, id)))
        .limit(1)

    if (!existing[0]) return null
    if (existing[0].submittedAt) {
        throw new Error('该测验已提交')
    }

    const [noteRow] = await db
        .select({
            note: studyNotes,
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(eq(studyNotes.lessonId, id))
        .orderBy(asc(studyNotes.id))
        .limit(1)
    if (!noteRow) return null
    const card = {
        ...noteRow.note,
        subject: noteRow.subject,
        topic: noteRow.topic,
    }

    const questions =
        safeJsonParse<StudynotesQuizQuestion[]>(
            existing[0].questionsJson,
            [],
        ) ?? []

    const grade = await gradeStudynotesQuiz(buildCard(card), questions, answers)

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

    // 回写最新分数快照到卡片（id 此处为 lesson.id，经 lessonId 关联）
    await db
        .update(studyNotes)
        .set({
            quizScore: grade.score,
            updatedAt: now,
        })
        .where(eq(studyNotes.lessonId, id))

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
        .where(and(eq(studyQuiz.id, quizId), eq(studyQuiz.studyId, id)))
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

    const [noteRow] = await db
        .select({
            note: studyNotes,
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(eq(studyNotes.lessonId, id))
        .orderBy(asc(studyNotes.id))
        .limit(1)
    if (!noteRow) return null
    const card = {
        ...noteRow.note,
        subject: noteRow.subject,
        topic: noteRow.topic,
    }

    const grade = await gradeStudynotesQuiz(buildCard(card), questions, answers)

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

    // 回写最新分数快照到卡片（id 此处为 lesson.id，经 lessonId 关联）
    await db
        .update(studyNotes)
        .set({
            quizScore: grade.score,
            updatedAt: now,
        })
        .where(eq(studyNotes.lessonId, id))

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
        .where(eq(studyQuiz.studyId, id))
        .orderBy(desc(studyQuiz.id))
        .limit(1)

    return { quiz: rows[0] ? mapQuizRow(rows[0]) : null }
}

export type { StudynotesQuizResult, StudynotesQuizQuestion }
