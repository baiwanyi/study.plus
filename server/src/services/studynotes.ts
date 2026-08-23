import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { studynotesSubjectValues } from '@shared/utils'
import { db } from '../db/index'
import { studyNotes, studyQuiz, studyLessons } from '../db/schema'
import {
    evaluateStudynotesReflection,
    generateStudynotesQuiz,
    gradeStudynotesQuiz,
} from './ai'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizResult,
} from '@shared/types'

type StudyNoteRow = typeof studyNotes.$inferSelect
type StudyQuizRow = typeof studyQuiz.$inferSelect

const QUIZ_ANSWER_MAX_LEN = 5000
const QUIZ_SIZE = 20
// 学科白名单需与原路由保持一致：基础学科来自 shared，science/custom 为兼容历史数据额外允许
const STUDYNOTE_SUBJECTS = new Set<string>([
    ...studynotesSubjectValues,
    'science',
    'custom',
])

// === 纯函数（数据转换/校验，无副作用） ===

// 入库前清洗：剔除 index>20 越界题、空题干、非法题型与分值缺省的题目，重排 index 为连续 1..N，
// 并对总分兜底为 100（AI 给的 points 之和不为 100 时按题数平均分配），杜绝脏数据入库
export function sanitizeQuizQuestions(
    questions: StudynotesQuizQuestion[],
): StudynotesQuizQuestion[] {
    const kept = questions.filter((q) => {
        if (!Number.isInteger(q.index) || q.index > QUIZ_SIZE) return false
        // AI 输出不可控，题干可能是 null/数字/对象，统一转字符串再 trim，避免 .trim 抛错
        const text = String(q.question ?? '').trim()
        if (!text) return false
        // 题型必须合法（缺省按 essay 兼容旧数据）
        const type = q.type ?? 'essay'
        if (type !== 'single' && type !== 'multi' && type !== 'essay') {
            return false
        }
        // 客观题必须提供选项与答案，否则无法本地判分
        if (type === 'single' || type === 'multi') {
            if (!Array.isArray(q.options) || q.options.length < 2) {
                return false
            }
            if (!String(q.answer ?? '').trim()) return false
        }
        // 分值必须为正整数，缺失/非法剔除
        if (!Number.isInteger(q.points) || (q.points ?? 0) <= 0) return false
        return true
    })
    const normalized = kept.map((q, i) => ({ ...q, index: i + 1 }))
    // 总分兜底：Σpoints ≠ 100 时按题数平均分配，余数逐题补 1，保证题库总分恒为 100
    const total = normalized.reduce((sum, q) => sum + (q.points ?? 0), 0)
    if (total !== 100 && normalized.length > 0) {
        const base = Math.floor(100 / normalized.length)
        let remainder = 100 - base * normalized.length
        return normalized.map((q) => {
            const points = remainder > 0 ? base + 1 : base
            remainder -= 1
            return { ...q, points }
        })
    }
    return normalized
}

// 对外响应前剔除题目标准答案，防止作答态泄露答案；points 保留供前端展示分值
export function toQuizPublicDTO(quiz: StudynotesQuiz): StudynotesQuiz {
    return {
        ...quiz,
        questions: quiz.questions.map(({ answer: _answer, ...rest }) => rest),
    }
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
    // 类型守卫：全部元素为字符串才通过，之后 map 无需再断言
    if (!raw.every((item): item is string => typeof item === 'string')) {
        return null
    }
    return raw.map((item) => item.slice(0, QUIZ_ANSWER_MAX_LEN))
}

// === 业务函数（含 DB 操作，路由层仅负责参数解析与响应格式化） ===

// 由卡片 ID 解析其所属课程 ID。
// 路由/前端统一以卡片 ID 作为参数，而 study_quiz.study_id 关联的是 lesson.id（外键），
// 故所有涉及 study_quiz 的查询都需先将卡片 ID 转换为 lessonId，避免跨 id 空间匹配失败。
export async function resolveLessonId(cardId: number): Promise<number | null> {
    const [row] = await db
        .select({ lessonId: studyNotes.lessonId })
        .from(studyNotes)
        .where(eq(studyNotes.id, cardId))
        .limit(1)
    return row?.lessonId ?? null
}

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
): Promise<
    (StudyNoteRow & { subject: string; topic: string; quizScore: number | null }) | null
> {
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
    // 分数统一取自 study_quiz.score（取该卡片所属课程的最新一条测验分数）。
    // study_quiz.study_id 关联的是 lesson.id，故用卡片的 lessonId 查询。
    const [latestQuiz] = await db
        .select({ score: studyQuiz.score })
        .from(studyQuiz)
        .where(eq(studyQuiz.studyId, row.note.lessonId))
        .orderBy(desc(studyQuiz.id))
        .limit(1)
    return {
        ...row.note,
        subject: row.subject,
        topic: row.topic,
        quizScore: latestQuiz?.score ?? null,
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
    // 先取关联 lesson 的 subject/topic，作为返回字段（study_notes 已无冗余列）；
    // 目标 lesson 不存在时直接拒绝，避免写入无效外键（与 updateStudyNote 行为一致）
    const [lesson] = await db
        .select({
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyLessons)
        .where(eq(studyLessons.id, normalizedLessonId))
        .limit(1)
    if (!lesson) {
        throw new Error('目标 lesson 不存在，无法创建学习笔记')
    }
    const inserted = await db
        .insert(studyNotes)
        .values({
            summary: input.summary,
            example: input.example,
            stuckPoints: input.stuckPoints,
            memoryHook:
                typeof input.memoryHook === 'string' ? input.memoryHook : null,
            lessonId: normalizedLessonId,
        })
        .returning()
    // lesson 已在上方判空 throw，此处直接取值（subject/topic 为 notNull 列）
    return {
        ...inserted[0],
        subject: lesson.subject,
        topic: lesson.topic,
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
        // 改关联 lesson 时校验目标存在，避免写入无效外键
        const [lesson] = await db
            .select({ id: studyLessons.id })
            .from(studyLessons)
            .where(eq(studyLessons.id, patch.lessonId))
            .limit(1)
        if (!lesson) {
            throw new Error('目标 lesson 不存在，无法更新学习笔记')
        }
        setValues.lessonId = patch.lessonId
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
    // 仅当评估有效且评估发生在笔记最近一次更新之后才复用，避免笔记内容已修改
    // 仍复用旧评估导致结果与当前内容不符；笔记未变更时复用可防重复高成本 AI 调用
    const isEvalFresh =
        card.evaluatedAt != null &&
        card.updatedAt != null &&
        card.evaluatedAt >= card.updatedAt
    if (
        existingEval &&
        typeof existingEval.completenessScore === 'number' &&
        isEvalFresh
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
    // id 此处语义为 study_notes.id（卡片 ID，由路由/前端传入）。
    // study_quiz.study_id 关联的是 lesson.id（外键指向 study_lessons.id），
    // 故先由卡片解析出其所属 lessonId，再用于测验的查询与写入。
    const [noteRow] = await db
        .select({
            note: studyNotes,
            subject: studyLessons.subject,
            topic: studyLessons.topic,
        })
        .from(studyNotes)
        .innerJoin(studyLessons, eq(studyNotes.lessonId, studyLessons.id))
        .where(eq(studyNotes.id, id))
        .orderBy(asc(studyNotes.id))
        .limit(1)
    if (!noteRow) return null
    const lessonId = noteRow.note.lessonId

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

    // 幂等：仅复用「未提交」记录继续作答；已提交的历史不阻塞重新生成新题。
    // 部分唯一索引(study_id WHERE submitted_at IS NULL)保证同一时刻最多一套进行中，
    // 因此同一课程可有多套已提交历史，重新生成时插入新行。
    // 查询前置 json_valid 短路：questionsJson 若是损坏 JSON，json_array_length 会直接抛错导致 500，
    // json_valid 先判定再取长度可安全跳过脏数据
    const pending = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.studyId, lessonId),
                sql`${studyQuiz.submittedAt} IS NULL`,
                sql`json_valid(${studyQuiz.questionsJson}) = 1 AND json_array_length(${studyQuiz.questionsJson}) > 0`,
            ),
        )
        .orderBy(desc(studyQuiz.id))
        .limit(1)

    if (pending[0]) {
        return { quiz: toQuizPublicDTO(mapQuizRow(pending[0])) }
    }

    const questions = await generateStudynotesQuiz(buildCard(card))
    // 入库前清洗：剔除越界题与空题干，重排 index 为连续 1..N
    const sanitized = sanitizeQuizQuestions(questions)
    // 清洗后必须仍为完整题量：非法题被剔除会导致题库数量与 QUIZ_SIZE/前端 answers 长度错位，
    // 宁可整体失败也不写入残缺题库
    if (sanitized.length !== QUIZ_SIZE) {
        throw new Error(`AI 返回的题目清洗后不足${QUIZ_SIZE}题，请重新生成`)
    }

    const now = new Date().toISOString()
    let quizRow: StudyQuizRow | undefined

    // 并发竞态处理：部分唯一索引保证同一时刻最多一套未提交记录，
    // 冲突时静默跳过（onConflictDoNothing），再复用首条成功写入的未提交记录。
    await db
        .insert(studyQuiz)
        .values({
            studyId: lessonId,
            questionsJson: JSON.stringify(sanitized),
            generatedAt: now,
        })
        .onConflictDoNothing()

    const fallback = await db
        .select()
        .from(studyQuiz)
        .where(
            and(
                eq(studyQuiz.studyId, lessonId),
                sql`${studyQuiz.submittedAt} IS NULL`,
                sql`json_valid(${studyQuiz.questionsJson}) = 1 AND json_array_length(${studyQuiz.questionsJson}) > 0`,
            ),
        )
        .orderBy(desc(studyQuiz.id))
        .limit(1)
    quizRow = fallback[0]

    if (!quizRow) {
        throw new Error('生成测验失败')
    }

    return { quiz: toQuizPublicDTO(mapQuizRow(quizRow)) }
}

export async function saveQuizAnswers(
    id: number,
    quizId: number,
    answers: string[],
): Promise<{ success: true } | null> {
    const lessonId = await resolveLessonId(id)
    if (lessonId === null) return null
    const existing = await db
        .select()
        .from(studyQuiz)
        .where(and(eq(studyQuiz.id, quizId), eq(studyQuiz.studyId, lessonId)))
        .limit(1)

    if (!existing[0]) return null
    // 批改前可反复保存答案：仅「已批改」才锁定
    if (existing[0].resultsJson) {
        throw new Error('该测验已批改，无法修改答案')
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
    const lessonId = await resolveLessonId(id)
    if (lessonId === null) return null
    const existing = await db
        .select()
        .from(studyQuiz)
        .where(and(eq(studyQuiz.id, quizId), eq(studyQuiz.studyId, lessonId)))
        .limit(1)

    if (!existing[0]) return null
    // 批改前可反复提交：仅「已批改」才锁定，已提交未批改时允许覆盖答案并刷新提交时间
    if (existing[0].resultsJson) {
        throw new Error('该测验已批改，无法修改答案')
    }

    // 两步式：提交仅保存答案并标记已提交，AI 批改由 gradeQuiz 单独完成
    const now = new Date().toISOString()
    await db
        .update(studyQuiz)
        .set({
            answersJson: JSON.stringify(answers),
            submittedAt: now,
        })
        .where(eq(studyQuiz.id, quizId))

    const updated = await db
        .select()
        .from(studyQuiz)
        .where(eq(studyQuiz.id, quizId))
        .limit(1)

    return { quiz: toQuizPublicDTO(mapQuizRow(updated[0])) }
}

export async function gradeQuiz(
    id: number,
    quizId: number,
    latestAnswers?: string[],
): Promise<{ quiz: StudynotesQuiz } | null> {
    const lessonId = await resolveLessonId(id)
    if (lessonId === null) return null
    const existing = await db
        .select()
        .from(studyQuiz)
        .where(and(eq(studyQuiz.id, quizId), eq(studyQuiz.studyId, lessonId)))
        .limit(1)

    if (!existing[0]) return null
    // 仅允许「已提交但未批改」的记录执行批改；已批改的记录不允许重复
    if (!existing[0].submittedAt || existing[0].resultsJson) {
        throw new Error('该记录当前状态不可批改')
    }

    const questions =
        safeJsonParse<StudynotesQuizQuestion[]>(
            existing[0].questionsJson,
            [],
        ) ?? []
    // 批改前允许微调答案：传入 latestAnswers 则以其为准（并回写 answersJson），否则回退库内快照
    const answers =
        latestAnswers ??
        (existing[0].answersJson
            ? safeJsonParse<string[]>(existing[0].answersJson, [])
            : [])
    if (questions.length === 0) {
        throw new Error('该记录无题目，无法批改')
    }
    // 答案缺失/损坏为空数组时，批改会下标错位，直接拒绝而非静默批改
    if (!Array.isArray(answers) || answers.length === 0) {
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

    await db
        .update(studyQuiz)
        .set({
            // 批改采用最新答案时同步回写，保证库内答案与批改依据一致
            ...(latestAnswers
                ? { answersJson: JSON.stringify(latestAnswers) }
                : {}),
            resultsJson: JSON.stringify(grade.results),
            score: grade.score,
            correctCount: grade.correctCount,
            comment: grade.comment,
            suggestionsJson: JSON.stringify(grade.suggestions),
        })
        .where(eq(studyQuiz.id, quizId))

    const updated = await db
        .select()
        .from(studyQuiz)
        .where(eq(studyQuiz.id, quizId))
        .limit(1)

    return { quiz: toQuizPublicDTO(mapQuizRow(updated[0])) }
}

export async function getLatestQuiz(
    id: number,
): Promise<{ quiz: StudynotesQuiz | null }> {
    const lessonId = await resolveLessonId(id)
    if (lessonId === null) return { quiz: null }
    const rows = await db
        .select()
        .from(studyQuiz)
        .where(eq(studyQuiz.studyId, lessonId))
        .orderBy(desc(studyQuiz.id))
        .limit(1)

    return { quiz: rows[0] ? toQuizPublicDTO(mapQuizRow(rows[0])) : null }
}

export type { StudynotesQuizResult, StudynotesQuizQuestion }
