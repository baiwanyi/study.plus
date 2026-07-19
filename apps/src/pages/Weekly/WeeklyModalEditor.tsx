'use client'

import { useState } from 'react'
import AiChatPanel from '@components/AiChatPanel'
import { MarkdownField } from '@components/MarkdownField'
import { Modal } from '@components/Modal'
import { Tabs } from '@components/Tabs'
import type { ChatMessage, WeeklyAnalysis } from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'
import { AnalysisCards } from './AnalysisCards'

// ===== Constants =====

const SMART_TABS = [
    { key: 'S' as const, label: 'S - 具体的' },
    { key: 'M' as const, label: 'M - 可衡量' },
    { key: 'A' as const, label: 'A - 可实现' },
    { key: 'R' as const, label: 'R - 相关' },
    { key: 'T' as const, label: 'T - 有时限' },
] as const

const SMART_HINTS: Record<string, string> = {
    S: '目标要明确，不能模糊。❌ "学好数学" ✅ "掌握分数除法应用题，能正确列式解答"',
    M: '要有完成标准，能判断是否达成。❌ "多背单词" ✅ "默写Unit 3的15个单词，错误不超过2个"',
    A: '跳一跳够得着，不要太高或太低。❌ "一周数学考100分" ✅ "一周内每天做3道错题本上的同类题"',
    R: '和当前学习重点、弱项相关。❌ "学下学期的物理" ✅ "本周解决英语一般过去时不规则动词混淆"',
    T: '有明确截止时间。❌ "以后提高作文水平" ✅ "周五前完成一篇400字写人作文，并修改两处细节"',
}

const PLACEHOLDERS: Record<string, string> = {
    learned: '例：数学——分数乘法简便运算；英语——一般过去时动词变化',
    difficulties: '例：语文阅读理解中的概括题容易漏点；数学概念理解模糊',
    weakPoints: '例：英语不规则动词表还有5个不熟；化学方程式配平',
    achievement:
        '鼓励写下进步，如\u201c独立解出一道难题\u201d\u201c坚持早读3天\u201d',
    lastWeekGoalReview: '回顾上周 SMART 目标的完成情况，达到了哪些、未完成哪些',
    improvement: '例：用荧光笔划重点；先复习再做作业；睡前回忆当天知识点',
}

// ===== Props =====

export interface WeeklyModalEditorProps {
    open: boolean
    weekNumber: number
    form: WeeklyReportContent
    onFormChange: (field: keyof WeeklyReportContent, value: string) => void
    analysis: WeeklyAnalysis | null
    analyzing: boolean
    chatMessages: ChatMessage[]
    sending: boolean
    onSend: (message: string) => void
    onConfirm: () => void
    onCancel: () => void
    aiHelperName?: string
}

// ===== Component =====

export function WeeklyModalEditor({
    open,
    weekNumber,
    form,
    onFormChange,
    analysis,
    analyzing,
    chatMessages,
    sending,
    onSend,
    onConfirm,
    onCancel,
    aiHelperName = '费曼',
}: WeeklyModalEditorProps) {
    const [smartTab, setSmartTab] = useState('S')

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title={`第${weekNumber}周学习周报`}
            onConfirm={onConfirm}
            confirmLabel={analyzing ? '分析中...' : '保存并分析'}
            isLoading={analyzing}
            size="full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden -m-6">
                {/* ===== Left: Form + Analysis ===== */}
                <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-10rem)] p-6">
                    <AnalysisCards
                        analysis={analysis}
                        analyzing={analyzing}
                        isSplit={false}
                    />

                    <h4 className="font-semibold text-lg">本周总结</h4>

                    <MarkdownField
                        label="学到的东西"
                        value={form.learned}
                        onChange={(v) => onFormChange('learned', v)}
                        placeholder={PLACEHOLDERS.learned}
                    />
                    <MarkdownField
                        label="遇到的困难"
                        value={form.difficulties}
                        onChange={(v) => onFormChange('difficulties', v)}
                        placeholder={PLACEHOLDERS.difficulties}
                    />
                    <MarkdownField
                        label="没有掌握的知识点"
                        value={form.weakPoints}
                        onChange={(v) => onFormChange('weakPoints', v)}
                        placeholder={PLACEHOLDERS.weakPoints}
                    />
                    <MarkdownField
                        label="本周最有成就感的一件事"
                        value={form.achievement}
                        onChange={(v) => onFormChange('achievement', v)}
                        placeholder={PLACEHOLDERS.achievement}
                    />
                    <MarkdownField
                        label="上周目标达成情况"
                        value={form.lastWeekGoalReview}
                        onChange={(v) => onFormChange('lastWeekGoalReview', v)}
                        placeholder={PLACEHOLDERS.lastWeekGoalReview}
                    />

                    <h4 className="font-semibold text-lg">
                        下周规划 — SMART 目标
                    </h4>
                    <Tabs
                        tabs={
                            SMART_TABS as unknown as {
                                key: string
                                label: string
                            }[]
                        }
                        active={smartTab}
                        onChange={setSmartTab}
                        background="gray"
                    />
                    <MarkdownField
                        value={
                            form[
                                `smartGoal${smartTab}` as keyof WeeklyReportContent
                            ]
                        }
                        onChange={(v) =>
                            onFormChange(
                                `smartGoal${smartTab}` as keyof WeeklyReportContent,
                                v,
                            )
                        }
                        placeholder={SMART_HINTS[smartTab]}
                    />

                    <h4 className="font-semibold text-lg">改进方法</h4>
                    <MarkdownField
                        value={form.improvement}
                        onChange={(v) => onFormChange('improvement', v)}
                        placeholder={PLACEHOLDERS.improvement}
                    />
                </div>

                {/* ===== Right: AI Chat ===== */}
                <div className="flex flex-col h-full min-h-0 max-h-[calc(90vh-9rem)]">
                    {/* AiChatPanel */}
                    <div className="flex-1 min-h-0">
                        <AiChatPanel
                            messages={chatMessages}
                            onSend={onSend}
                            sending={sending}
                            aiHelperName={aiHelperName}
                            emptyText="保存周报并点击「保存并分析」后，可以在下方提问"
                        />
                    </div>
                </div>
            </div>
        </Modal>
    )
}
