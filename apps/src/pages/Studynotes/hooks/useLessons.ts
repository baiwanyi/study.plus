import { useQuery } from '@tanstack/react-query'
import { lessonsApi } from '@apps/utils/api'
import type { StudyLessonWithStatus } from '@shared/types'

export function useLessons(subject: string) {
    return useQuery<StudyLessonWithStatus[]>({
        queryKey: ['lessons', subject, 'list'],
        queryFn: () => {
            const params: Record<string, string> = {}
            if (subject) params.subject = subject
            return lessonsApi.list(params)
        },
    })
}
