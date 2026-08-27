'use client'
/**
 * 课程列表查询 Hook：按可选科目筛选获取含学习状态的课程列表（TanStack Query）。
 * 复用约定：数据经 lessonsApi.list；queryKey 遵循 [resource, ...params, 'list'] 约定；
 * 供学习中心页面与全局错题本弹窗等消费。
 * 关键约束：subject 的 undefined 与空串须归一化后才可进入 queryKey，避免缓存键分裂。
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { lessonsApi } from '@apps/services'
import type { StudyLessonWithStatus } from '@shared/types'

export function useLessons(
    subject: string | undefined,
): UseQueryResult<StudyLessonWithStatus[]> {
    // 归一化：undefined 视为空串（全部科目），保证 queryKey 与请求参数稳定一致
    const normalizedSubject = subject ?? ''
    return useQuery<StudyLessonWithStatus[]>({
        queryKey: ['lessons', normalizedSubject, 'list'],
        queryFn: () => {
            const params: Record<string, string> = {}
            if (normalizedSubject) params.subject = normalizedSubject
            return lessonsApi.list(params)
        },
    })
}
