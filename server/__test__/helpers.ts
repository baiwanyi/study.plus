import { app } from '../src/index'

/** 测试统一使用的 API Key，与 setup.ts 中设置的 API_KEY 保持一致 */
export const API_KEY = process.env.API_KEY || 'test-api-key'

type SupertestRequest = (
    app: unknown,
) => { set: (key: string, value: string) => unknown }

let requestFn: SupertestRequest | undefined

// supertest 以 CJS `export =` 形式导出函数，经 vitest/esbuild 的动态 import 会被
// 多层包装，且不同加载时机形态不一致。这里在 beforeAll 时机通过动态 import 实际调用
// 验证，选取第一个返回带 .set 对象的可调用入口，避免形态差异。
// 须在每个测试文件 beforeAll 中 await initRequest() 初始化。
export async function initRequest(): Promise<void> {
    const mod = (await import('supertest')) as unknown as Record<string, unknown>
    const candidates: unknown[] = [
        mod,
        mod.default,
        (mod.default as Record<string, unknown> | undefined)?.default,
        mod.agent,
        (mod.default as Record<string, unknown> | undefined)?.agent,
    ]
    for (const candidate of candidates) {
        if (typeof candidate !== 'function') continue
        const result = (candidate as (a: unknown) => unknown)(app)
        if (result && typeof (result as Record<string, unknown>).set === 'function') {
            requestFn = candidate as SupertestRequest
            return
        }
    }
    throw new Error('无法从 supertest 动态导入解析出请求函数')
}

/** 携带认证头的 supertest 请求构造器，复用同一 Express app 实例走完整中间件链路 */
export function api() {
    if (!requestFn) {
        throw new Error('api 尚未初始化：请先在 beforeAll 中调用 initRequest()')
    }
    return requestFn(app).set('X-API-Key', API_KEY)
}

export interface TaskInput {
    type: string
    title: string
    content: string
    grade?: string
}

export function makeTask(input: Partial<TaskInput> = {}): TaskInput {
    return {
        type: 'homework',
        title: '数学练习题',
        content: '完成练习册第 1-3 页全部题目',
        grade: '初一',
        ...input,
    }
}

export interface StudyNoteInput {
    subject: string
    topic: string
    summary: string
    example: string
    stuckPoints: string
    memoryHook: string
}

export function makeStudyNote(
    input: Partial<StudyNoteInput> = {},
): StudyNoteInput {
    return {
        subject: 'math',
        topic: '分数的加减法',
        summary: '学习了同分母与异分母分数相加减的方法',
        example: '1/2 + 1/3 = 5/6',
        stuckPoints: '通分步骤容易出错',
        memoryHook: '通分先找公分母',
        ...input,
    }
}

export interface WeeklyReportInput {
    studentName: string
    grade: string
    weekStart: string
    weekEnd: string
    learned: string
    difficulties: string
    weakPoints: string
    achievement: string
    lastWeekGoalReview: string
    smartGoalSpecific: string
    smartGoalMeasurable: string
    smartGoalAchievable: string
    smartGoalRelevant: string
    smartGoalTimeBound: string
    improvement: string
}

export function makeWeeklyReport(
    input: Partial<WeeklyReportInput> = {},
): WeeklyReportInput {
    return {
        studentName: '小明',
        grade: '初一',
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        learned: '本周学了分数运算',
        difficulties: '通分容易错',
        weakPoints: '异分母加法',
        achievement: '完成全部作业',
        lastWeekGoalReview: '达成',
        smartGoalSpecific: '每天练习 10 道分数题',
        smartGoalMeasurable: '正确率 > 90%',
        smartGoalAchievable: '可执行',
        smartGoalRelevant: '针对薄弱点',
        smartGoalTimeBound: '本周内',
        improvement: '减少粗心',
        ...input,
    }
}

export interface ExchangeInput {
    itemType: string
    pointsCost: number
}

export function makeExchange(input: Partial<ExchangeInput> = {}): ExchangeInput {
    return {
        itemType: 'games',
        pointsCost: 100,
        ...input,
    }
}
