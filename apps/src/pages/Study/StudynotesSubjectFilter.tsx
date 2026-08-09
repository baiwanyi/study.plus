'use client'

import type { FC } from 'react'
import { studynotesSubjectLabels, studynotesSubjectValues } from '@shared/utils'
import { Tabs } from '@components/Tabs'
import type { TabItem } from '@components/Tabs'

interface StudynotesSubjectFilterProps {
    subject: string
    onSubjectChange: (value: string) => void
}

const filterTabs: TabItem[] = [
    { key: '', label: '全部' },
    ...studynotesSubjectValues.map((s) => ({
        key: s,
        label: studynotesSubjectLabels[s],
    })),
]

export const StudynotesSubjectFilter: FC<
    StudynotesSubjectFilterProps
> = ({ subject, onSubjectChange }) => (
    <Tabs
        tabs={filterTabs}
        active={subject}
        onChange={onSubjectChange}
        background="gray"
        className="max-w-md"
    />
)
