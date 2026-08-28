'use client'
/**
 * 测验倒计时 Hook：封装 45 分钟限时的截止时刻裁决、每秒 tick、展示文案与超时通知。
 * 职责：以服务端裁决的 quiz.deadlineAt 绝对时刻为唯一真源锚定倒计时（多端共用同一真源，
 * 读数必然一致）、冻结态定格展示、每秒 tick、派生剩余展示文案与紧急态，并在「未超时 → 超时」
 * 跃迁时触发一次 onTimeUp 业务回调；同时经 getRemainingSeconds 暴露当前剩余秒数供冻结入库。
 * 复用约定：quiz 类型来自 @shared/types；开始计时经 studynotesApi.startQuizCountdown 由服务端
 * 幂等裁决；展示格式化与超时判定不对外暴露。
 * 关键约束：前端一律不得自行创造截止时刻（否则多端各自起算必然不一致）；deadlineAt 非空表示
 * 计时进行中（多端真源，旁观端只读取、绝不重新裁决，否则据陈旧快照续算会重置作答端计时）；
 * deadlineAt 为空且 remainingSeconds 非空表示计时已暂停（本端曾冻结，续算时作基准）；
 * 已提交/已批改一律终止计时并隐藏读数（快照提交后仍残留库中，仅凭 deadlineAt 判空不足）；
 * 冻结态不 tick 仅定格展示，且关闭弹窗不回写剩余量，避免旁观行为暂停他人计时；
 * onTimeUp 每个 deadline 至多触发一次；激活后首帧 remainingText 为 null（tick 前）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { studynotesApi } from '../../../services/studynotes'
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

// 测验是否处于可计时状态（未提交且未批改），兼作类型守卫收窄 quiz。
// 关键：remainingSeconds 快照在提交后仍残留在库中（生成时为满额、关闭弹窗时为冻结量），
// 仅凭 deadlineAt 判空不足以隐藏读数，故两个 effect 共用此判定，避免判定口径漂移
function isCountingQuiz(quiz: StudynotesQuiz | null): quiz is StudynotesQuiz {
    return quiz !== null && quiz.submittedAt === null && quiz.results === null
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
    /** 截止时刻是否已就绪（供调用方在冻结态定格展示前判断） */
    isDeadlineReady: boolean
}

export function useQuizCountdown(options: {
    /** 当前测验：已提交/已批改视为无倒计时；deadlineAt 为服务端裁决的绝对截止时刻 */
    quiz: StudynotesQuiz | null
    /** 计时是否激活（作答态为 true；冻结只读态为 false，仅定格展示） */
    active: boolean
    /** 卡片 ID：作答端裁决截止时刻时用于拼接待请求路径 */
    cardId: number | null
    /** 是否为作答端：仅作答端可发起「开始计时」裁决，只读查看端（家长端）永不发起 */
    canStartCountdown: boolean
    /** 「未超时 → 超时」跃迁时触发一次（如自动提交并批改的业务动作） */
    onTimeUp?: () => void
}): QuizCountdownState & {
    /** 当前剩余秒数（未就绪/首帧前为 null），供关闭弹窗时冻结入库 */
    getRemainingSeconds: () => number | null
} {
    const { quiz, active, cardId, canStartCountdown, onTimeUp } = options

    // 绝对截止时刻：一律来自服务端裁决，前端不再自行 Date.now() + 快照 起算，
    // 否则每个端都会造出一个互不相干的 deadline
    const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
    // 已发起过裁决的测验 ID：StrictMode 双挂载、quiz 抖动、effect 重跑都只发一次请求
    const startedQuizIdRef = useRef<number | null>(null)
    // 计时是否可用：两个 effect 共用同一判定，避免读数与截止时刻的口径漂移
    const isCounting = isCountingQuiz(quiz)

    useEffect(() => {
        // 已提交/已批改：计时已终止，清空截止时刻与裁决去重标记
        if (!isCounting) {
            setDeadlineAt(null)
            startedQuizIdRef.current = null
            return
        }

        // 计时未裁决：deadlineAt 为空，含「新测验」与「本端曾关闭弹窗冻结」（服务端冻结时
        // 已清空 deadlineAt、仅留 remainingSeconds 快照）。仅作答端（active 且有权）可发起
        // 裁决，服务端以该快照为基准裁定截止时刻，即完成续算；只读端（家长端）保持 null
        // 不显示，避免查看行为替作答端起算倒计时
        if (quiz.deadlineAt === null) {
            if (!canStartCountdown || !cardId || !active) {
                setDeadlineAt(null)
                return
            }
            if (startedQuizIdRef.current === quiz.id) return
            startedQuizIdRef.current = quiz.id
            let cancelled = false
            void studynotesApi
                .startQuizCountdown(cardId, quiz.id)
                .then(({ deadlineAt: started }) => {
                    if (cancelled) return
                    setDeadlineAt(started)
                })
                .catch((error: unknown) => {
                    if (cancelled) return
                    // 裁决失败仅告警：不阻断作答，倒计时退化为不显示
                    const message =
                        error instanceof Error ? error.message : String(error)
                    console.warn('开始测验计时失败：', message)
                    startedQuizIdRef.current = null
                })
            return () => {
                cancelled = true
            }
        }

        // 其余情况锚定服务端真源渲染：含「他端正在作答」（deadlineAt 非空）与裁决已完成。
        // 旁观态必须走此分支——deadlineAt 即作答端的真实截止时刻，据陈旧快照续算会把
        // 正在进行的计时整个重置，故旁观端永不发起裁决，只读取真源。
        // 「本端曾暂停」已由上方 deadlineAt 为空的分支处理：服务端以落库快照为基准
        // 裁定截止时刻，暂停期间流逝的时间自然不被计入
        startedQuizIdRef.current = quiz.id
        setDeadlineAt(quiz.deadlineAt)
    }, [quiz, isCounting, active, cardId, canStartCountdown])

    // null = 未计时或激活后首帧（首个 tick 前），避免误显示「时间已到」
    const [remainingMs, setRemainingMs] = useState<number | null>(null)
    // 镜像最新剩余毫秒供 getRemainingSeconds 读取：函数引用恒定，不经渲染链路
    const remainingMsRef = useRef<number | null>(null)
    // 镜像最新激活态：供引用恒定的 getRemainingSeconds 区分「本端作答」与「旁观冻结」
    const activeRef = useRef(active)
    activeRef.current = active
    // 记录已触发 onTimeUp 的截止时刻：同一 deadline 至多触发一次，
    // StrictMode 双挂载/开关弹窗等 effect 重跑不会重复触发；
    // 换测验产生新 deadline 时自然允许再次触发
    const firedDeadlineRef = useRef<number | null>(null)
    // 持有最新回调：onTimeUp 引用不稳定不会导致 tick effect 重置
    const onTimeUpRef = useRef(onTimeUp)
    onTimeUpRef.current = onTimeUp

    useEffect(() => {
        // 已提交/已批改：计时已终止，清空读数使倒计时徽章隐藏。
        // 关键：此时非激活且 deadlineAt 为空，若不加此守卫会落到下方暂停态分支，
        // 拿库中残留的 remainingSeconds 算出读数，导致已批改的测验仍挂着倒计时
        if (!isCounting) {
            remainingMsRef.current = null
            setRemainingMs(null)
            return
        }

        // 冻结态（未激活）：定格展示，绝不按绝对时刻持续回放，否则读数会一路递减到
        // 「超时」甚至误触发自动提交（只读端仅查看就替孩子交卷）。定格基准分两种：
        // 1) 他端正在作答（deadlineAt 非空）：真源即绝对截止时刻，取打开瞬间的剩余量定格，
        //    如实反映作答端当前读数，且不 tick、不判定超时；
        // 2) 本端曾暂停（deadlineAt 已清空）：以落库的冻结量定格，待续算时作为基准。
        if (!active) {
            const frozenMs =
                deadlineAt !== null
                    ? Math.max(0, deadlineAt - Date.now())
                    : quiz?.remainingSeconds !== null &&
                        quiz?.remainingSeconds !== undefined
                      ? quiz.remainingSeconds * 1000
                      : null
            remainingMsRef.current = frozenMs
            setRemainingMs(frozenMs)
            return
        }

        if (deadlineAt === null) {
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
    }, [deadlineAt, isCounting, active, quiz?.remainingSeconds])

    const isTimeUp =
        active &&
        deadlineAt !== null &&
        remainingMs !== null &&
        remainingMs <= 0
    // 冻结态不套用「时间已到」文案：此时定格的是待续算的剩余量（可能为 0），
    // 显示「时间已到」会误导用户以为已自动提交，统一按 mm:ss 定格展示
    const remainingText = active
        ? getRemainingText(remainingMs, isTimeUp)
        : remainingMs !== null
          ? formatCountdown(remainingMs)
          : null
    const isTimeUrgent =
        remainingMs !== null && remainingMs > 0
            ? remainingMs <= QUIZ_URGENT_MS
            : isTimeUp

    const getRemainingSeconds = useCallback((): number | null => {
        // 仅作答态（激活）才返回有效读数：旁观端关闭弹窗时若据此写库，
        // 会清空 deadlineAt 而暂停作答端正在进行的计时。
        // 冻结态（本端曾暂停）的快照已是最新冻结值，重复写库无意义，一并跳过
        if (!activeRef.current) return null
        if (remainingMsRef.current === null) return null
        return Math.max(0, Math.ceil(remainingMsRef.current / 1000))
    }, [])

    return {
        remainingText,
        isTimeUrgent,
        isDeadlineReady: deadlineAt !== null,
        getRemainingSeconds,
    }
}
