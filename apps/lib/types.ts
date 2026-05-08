export type TaskType = 'composition' | 'mindmap' | 'notes'

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
export type TaskAI = 'ai-score' | 'ai-title' | 'ai-task'
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
