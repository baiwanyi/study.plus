'use client'
/**
 * 测验倒计时 Hook：完整封装测验 45 分钟限时的计时、展示、超时通知与剩余快照读取。
 * 职责：激活时以 quiz.remainingSeconds 快照（无快照回退满额）锚定截止时刻、每秒 tick、
 * 派生剩余展示文案与紧急态，并在「未超时 → 超时」跃迁时触发一次 onTimeUp 业务回调；
 * 同时经 getRemainingSeconds 暴露当前剩余秒数，供调用方在关闭弹窗时冻结入库。
 * 复用约定：quiz 类型来自 @shared/types；限时口径复用 @shared/constants 的
 * STUDY_QUIZ_TIME_LIMIT_SECONDS；展示格式化与超时判定不对外暴露。
 * 关键约束：关闭弹窗期间时间冻结（非绝对截止），重开由调用方重新拉取快照后锚定续算；
 * onTimeUp 每个 deadline 至多触发一次；激活后首帧 remainingText 为 null（tick 前）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { STUDY_QUIZ_TIME_LIMIT_SECONDS } from '@shared/constants'
import type { StudynotesQuiz } from '@shared/types'

// 剩余时间不足 5 分钟标红提醒
const QUIZ_URGENT_MS = 5 * 60 * 1000

// 剩余时间展示：mm:ss
function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(minutes)}:${pad(seconds)}`
}

// 剩余时间文案：正常显示 mm:ss；已超时显示「时间已到」（替代徽章凭空消失，
// 让用户在自动提交+批改完成前明白发生了什么）；首帧/未计时返回 null
function getRemainingText(
    remainingMs: number | null,
    isTimeUp: boolean,
): string | null {
    if (isTimeUp) return '时间已到'
    if (remainingMs !== null && remainingMs > 0) {
        return formatCountdown(remainingMs)
    }
    return null
}

export interface QuizCountdownState {
    /** 展示文案：mm:ss /「时间已到」/ null（未计时或激活后首帧） */
    remainingText: string | null
    /** 红色脉冲提醒（剩余 ≤5 分钟或已超时） */
    isTimeUrgent: boolean
}

export function useQuizCountdown(options: {
    /** 当前测验：已提交/已批改视为无倒计时；remainingSeconds 为冻结快照 */
    quiz: StudynotesQuiz | null
    /** 是否激活计时（调用方组合 open && 作答态） */
    active: boolean
    /** 「未超时 → 超时」跃迁时触发一次（如自动提交并批改的业务动作） */
    onTimeUp?: () => void
}): QuizCountdownState & {
    /** 当前剩余秒数（未激活/首帧前为 null），供关闭弹窗时冻结入库 */
    getRemainingSeconds: () => number | null
} {
    const { quiz, active, onTimeUp } = options

    // 激活时以剩余秒数快照锚定截止时刻：关闭弹窗期间时间冻结，
    // 无快照（历史存量数据）回退满额限时；quiz 变化（重开恢复现场）时重锚定
    const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
    useEffect(() => {
        if (!quiz || quiz.submittedAt || quiz.results || !active) {
            setDeadlineAt(null)
            return
        }
        const snapshotSeconds =
            quiz.remainingSeconds ?? STUDY_QUIZ_TIME_LIMIT_SECONDS
        setDeadlineAt(Date.now() + snapshotSeconds * 1000)
    }, [quiz, active])

    // null = 未计时或激活后首帧（首个 tick 前），避免误显示「时间已到」
    const [remainingMs, setRemainingMs] = useState<number | null>(null)
    // 镜像最新剩余毫秒供 getRemainingSeconds 读取：函数引用恒定，不经渲染链路
    const remainingMsRef = useRef<number | null>(null)
    // 记录已触发 onTimeUp 的截止时刻：同一 deadline 至多触发一次，
    // StrictMode 双挂载/开关弹窗等 effect 重跑不会重复触发；
    // 换测验产生新 deadline 时自然允许再次触发
    const firedDeadlineRef = useRef<number | null>(null)
    // 持有最新回调：onTimeUp 引用不稳定不会导致 tick effect 重置
    const onTimeUpRef = useRef(onTimeUp)
    onTimeUpRef.current = onTimeUp

    useEffect(() => {
        if (deadlineAt === null || !active) {
            remainingMsRef.current = null
            setRemainingMs(null)
            return
        }
        const tick = () => {
            // 绝对时间计算：interval 漂移不影响准确性，后台节流后回前台立即恢复
            const remaining = deadlineAt - Date.now()
            remainingMsRef.current = remaining
            setRemainingMs(remaining)
            // 跃迁判定：重开超时测验时首个 tick 即补触发（如自动提交）
            if (remaining <= 0 && firedDeadlineRef.current !== deadlineAt) {
                firedDeadlineRef.current = deadlineAt
                onTimeUpRef.current?.()
            }
        }
        tick()
        const timer = setInterval(tick, 1000)
        return () => clearInterval(timer)
    }, [deadlineAt, active])

    const isTimeUp =
        active &&
        deadlineAt !== null &&
        remainingMs !== null &&
        remainingMs <= 0
    const remainingText = getRemainingText(remainingMs, isTimeUp)
    const isTimeUrgent =
        remainingMs !== null && remainingMs > 0
            ? remainingMs <= QUIZ_URGENT_MS
            : isTimeUp

    const getRemainingSeconds = useCallback((): number | null => {
        if (remainingMsRef.current === null) return null
        return Math.max(0, Math.ceil(remainingMsRef.current / 1000))
    }, [])

    return { remainingText, isTimeUrgent, getRemainingSeconds }
}
