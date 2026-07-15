import { useQuery } from '@tanstack/react-query'
import { studynotesApi } from '@apps/utils/api'
import type { StudynotesCard } from '@shared/types'

export function useStudynotesCards(subject: string) {
    return useQuery<StudynotesCard[]>({
        queryKey: ['studynotes', subject, 'list'],
        queryFn: () => {
            const params: Record<string, string> = {}
            if (subject) params.subject = subject
            return studynotesApi.list(params)
        },
    })
}
