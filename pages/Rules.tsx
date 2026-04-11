import { useState } from 'react'
import Tabs from '@components/Tabs'
import type { TabItem } from '@components/Tabs'
import { RulesHomework } from '@layout/RulesHomework'
import { RulesExam } from '@layout/RulesExam'
import { RulesExchange } from '@layout/RulesExchange'
import { RulesCustom } from '@layout/RulesCustom'
import { RulesSystem } from '@layout/RulesSystem'

type TabKey = 'homework' | 'exam' | 'exchange' | 'custom' | 'system'

const tabs: TabItem<TabKey>[] = [
    { key: 'homework', label: '作业评分' },
    { key: 'exam', label: '单元测评' },
    { key: 'exchange', label: '积分兑换' },
    { key: 'custom', label: '自定义规则' },
    { key: 'system', label: '系统设置' },
]

export default function Rules() {
    const [activeTab, setActiveTab] = useState<TabKey>('homework')

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">规则配置</h2>

            {/* Tabs */}
            <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

            {/* Tab Content */}
            <div className="card">
                {activeTab === 'homework' && <RulesHomework />}
                {activeTab === 'exam' && <RulesExam />}
                {activeTab === 'exchange' && <RulesExchange />}
                {activeTab === 'custom' && <RulesCustom />}
                {activeTab === 'system' && <RulesSystem />}
            </div>
        </div>
    )
}
