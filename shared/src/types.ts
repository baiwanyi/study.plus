/**
 * 前后端共享的类型与常量定义模块：集中声明 API 请求/响应结构、领域模型与展示标签。
 * 复用约定：前后端统一通过 @shared/types 引入，禁止各自重复声明同一结构。
 * 关键约束：字段语义直接影响数据库映射与 API 契约，变更须同步服务端 DTO 与前端消费方。
 */
import type { WeeklyReportContent } from './weekly'

export type TaskType = 'composition' | 'mindmap' | 'notes'

// ===== Studynotes Reflection Types =====
export type StudynotesSubject =
    | 'math'
    | 'chinese'
    | 'english'
    | 'science'
    | 'custom'

export interface StudynotesItem {
    id: number
    subject: string
    topic: string
    summary: string
    example: string
    stuckPoints: string
    memoryHook: string | null
    evaluation: string | null
    evaluatedAt: string | null
    lessonId?: number | null
    createdAt: string
    updatedAt: string
    quizCount?: number
    quizScore?: number | null
}

export type StudynotesQuizQuestionType = 'single' | 'multi' | 'essay'

export const STUDYNODES_QUIZ_TYPE_LABELS: Record<
    StudynotesQuizQuestionType,
    string
> = {
    single: '单选题',
    multi: '多选题',
    essay: '简答题',
}

export interface StudynotesQuizQuestion {
    index: number
    type: StudynotesQuizQuestionType
    question: string
    /** 该题分值，正整数，全部题目之和必须等于 100 */
    points: number
    /** 单选/多选选项（3~4 个），简答无 */
    options?: string[]
    /** 标准答案（服务端内部使用，API 响应前必须剔除） */
    answer?: string
}

export interface StudynotesQuizResult {
    index: number
    question: string
    studentAnswer: string
    isCorrect: boolean
    /** 该题实得分（0~该题 points，可含一位小数；未作答/答非所问为 0） */
    score: number
    correctAnswer: string
    explanation: string
}

export interface StudynotesQuiz {
    id: number
    studyId: number
    questions: StudynotesQuizQuestion[]
    answers: string[] | null
    results: StudynotesQuizResult[] | null
    score: number | null
    correctCount: number | null
    comment: string
    suggestions: string[]
    generatedAt: string
    submittedAt: string | null
}

/** 历史测验摘要项：仅含已提交记录，供历史测验列表展示 */
export interface StudynotesQuizHistoryItem {
    id: number
    score: number | null
    correctCount: number | null
    submittedAt: string
    generatedAt: string
}

/** 错题条目：由已批改测验中答错的题目聚合而成，options 供客观题答案还原为可读文本 */
export interface WrongQuestion {
    question: string
    type: StudynotesQuizQuestionType
    /** 客观题选项（简答为空数组） */
    options: string[]
    studentAnswer: string
    correctAnswer: string
    explanation: string
    /** 答错所在测验的提交时间 */
    submittedAt: string
    /** 所属课程 ID（study_quiz.study_id，即课程 lessonId） */
    studyId: number
    /** 所属课程主题（全局错题本展示来源） */
    studyTopic: string
}

/** 全局错题本分页响应 */
export interface WrongQuestionPage {
    items: WrongQuestion[]
    total: number
    page: number
    pageSize: number
}

export interface StudynotesEvaluation {
    completenessScore: number
    completenessComment: string
    missingPoints: string[]
    errors: Array<{
        description: string
        correction: string
    }>
    improvementSuggestions: string[]
    overallComment: string
}

export interface StudynotesCreateRequest {
    subject: string
    topic: string
    summary: string
    example: string
    stuckPoints: string
    memoryHook?: string
    lessonId?: number
}

// ===== Study Lesson / Preview Types =====
export interface StudyLesson {
    id: number
    subject: string
    topic: string
    createdAt: string
    updatedAt: string
}

export interface StudyLessonWithStatus extends StudyLesson {
    /** 预习是否已填写（三问任一有内容） */
    previewDone: boolean
    /** 预习是否已 AI 分析 */
    previewAnalyzed: boolean
    /** 预习分析完整度评分（弱化展示） */
    previewScore: number | null
    /** 关联心得 ID（一对一） */
    studynoteId: number | null
    /** 心得评估完整度评分 */
    studynoteScore: number | null
    /** 心得专属测验最新分数 */
    quizScore: number | null
}

export interface PreviewAnalysis {
    completenessScore: number
    completenessComment: string
    /** 做得好的地方 */
    strengths: string[]
    /** 预习不足 / 理解偏差 */
    gaps: string[]
    /** 课堂注意事项：正式课上需要重点听的知识点 */
    classFocusPoints: string[]
    overallComment: string
}

export interface StudyPreview {
    id: number
    lessonId: number
    content: string
    oldKnowledge: string
    questions: string
    aiAnalysis: string | null
    aiAnalyzedAt: string | null
    createdAt: string
    updatedAt: string
}

export interface StudyPreviewCreateRequest {
    content: string
    oldKnowledge: string
    questions: string
}

export interface StudynotesMessage {
    id: number
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    createdAt: string
}

export type TaskStatus = 'pending' | 'completed' | 'expired'
export type TaskClass =
    | '未定级'
    | '一年级'
    | '二年级'
    | '三年级'
    | '四年级'
    | '五年级'
    | '六年级'
export type TaskGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E'
export type TaskAI =
    | 'ai-score'
    | 'ai-title'
    | 'ai-task'
    | 'task-chat'
    | 'weekly-analyze'
    | 'weekly-chat'
    | 'preview-analyze'
    | 'notes-evaluate'
    | 'quiz-question'
    | 'quiz-marking'
export type PointCategoryType = 'exam' | 'submission' | 'custom'
export type PointRecordType = 'earn' | 'deduct'
export type RelatedType =
    | 'task'
    | 'submission'
    | 'exam'
    | 'extra'
    | 'custom'
    | 'exchange'
    | 'revoked'
    | 'advance'
export type ExchangeItemType = string
export type ExchangeStatus = 'active' | 'revoked'

// ===== Database Model Types =====
interface TaskSubmission {
    id: number
    content: string
    grade: TaskGrade | null
    aiScore: string | null
    scoredAt: string | null
    createdAt: string
}

export interface Task {
    id: number
    title: string
    type: TaskType
    status: TaskStatus
    createdAt: string
    // Joined submission data from API
    submission: TaskSubmission | null
    submittedAt: string | null
    gradedAt: string | null
    pointsEarned: number | null
    aiSuggestions: string[]
    aiComment: string | null
}

export interface Submission {
    id: number
    taskId: number
    content: string
    grade: TaskGrade | null
    aiScore: string | null
    scoredAt: string | null
    createdAt: string
}

export interface AIScoreResult {
    grade: TaskGrade
    score: number
    detailScores?: {
        appreciation?: number
        reflection?: number
        words?: number
    }
    comment: string
    suggestions: string[]
}

export interface PointRecord {
    id: number
    type: PointRecordType
    amount: number
    reason: string
    ruleName: string | null
    relatedId: number | null
    relatedType: RelatedType | null
    createdAt: string
}

export interface Exchange {
    id: number
    itemType: ExchangeItemType
    pointsCost: number
    detail: string | null
    status: ExchangeStatus
    createdAt: string
}

export interface MonthSummary {
    id: number
    month: string
    basePoints: number
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    /** Available points for exchange (this month's earnings, deductions and monthlyBasePoints are all frozen until next month) */
    availableBalance: number
    /** Minimum points required to use privileges (from options) */
    minimumPointsForPrivileges: number
    /** This month's initial base points from rules (frozen until next month) */
    monthlyBasePoints: number
}

// ===== API Request Types =====
export interface CreateTaskRequest {
    title: string
    type: TaskType
}

export interface UpdateTaskRequest {
    title?: string
    type?: TaskType
    status?: TaskStatus
}

export interface SubmitTaskRequest {
    content: string
}

export interface CreatePointRecordRequest {
    type: PointRecordType
    amount: number
    reason: string
    relatedType?: RelatedType
    relatedId?: number
    ruleName?: string
}

export interface CreateExchangeRequest {
    itemType: ExchangeItemType
    pointsCost: number
    detail?: string
}

export interface RevokeExchangeResponse {
    success: boolean
}

// ===== API Response Types =====
export interface SubmitTaskResponse {
    submission: Submission
    aiResult: AIScoreResult
    pointsEarned: number
}

export interface PointStats {
    month: string
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    net: number
}

// ===== Common API Response Types =====
export interface ApiErrorResponse {
    error: string
    balance?: number
}

export interface ApiSuccessResponse {
    success: boolean
}

// ===== Rules Types =====
export interface HomeworkGradeRule {
    grade: string
    points: number
}

export interface ExamRuleRange {
    min: number
    max: number
    points: number
}

/** @deprecated Use ExamRuleRange[] directly instead */
export interface ExamRules {
    ranges: ExamRuleRange[]
}

export interface ExchangeItemRule {
    key: string
    label: string
    points: number
    ratio: number
    unit: string
}

export interface CustomRule {
    id?: string
    name: string
    type: 'earn' | 'deduct'
    points: number
    description: string
}

export interface AllRules {
    homework: HomeworkGradeRule[]
    exam: ExamRuleRange[]
    exchange: ExchangeItemRule[]
    custom: CustomRule[]
}

// ===== Advance Types =====
export interface PointAdvance {
    id: number
    amount: number
    totalRepayment: number
    installments: number
    installmentAmount: number
    paidInstallments: number
    status: 'active' | 'completed'
    createdAt: string
}

export interface CreateAdvanceRequest {
    amount: number
    installments: number
}

export interface AdvanceSummary {
    totalPendingRepayment: number
    currentInstallmentDue: number
    totalRemainingInstallments: number
    remainingCredit: number
    maxPendingAmount: number
}

// ===== AI Score Log Types =====
export interface AiScoreLog {
    id: number
    taskId: number
    submissionId: number
    content: string
    grade: TaskGrade | null
    aiScore: string
    scoredAt: string
    createdAt: string
}

// ===== AI Usage Types =====
export interface AIUsageLog {
    id: number
    project: string
    taskId: number | null
    taskTitle: string | null
    promptTokens: number
    completionTokens: number
    totalTokens: number
    createdAt: string
}

export interface AIUsageSummary {
    project: string
    count: number
    totalPromptTokens: number
    totalCompletionTokens: number
    totalTokens: number
}

// ===== Share Stats Types =====
export interface ShareStats {
    month: string
    exchangeInfo: {
        totalDuration: number
        longestDay: string
        longestDayDuration: number
    }
    monthlyEarnExcluding: number
    monthlyDeductExcluding: number
    submissionEarnTotal: number
    examEarnTotal: number
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
}

// ===== Video Types =====
export interface Video {
    id: number
    path: string
    title: string
    md5: string
    views: number
    resumeTime: number
    favorite: number
    createdAt: string
}

export interface ScanResult {
    total: number
    new: number
    skipped: number
    deleted: number
    errors: string[]
}

// ===== Task Conversation Types =====
export interface TaskConversation {
    id: number
    taskId: number
    createdAt: string
    updatedAt: string
}

export interface TaskMessage {
    id: number
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    createdAt: string
}

// ===== Weekly Report Types =====
// WeeklyReportContent 类型由 Zod Schema 推导，见 apps/lib/weekly.ts

export interface WeeklyAnalysis {
    praise: string
    difficultyHelp: string
    goalAdvice: string
    aiFeedbackAdvice: string
    summary: string
}

export interface WeeklyReport {
    id: number
    weekNumber: number
    year: number
    content: string | WeeklyReportContent
    analysis: string | WeeklyAnalysis | null
    createdAt: string
    updatedAt: string
}

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

export interface WeeklyConversation {
    id: number
    weeklyReportId: number
    createdAt: string
    updatedAt: string
}

export interface WeeklyMessage {
    id: number
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    createdAt: string
}
