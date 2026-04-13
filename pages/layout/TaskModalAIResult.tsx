import type { Task, AIScoreResult } from '@apps/lib/types'
import { defaultGradeColors } from '@apps/lib/utils'
import Modal from '@apps/components/Modal'

interface TaskModalAIResultProps {
    open: boolean
    task: Task | null
    result: AIScoreResult | null
    points: number
    onCancel: () => void
}

export default function TaskModalAIResult({
    open,
    result,
    points,
    onCancel,
}: TaskModalAIResultProps) {
    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title="评分结果"
            confirmLabel="确定">
            <div className="flex items-center justify-between gap-6">
                <div className="text-center space-y-2">
                    <p className="text-xs text-gray-700">等级</p>
                    <span
                        className={`badge ${result?.grade ? defaultGradeColors[result.grade] : ''} text-lg px-3 py-1`}>
                        {result?.grade}
                    </span>
                </div>
                <div className="text-center space-y-2">
                    <p className="text-xs text-gray-700">积分变化</p>
                    <p
                        className={`text-2xl font-bold ${points >= 0 ? 'text-success' : 'text-danger'}`}>
                        {points >= 0 ? '+' : ''}
                        {points}
                    </p>
                </div>
                {result?.score != null && result.score > 0 && (
                    <div className="text-center space-y-2">
                        <p className="text-xs text-gray-700">AI评分</p>
                        <p className="text-2xl font-bold">
                            <span className="text-danger">{result.score}</span>
                            <span className="text-base text-gray-700">
                                {' '}
                                / 100
                            </span>
                        </p>
                    </div>
                )}
            </div>
            {result?.comment && (
                <div className="space-y-2">
                    <h5 className="text-sm font-medium text-headline">评语</h5>
                    <p className="text-sm text-gray-600">{result.comment}</p>
                </div>
            )}
            {result?.suggestions && result.suggestions.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-headline">
                        改进建议
                    </p>
                    <ul className="text-sm text-gray-600 list-disc list-inside">
                        {result.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                        ))}
                    </ul>
                </div>
            )}
        </Modal>
    )
}
