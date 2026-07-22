// 云函数侧领域类型（由 shared/types 移植并按云函数场景精简）

export type TaskType = 'composition' | 'mindmap' | 'notes'
export type TaskStatus = 'pending' | 'completed' | 'expired'
export type TaskGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E'
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
export type ExchangeStatus = 'active' | 'revoked'
export type TaskAI =
    | 'ai-score'
    | 'ai-title'
    | 'ai-task'
    | 'task-chat'
    | 'weekly-analyze'
    | 'weekly-chat'
    | 'studynotes-followup'
    | 'studynotes-evaluate'
export type TaskClass = string
export type StudynotesSubject = 'math' | 'chinese' | 'english' | 'science' | 'custom'

export interface TaskRow {
    id: number
    user_id: number
    title: string
    type: TaskType
    status: TaskStatus
    created_at: string
    updated_at: string
}

export interface SubmissionRow {
    id: number
    task_id: number
    user_id: number
    content: string
    grade: TaskGrade | null
    ai_score: string | null
    scored_at: string | null
    created_at: string
    updated_at: string
}

export interface PointRecordRow {
    id: number
    user_id: number
    type: PointRecordType
    amount: number
    reason: string
    rule_name: string | null
    related_id: number | null
    related_type: RelatedType | null
    created_at: string
}

export interface ExchangeRow {
    id: number
    user_id: number
    item_type: string
    points_cost: number
    detail: string
    status: ExchangeStatus
    created_at: string
    updated_at: string
}

export interface PointAdvanceRow {
    id: number
    user_id: number
    amount: number
    total_repayment: number
    installments: number
    installment_amount: number
    paid_installments: number
    status: 'active' | 'completed'
    created_at: string
    updated_at: string
}

export interface MonthSummaryRow {
    id: number
    user_id: number
    month: string
    base_points: number
    total_earn: number
    total_deduct: number
    total_exchanges: number
    balance: number
}

export interface AiScoreLogRow {
    id: number
    task_id: number
    submission_id: number
    user_id: number
    content: string
    grade: TaskGrade | null
    ai_score: string
    scored_at: string
    created_at: string
}

export interface AiUsageLogRow {
    id: number
    user_id: number
    project: string
    task_id: number | null
    task_title: string | null
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    created_at: string
}

export interface StudynotesRow {
    id: number
    user_id: number
    subject: string
    topic: string
    summary: string
    example: string
    stuck_points: string
    memory_hook: string | null
    evaluation: string | null
    evaluated_at: string | null
    follow_up_score: number | null
    created_at: string
    updated_at: string
}

export interface WeeklyReportRow {
    id: number
    user_id: number
    week_number: number
    year: number
    content: string
    analysis: string | null
    created_at: string
    updated_at: string
}

// ===== AI 结果类型 =====
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

export interface WeeklyAnalysis {
    praise: string
    difficultyHelp: string
    goalAdvice: string
    aiFeedbackAdvice: string
    summary: string
}

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}
