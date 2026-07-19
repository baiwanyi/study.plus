import { useQuery } from '@tanstack/react-query'
import { studynotesApi } from '@apps/utils/api'
import type { StudynotesItem } from '@shared/types'

export function useStudynotes(subject: string) {
    return useQuery<StudynotesItem[]>({
        queryKey: ['studynotes', subject, 'list'],
        queryFn: () => {
            const params: Record<string, string> = {}
            if (subject) params.subject = subject
            return studynotesApi.list(params)
        },
    })
}
