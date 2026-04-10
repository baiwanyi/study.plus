// ===== Enum Types =====
export type TaskType = 'composition' | 'mindmap'
export type TaskStatus = 'pending' | 'completed' | 'expired'
export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E'
export type PointRecordType = 'earn' | 'deduct'
export type RelatedType = 'task' | 'submission' | 'exam' | 'extra' | 'custom'
export type ExchangeItemType = string
export type ExchangeStatus = 'active' | 'revoked'

// ===== Database Model Types =====
interface TaskSubmission {
    id: number
    content: string
    grade: Grade | null
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
    grade: Grade | null
    aiScore: AIScoreResult | null
    scoredAt: string | null
    createdAt: string
}

export interface AIScoreResult {
    grade: Grade
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
    balance: number
    /** Available points for exchange (this month's earnings excluded) */
    availableBalance: number
    /** Minimum points required to use privileges (from rule_config) */
    minimumPointsForPrivileges: number
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

// ===== API Response Types =====
export interface PointStats {
    month: string
    totalEarn: number
    totalDeduct: number
    net: number
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

interface ExamRules {
    ranges: ExamRuleRange[]
    monthlyBasePoints: number
    minimumPointsForPrivileges: number
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
    exam: ExamRules
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
