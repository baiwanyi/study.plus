import { useQuery } from '@tanstack/react-query'
import { feynmanApi } from '@apps/utils/api'
import type { FeynmanCard } from '@shared/types'

export function useFeynmanCards(subject: string) {
    return useQuery<FeynmanCard[]>({
        queryKey: ['feynman', subject, 'list'],
        queryFn: () => {
            const params: Record<string, string> = {}
            if (subject) params.subject = subject
            return feynmanApi.list(params)
        },
    })
}
