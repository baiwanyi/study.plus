'use client'

import type { FC } from 'react'
import { feynmanSubjectLabels, feynmanSubjectValues } from '@shared/utils'
import { Tabs } from '@components/Tabs'
import type { TabItem } from '@components/Tabs'

interface FeynmanSubjectFilterProps {
    subject: string
    onSubjectChange: (value: string) => void
}

const filterTabs: TabItem[] = [
    { key: '', label: '全部' },
    ...feynmanSubjectValues.map((s) => ({
        key: s,
        label: feynmanSubjectLabels[s],
    })),
]

export const FeynmanSubjectFilter: FC<FeynmanSubjectFilterProps> = ({
    subject,
    onSubjectChange,
}) => (
    <Tabs
        tabs={filterTabs}
        active={subject}
        onChange={onSubjectChange}
        background="gray"
        className="max-w-md"
    />
)
