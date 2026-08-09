import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { lessonsApi } from '@apps/utils/api'
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
