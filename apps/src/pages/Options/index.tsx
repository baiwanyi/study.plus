import { useState } from 'react'
import Tabs from '@components/Tabs'
import type { TabItem } from '@components/Tabs'
import { RulesHomework } from './OptionsRulesHomework'
import { RulesExam } from './OptionsRulesExam'
import { RulesExchange } from './OptionsRulesExchange'
import { RulesCustom } from './OptionsRulesCustom'
import { RulesSystem } from './OptionsSystem'

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
            <h2>配置选项</h2>

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
