import type {
    ExchangeStatus,
    PointRecordType,
    RelatedType,
    TaskAI,
    TaskClass,
    TaskGrade,
    TaskStatus,
    TaskType,
} from './types'

// ===== 枚举 / 标签映射（由 shared/utils 移植）=====
export const taskStatus = ['pending', 'completed', 'expired'] as const
export const taskStatusLabels: Record<TaskStatus, string> = {
    pending: '待完成',
    completed: '已完成',
    expired: '已过期',
}

export const defaultGradeValues: readonly TaskGrade[] = ['A+', 'A', 'B', 'C', 'D', 'E']

export const exchangeStatusValues = ['active', 'revoked'] as const
export const exchangeStatusLabels: Record<ExchangeStatus, string> = {
    active: '有效',
    revoked: '已撤销',
}

export const pointTypeLabels: Record<PointRecordType, string> = {
    earn: '加分',
    deduct: '扣分',
}

export const relatedTypeValues = [
    'task',
    'submission',
    'exam',
    'extra',
    'custom',
    'exchange',
    'revoked',
    'advance',
] as const
export const relatedTypeLabels: Record<RelatedType, string> = {
    task: '作业',
    submission: '作业批改',
    exam: '单元测评',
    extra: '额外',
    custom: '自定义',
    exchange: '积分兑换',
    revoked: '已撤销',
    advance: '积分预支',
}

export const studynotesSubjectLabels: Record<string, string> = {
    math: '数学',
    chinese: '语文',
    english: '英语',
    science: '科学',
    custom: '自定义',
}
export const studynotesSubjectValues = ['math', 'chinese', 'english', 'science', 'custom'] as const

export const taskTypeValues = ['composition', 'mindmap', 'notes'] as const
export const taskTypeLabels: Record<TaskType, string> = {
    composition: '作文',
    mindmap: '思维导图',
    notes: '读书笔记',
}
export const taskTypeDefaultTitles: Record<TaskType, string> = {
    mindmap: '未命名思维导图',
    composition: '未命名作文',
    notes: '未命名读书笔记',
}

export const taskClassLabels: TaskClass[] = [
    '未定级',
    '一年级',
    '二年级',
    '三年级',
    '四年级',
    '五年级',
    '六年级',
]

export const taskAILabels: Record<TaskAI, string> = {
    'ai-score': '作业评分',
    'ai-title': '作业起名',
    'ai-task': '作业出题',
    'task-chat': '作业对话',
    'weekly-analyze': '周报分析',
    'weekly-chat': '周报对话',
    'studynotes-followup': '心得测验',
    'studynotes-evaluate': '心得评估',
}

// ===== 默认规则（options 初始化时写入 NoSQL，运行时以 NoSQL 为准）=====
export const defaultHomeworkRules: Array<{ grade: string; points: number }> = [
    { grade: 'A+', points: 50 },
    { grade: 'A', points: 20 },
    { grade: 'B', points: 10 },
    { grade: 'C', points: -10 },
    { grade: 'D', points: -20 },
    { grade: 'E', points: -50 },
]

export const defaultExamRules: Array<{ min: number; max: number; points: number }> = [
    { min: 0, max: 59, points: -50 },
    { min: 60, max: 69, points: -20 },
    { min: 70, max: 79, points: -10 },
    { min: 80, max: 89, points: 10 },
    { min: 90, max: 94, points: 20 },
    { min: 95, max: 100, points: 50 },
]

export const defaultExchangeRules: Array<{
    key: string
    label: string
    points: number
    ratio: number
    unit: string
}> = [
    { key: 'game', label: '娱乐时间', points: 1, ratio: 10, unit: '分钟' },
    { key: 'cash', label: '现金兑换', points: 10, ratio: 1, unit: '元' },
]

export const defaultSystemSettings = {
    pageSize: 20,
    autosaveInterval: 10,
    monthlyBasePoints: 500,
    minimumPointsForPrivileges: 100,
    advanceRepayRatio: 16,
    maxPendingAmount: 500,
}

export const defaultExamRemark = ['语文', '数学', '英语', '试卷订正']
export const defaultSubmissionRemark = [
    '数学同步',
    '语文同步',
    '英语同步',
    '5+3练习册',
    '口算练习',
    '阅读打卡',
    '写字练习',
]
export const defaultCustomRemark: string[] = []
export const defaultQuotes: string[] = [
    '学海无涯苦作舟。',
    '书山有路勤为径。',
    '读书破万卷，下笔如有神。',
    '黑发不知勤学早，白首方悔读书迟。',
    '少壮不努力，老大徒伤悲。',
    '千里之行，始于足下。',
    '业精于勤，荒于嬉。',
    '知之者不如好之者，好之者不如乐之者。',
    '学而不思则罔，思而不学则殆。',
    '温故而知新，可以为师矣。',
]

export const defaultTaskTitle: Record<TaskType, string> = {
    mindmap: '围绕成长的思维导图',
    composition: '记一件有意义的事',
    notes: '读一本好书，写一篇读书笔记',
}

export const DEFAULT_WEEKLY_AI_HELPER = '小花老师'

export const defaultExchangeRuleRemarks = [
    '法定节假日不受规则限制。',
    '白天时间：8:00~21:30，周末节假日：8:00~22:30',
    '夜间时间：21:30~次日 8:00，周末节假日：22:30~次日 8:00',
    '午休时间：13:00~14:00，此时间段为禁止时间',
]

export function getCurrentMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
