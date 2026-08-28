'use client'
/**
 * 学习管理前端 API 封装模块：统一收敛 /study 相关 HTTP 请求，提供心得 CRUD、AI 评估、
 * 测验生成/提交/批改，以及历史测验、错题本（单课程/全局）查询方法。
 * 复用约定：请求统一走 request 封装；入参在客户端先行校验（正整数/字符串数组）。
 * 关键约束：所有资源 ID 必须为正整数，非法入参在发请求前直接抛错。
 */
import { STUDY_QUIZ_TIME_LIMIT_SECONDS } from '@shared/constants'
import { request } from './request'
import type {
    StudynotesItem,
    StudynotesCreateRequest,
    StudynotesEvaluation,
    StudynotesQuiz,
    StudynotesQuizHistoryItem,
    WrongQuestion,
    WrongQuestionPage,
} from '@shared/types'

export interface WrongQuestionsAllQuery {
    page: number
    pageSize: number
    search?: string
    /** 按科目筛选（math/chinese/english/science/custom），缺省为全部科目 */
    subject?: string
}

function assertPositiveInt(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`无效的${field}: ${value}`)
    }
}

function assertStringArray(value: unknown, field: string): void {
    if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === 'string')
    ) {
        throw new Error(`${field} 必须为字符串数组`)
    }
}

export const studynotesApi = {
    list: (params?: Record<string, string>) => {
        const qs =
            params && Object.keys(params).length > 0
                ? '?' +
                  new URLSearchParams(
                      Object.fromEntries(
                          Object.entries(params).filter(
                              ([, value]) =>
                                  value !== undefined && value !== null,
                          ),
                      ),
                  ).toString()
                : ''
        return request<StudynotesItem[]>(`/study${qs}`)
    },
    get: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<StudynotesItem>(`/study/${id}`)
    },
    create: (data: StudynotesCreateRequest) =>
        request<StudynotesItem>('/study', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (
        id: number,
        data: Omit<Partial<StudynotesCreateRequest>, 'memoryHook'> & {
            memoryHook?: string | null
        },
    ) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<StudynotesItem>(`/study/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
    delete: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<{ success: boolean }>(`/study/${id}`, {
            method: 'DELETE',
        })
    },
    evaluate: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<{
            evaluation: StudynotesEvaluation
            evaluatedAt: string
        }>(`/study/${id}/evaluate`, { method: 'POST' })
    },
    generateQuiz: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<{ quiz: StudynotesQuiz }>(`/study/${id}/quiz`, {
            method: 'POST',
        })
    },
    getLatestQuiz: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<{ quiz: StudynotesQuiz | null }>(
            `/study/${id}/quiz/latest`,
        )
    },
    getQuizHistory: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<{ history: StudynotesQuizHistoryItem[] }>(
            `/study/${id}/quiz/history`,
        )
    },
    getQuizDetail: (id: number, quizId: number) => {
        assertPositiveInt(id, '学习管理 ID')
        assertPositiveInt(quizId, '测验 ID')
        return request<{ quiz: StudynotesQuiz }>(`/study/${id}/quiz/${quizId}`)
    },
    getQuizWrong: (id: number) => {
        assertPositiveInt(id, '学习管理 ID')
        return request<{ wrongQuestions: WrongQuestion[] }>(
            `/study/${id}/quiz/wrong`,
        )
    },
    getQuizWrongAll: (params: WrongQuestionsAllQuery) => {
        assertPositiveInt(params.page, '页码')
        assertPositiveInt(params.pageSize, '每页数量')
        const query: Record<string, string> = {
            page: String(params.page),
            pageSize: String(params.pageSize),
        }
        if (params.search) {
            query.search = params.search
        }
        if (params.subject) {
            query.subject = params.subject
        }
        return request<WrongQuestionPage>(
            `/study/quiz/wrong-all?${new URLSearchParams(query).toString()}`,
        )
    },
    saveQuizAnswers: (id: number, quizId: number, answers: string[]) => {
        assertPositiveInt(id, '学习管理 ID')
        assertPositiveInt(quizId, '测验 ID')
        assertStringArray(answers, '答案')
        return request<{ success: boolean }>(
            `/study/${id}/quiz/${quizId}/answers`,
            {
                method: 'PATCH',
                body: JSON.stringify({ answers }),
            },
        )
    },
    saveQuizRemainingSeconds: (
        id: number,
        quizId: number,
        remainingSeconds: number,
    ) => {
        assertPositiveInt(id, '学习管理 ID')
        assertPositiveInt(quizId, '测验 ID')
        if (
            !Number.isInteger(remainingSeconds) ||
            remainingSeconds < 0 ||
            remainingSeconds > STUDY_QUIZ_TIME_LIMIT_SECONDS
        ) {
            throw new Error(
                `剩余秒数必须为 0~${STUDY_QUIZ_TIME_LIMIT_SECONDS} 的整数`,
            )
        }
        return request<{ success: boolean }>(
            `/study/${id}/quiz/${quizId}/remaining-seconds`,
            {
                method: 'PATCH',
                body: JSON.stringify({ remainingSeconds }),
            },
        )
    },
    startQuizCountdown: (id: number, quizId: number) => {
        assertPositiveInt(id, '学习管理 ID')
        assertPositiveInt(quizId, '测验 ID')
        return request<{ deadlineAt: number }>(
            `/study/${id}/quiz/${quizId}/countdown/start`,
            {
                method: 'POST',
            },
        )
    },
    submitQuiz: (id: number, quizId: number, answers: string[]) => {
        assertPositiveInt(id, '学习管理 ID')
        assertPositiveInt(quizId, '测验 ID')
        assertStringArray(answers, '答案')
        return request<{ quiz: StudynotesQuiz }>(
            `/study/${id}/quiz/${quizId}/submit`,
            {
                method: 'POST',
                body: JSON.stringify({ answers }),
            },
        )
    },
    gradeQuiz: (id: number, quizId: number, answers?: string[]) => {
        assertPositiveInt(id, '学习管理 ID')
        assertPositiveInt(quizId, '测验 ID')
        if (answers !== undefined) {
            assertStringArray(answers, '答案')
        }
        return request<{ quiz: StudynotesQuiz }>(
            `/study/${id}/quiz/${quizId}/grade`,
            {
                method: 'POST',
                body: answers ? JSON.stringify({ answers }) : undefined,
            },
        )
    },
}
