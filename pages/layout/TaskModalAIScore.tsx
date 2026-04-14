import type { Task } from '@apps/lib/types'
import Modal from '@apps/components/Modal'

interface TaskModalAIScoreProps {
    open: boolean
    task: Task | null
    scoring: boolean
    onCancel: () => void
    onScore: () => void
}

export default function TaskModalAIScore({
    open,
    task,
    scoring,
    onCancel,
    onScore,
}: TaskModalAIScoreProps) {
    return (
        <Modal
            open={open}
            onCancel={onCancel}
            onConfirm={onScore}
            isDisabled={scoring}
            isLoading={scoring}
            title="DeepSeek AI 评分"
            confirmLabel="开始AI评分">
            <div className="space-y-2">
                <h4 className="font-medium flex items-center justify-between">
                    作业题目
                    {task?.submission?.grade && (
                        <span className="text-sm text-danger">
                            当前评分: {task.submission.grade}
                        </span>
                    )}
                </h4>
                <p className="font-medium text-sm text-headline">
                    {task?.title}
                </p>
            </div>
            <p className="text-sm text-muted">
                将使用 DeepSeek AI 对提交内容进行评分，自动计算积分。
                {task?.submission?.grade && '将覆盖当前评分。'}
            </p>
        </Modal>
    )
}
