'use client'
/**
 * 测验倒计时 Hook：基于目标截止时刻每秒 tick 计算剩余毫秒数。
 * 复用约定：仅负责剩余时间计算与展示刷新，不感知业务（自动提交等由调用方基于返回值处理）。
 * 关键约束：deadline 为 null 或未激活时停止 tick 并归零，避免空转；cleanup 清除定时器防泄漏。
 */
import { useEffect, useState } from 'react'

/** 倒计时 hook：每秒 tick 返回剩余毫秒；deadline 为 null 或未激活时归零并停止 tick。
 * 返回值可能为负数（已超过截止时刻），由调用方判定超时；deadline 生效后的首帧
 * 返回 0（尚未 tick），调用方应以 >0 判断是否展示 */
export function useQuizCountdown(
    deadlineAt: number | null,
    active: boolean,
): number {
    const [remainingMs, setRemainingMs] = useState(0)
    useEffect(() => {
        if (deadlineAt === null || !active) {
            setRemainingMs(0)
            return
        }
        const tick = () => setRemainingMs(deadlineAt - Date.now())
        tick()
        const timer = setInterval(tick, 1000)
        return () => clearInterval(timer)
    }, [deadlineAt, active])
    return remainingMs
}
