/**
 * 构建可预测的伪 AI 服务实现集合，用于替换 services/ai。
 * 全部返回可预测的结构化结果，使流程在无网络、无 API Key 下可重复运行。
 * 在 vi.mock 工厂内调用，返回的 vi.fn 实例可被测试断言与重置。
 * 该模块不依赖被测源码，仅 import { vi } from 'vitest' 以构造 mock 函数。
 */
import { vi } from 'vitest'

export function buildAiMock() {
    const scoreComposition = vi.fn(
        async (
            _content: string,
            _type: string,
            _title?: string,
            _taskId?: number,
        ) => ({
            grade: 'A',
            score: 95,
            comment: 'AI 评分：完成质量优秀',
            suggestions: ['保持节奏', '注意规范'],
        }),
    )

    const generateTitle = vi.fn(
        async (_content: string, _type: string, _taskId?: number) =>
            'AI 生成的心得标题',
    )

    const generateTaskTitle = vi.fn(
        async (_type: string, _grade: string) => 'AI 生成的任务标题',
    )

    const generateDemoSubmission = vi.fn(
        async (
            _content: string,
            _type: string,
            _title?: string,
            _taskId?: number,
        ) => 'AI 示范作答内容示例',
    )

    const chatAboutTask = vi.fn(
        async (
            _content: string,
            _type: string,
            _title: string,
            _messages: { role: 'user' | 'assistant'; content: string }[],
            _taskId?: number,
        ) => 'AI 任务对话回复',
    )

    const analyzeWeeklyReport = vi.fn(
        async (
            _content: unknown,
            _weekLabel?: string,
            _teacherName?: string,
            _studentGrade?: string,
        ) => ({
            praise: '本周进步明显',
            difficultyHelp: '遇到困难时可分步拆解',
            goalAdvice: '目标可更具体',
            aiFeedbackAdvice: '继续保持',
            summary: '总体表现良好',
        }),
    )

    const chatAboutWeeklyReport = vi.fn(
        async (
            _content: unknown,
            _messages: { role: 'user' | 'assistant'; content: string }[],
            _weekLabel?: string,
            _teacherName?: string,
            _studentGrade?: string,
        ) => 'AI 周报对话回复',
    )

    const evaluateStudynotesReflection = vi.fn(
        async (
            _subject: string,
            _topic: string,
            _summary: string,
            _example: string,
            _stuckPoints: string,
        ) =>
            JSON.stringify({
                completenessScore: 90,
                completenessComment: '内容完整',
                missingPoints: [],
                errors: [],
                improvementSuggestions: ['可补充细节'],
                overallComment: '整体良好',
            }),
    )

    const analyzePreview = vi.fn(
        async (
            _subject: string,
            _topic: string,
            _content: string,
            _oldKnowledge: string,
            _questions: string,
        ) =>
            JSON.stringify({
                completenessScore: 85,
                completenessComment: '预习充分',
                strengths: ['概念清晰'],
                gaps: [],
                classFocusPoints: ['重点公式'],
                overallComment: '不错',
            }),
    )

    const generateStudynotesQuiz = vi.fn(
        async (_card: unknown) =>
            Array.from({ length: 20 }, (_, i) => ({
                index: i + 1,
                question: `学习心得测验第${i + 1}题`,
                type: 'single',
                options: ['A', 'B'],
                answer: 'A',
                points: 5,
            })),
    )

    const gradeStudynotesQuiz = vi.fn(
        async (_card: unknown, questions: { index: number; question: string }[], answers: string[]) => {
            const results = questions.map((q, i) => ({
                index: q.index,
                question: q.question,
                studentAnswer: answers[i] ?? '',
                isCorrect: true,
                score: 10,
                correctAnswer: '参考答案',
                explanation: '解析说明',
            }))
            return {
                results,
                score: 100,
                correctCount: questions.length,
                comment: '全部正确',
                suggestions: [],
            }
        },
    )

    return {
        scoreComposition,
        generateTitle,
        generateTaskTitle,
        generateDemoSubmission,
        chatAboutTask,
        analyzeWeeklyReport,
        chatAboutWeeklyReport,
        evaluateStudynotesReflection,
        analyzePreview,
        generateStudynotesQuiz,
        gradeStudynotesQuiz,
    }
}
