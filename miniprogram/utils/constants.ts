// 由 shared/utils、shared/constants 移植的小程序端枚举与标签

export const taskStatusLabels: Record<string, string> = {
    pending: '待完成',
    completed: '已完成',
    expired: '已过期',
}

export const taskTypeLabels: Record<string, string> = {
    composition: '作文',
    mindmap: '思维导图',
    notes: '读书笔记',
}

export const taskTypeValues = ['composition', 'mindmap', 'notes'] as const

export const defaultGradeValues = ['A+', 'A', 'B', 'C', 'D', 'E'] as const

export const exchangeStatusValues = ['active', 'revoked'] as const
export const exchangeStatusLabels: Record<string, string> = {
    active: '有效',
    revoked: '已撤销',
}

export const pointTypeLabels: Record<string, string> = {
    earn: '加分',
    deduct: '扣分',
}

export const relatedTypeLabels: Record<string, string> = {
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

export const studynotesSubjectValues = [
    'math',
    'chinese',
    'english',
    'science',
    'custom',
] as const

export const taskClassLabels = [
    '未定级',
    '一年级',
    '二年级',
    '三年级',
    '四年级',
    '五年级',
    '六年级',
]

export const gradeColors: Record<string, string> = {
    'A+': '#07C160',
    A: '#3AC97A',
    B: '#FF8C00',
    C: '#FA5151',
    D: '#FA5151',
    E: '#FA5151',
}
