'use client'
/**
 * 学习管理测验前端状态与查询模块：核心 hook useStudynotesQuiz 以 useReducer 管理作答/提交/批改
 * 状态机并承担自动保存；另提供历史测验、测验详情、错题本（单课程/全局）等 TanStack Query 查询 hooks。
 * 复用约定：服务端数据交互统一经 studynotesApi；查询 key 遵循 [resource, ...params, kind] 约定。
 * 关键约束：自动保存以服务端快照比对去重，批改后锁定答案；查询 hooks 由调用方控制 enabled 避免无谓请求。
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
    studynotesApi,
    type WrongQuestionsAllQuery,
} from '../../../services/studynotes'
import type {
    StudynotesQuiz,
    StudynotesQuizHistoryItem,
    WrongQuestion,
    WrongQuestionPage,
} from '@shared/types'

const QUIZ_SIZE = 20
const AUTO_SAVE_INTERVAL_MS = 30_000
const AUTO_SAVE_DEBOUNCE_MS = 1_000

type QuizStatus =
    | 'idle'
    | 'generating'
    | 'answering'
    | 'grading'
    | 'graded'
    | 'error'

interface QuizState {
    status: QuizStatus
    quiz: StudynotesQuiz | null
    answers: string[]
    errorMsg: string
}

const initialState: QuizState = {
    status: 'idle',
    quiz: null,
    answers: Array(QUIZ_SIZE).fill(''),
    errorMsg: '',
}

type QuizAction =
    | { type: 'LOAD_START' }
    | { type: 'LOAD_SUCCESS'; quiz: StudynotesQuiz | null }
    | { type: 'GENERATE_START' }
    | { type: 'GENERATE_SUCCESS'; quiz: StudynotesQuiz }
    | { type: 'SET_ANSWER'; index: number; value: string }
    | { type: 'GRADE_START' }
    | { type: 'GRADE_SUCCESS'; quiz: StudynotesQuiz }
    | { type: 'ERROR'; message: string }

function reducer(state: QuizState, action: QuizAction): QuizState {
    switch (action.type) {
        case 'LOAD_START':
            return { ...state, status: 'idle', errorMsg: '' }
        case 'LOAD_SUCCESS':
            return {
                ...state,
                quiz: action.quiz,
                answers: action.quiz?.answers
                    ? [
                          ...action.quiz.answers,
                          ...Array(QUIZ_SIZE).fill(''),
                      ].slice(0, QUIZ_SIZE)
                    : Array(QUIZ_SIZE).fill(''),
                status: action.quiz
                    ? action.quiz.submittedAt
                        ? 'graded'
                        : 'answering'
                    : 'idle',
            }
        case 'GENERATE_START':
            // 重新生成时立即清空旧题目与答案：左侧切到「正在生成题目…」空态 loading，
            // 避免旧内容与新题混淆；quiz 为空时自动保存天然跳过，不会误写库
            return { ...initialState, status: 'generating', errorMsg: '' }
        case 'GENERATE_SUCCESS':
            return {
                ...state,
                quiz: action.quiz,
                answers: Array(QUIZ_SIZE).fill(''),
                status: 'answering',
            }
        case 'SET_ANSWER': {
            // 越界下标直接丢弃，避免稀疏数组/错位污染后续提交
            if (
                !Number.isInteger(action.index) ||
                action.index < 0 ||
                action.index >= state.answers.length
            ) {
                return state
            }
            const answers = [...state.answers]
            answers[action.index] = action.value
            return { ...state, answers }
        }
        case 'GRADE_START':
            return { ...state, status: 'grading', errorMsg: '' }
        case 'GRADE_SUCCESS':
            return { ...state, quiz: action.quiz, status: 'graded' }
        case 'ERROR':
            return { ...state, status: 'error', errorMsg: action.message }
        default:
            return state
    }
}

export function useStudynotesQuiz(
    cardId: number | null,
    canQuiz: boolean,
    onAutoSaveSuccess?: () => void,
    onAutoSaveError?: (message: string) => void,
) {
    const [state, dispatch] = useReducer(reducer, initialState)
    const savedSnapshotRef = useRef<string>('')
    const lastEditedAtRef = useRef<number>(0)
    // 用 ref 持有最新值，使 doAutoSave / 定时器不随每次输入或状态切换重建，避免闭包陈旧与定时器抖动
    const latestRef = useRef({
        cardId,
        quiz: state.quiz,
        answers: state.answers,
        status: state.status,
    })
    latestRef.current = {
        cardId,
        quiz: state.quiz,
        answers: state.answers,
        status: state.status,
    }

    // 批改前（含已提交未批改）只要答案有变化即保存；已批改（results 存在）后停止。
    // 注意「已提交未批改」的 status 是 graded，不能用 status === 'answering' 判断，
    // 否则批改前微调答案不会自动保存（用户直接关闭弹窗将丢失改动）。
    // 仅暂停于 AI 操作中（生成/批改），避免与写库流程竞争。
    const shouldAutoSave = useCallback((): boolean => {
        const { quiz, answers, status } = latestRef.current
        if (!quiz || quiz.results) return false
        if (status === 'grading' || status === 'generating') return false
        const current = JSON.stringify(answers)
        return current !== savedSnapshotRef.current
    }, [])

    const doAutoSave = useCallback(async (): Promise<void> => {
        const { cardId: id, quiz, answers } = latestRef.current
        if (!quiz || !id || !shouldAutoSave()) return
        try {
            await studynotesApi.saveQuizAnswers(id, quiz.id, answers)
            savedSnapshotRef.current = JSON.stringify(answers)
            // 自动保存成功回调（如 showSnackbar 提示），由调用方决定如何体现
            onAutoSaveSuccess?.()
        } catch (error: unknown) {
            // 自动保存失败不阻断用户，但通过回调提示（由调用方决定如何体现）
            const message =
                error instanceof Error ? error.message : String(error)
            console.warn('自动保存答题内容失败：', message)
            onAutoSaveError?.(message)
        }
    }, [shouldAutoSave, onAutoSaveSuccess, onAutoSaveError])

    // 打开卡片时恢复现场
    useEffect(() => {
        if (!cardId) {
            // 无卡片时清空快照，避免旧卡片残留污染
            savedSnapshotRef.current = ''
            dispatch({ type: 'LOAD_SUCCESS', quiz: null })
            return
        }
        let cancelled = false
        dispatch({ type: 'LOAD_START' })
        studynotesApi
            .getLatestQuiz(cardId)
            .then(({ quiz }) => {
                if (cancelled) return
                dispatch({ type: 'LOAD_SUCCESS', quiz })
                // 恢复现场后重置快照为新卡片的已存答案，使后续比对以服务端为准
                savedSnapshotRef.current = JSON.stringify(
                    quiz?.answers ?? Array(QUIZ_SIZE).fill(''),
                )
            })
            .catch((error: unknown) => {
                if (cancelled) return
                const message =
                    error instanceof Error ? error.message : String(error)
                dispatch({ type: 'ERROR', message })
            })
        return () => {
            cancelled = true
        }
    }, [cardId])

    // 30 秒自动保存定时器：doAutoSave 现仅依赖 onAutoSaveSuccess（稳定），定时器仅在 cardId 变化时重建
    useEffect(() => {
        if (!cardId) return
        const timer = setInterval(() => {
            const now = Date.now()
            // 防抖：最近 1 秒内编辑过则跳过本周期，等下一周期
            if (now - lastEditedAtRef.current < AUTO_SAVE_DEBOUNCE_MS) return
            void doAutoSave()
        }, AUTO_SAVE_INTERVAL_MS)

        return () => {
            clearInterval(timer)
            // 仅当真正卸载（cardId 未变化）才做最终保存；cardId 变化时 latestRef 已指向新卡片，
            // 此时保存会把旧卡片答案请求到新卡片 id 下（服务端归属校验会拒绝，但避免无意义请求）
            if (latestRef.current.cardId === cardId) {
                void doAutoSave()
            }
            // 注意：快照清空已移至 LOAD effect（跟随新卡片数据），此处不再清空，
            // 避免旧卡片慢速保存的 await 落库后误写回已被清空的 ref，造成快照污染
        }
    }, [cardId, doAutoSave])

    // 仅依赖稳定的 dispatch / lastEditedAtRef，引用恒定，便于下游 React.memo 优化
    const setAnswer = useCallback((index: number, value: string) => {
        lastEditedAtRef.current = Date.now()
        dispatch({ type: 'SET_ANSWER', index, value })
    }, [])

    // 保存剩余秒数快照：弹窗关闭时冻结倒计时，二次打开时续算；
    // 无进行中测验（已提交/已批改/未加载）时静默跳过，失败仅告警不阻断关闭流程
    const saveRemainingSeconds = useCallback(
        async (remainingSeconds: number): Promise<void> => {
            const { cardId: id, quiz: currentQuiz } = latestRef.current
            if (
                !id ||
                !currentQuiz ||
                currentQuiz.submittedAt ||
                currentQuiz.results
            ) {
                return
            }
            try {
                await studynotesApi.saveQuizRemainingSeconds(
                    id,
                    currentQuiz.id,
                    remainingSeconds,
                )
            } catch (error: unknown) {
                const message =
                    error instanceof Error ? error.message : String(error)
                console.warn('保存测验剩余时间失败：', message)
            }
        },
        [],
    )

    const generate = useCallback(async (): Promise<void> => {
        const { cardId: id, quiz, status } = latestRef.current
        // 防重入：正在生成、或存在任何未批改（results 为空）的测验时拒绝重新生成。
        // 注意不能用 submittedAt 判断——「已提交未批改」状态下重新生成会整体替换 quiz，
        // 导致已提交内容被直接丢弃且无法批改
        if (!id || status === 'generating' || (quiz && !quiz.results)) return
        dispatch({ type: 'GENERATE_START' })
        try {
            const { quiz: generated } = await studynotesApi.generateQuiz(id)
            savedSnapshotRef.current = JSON.stringify(Array(QUIZ_SIZE).fill(''))
            dispatch({ type: 'GENERATE_SUCCESS', quiz: generated })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            dispatch({ type: 'ERROR', message })
        }
    }, [])

    // 批改：用当前最新答案（含批改前微调内容）AI 批改，不重新作答
    const grade = useCallback(async (): Promise<void> => {
        const { cardId: id, quiz, answers } = latestRef.current
        // 防重入：仅允许「已提交但未批改」的记录执行批改
        if (
            !id ||
            !quiz ||
            !quiz.submittedAt ||
            quiz.results ||
            state.status === 'grading'
        )
            return
        dispatch({ type: 'GRADE_START' })
        try {
            const { quiz: updated } = await studynotesApi.gradeQuiz(
                id,
                quiz.id,
                answers,
            )
            savedSnapshotRef.current = JSON.stringify(answers)
            // 渲染前的后续调用（如自动链路）读 ref 而非 state，须同步维护，
            // 否则读到旧 quiz（submittedAt/results 未变）导致防重误判或误发保存
            latestRef.current = {
                ...latestRef.current,
                quiz: updated,
                status: 'graded',
            }
            dispatch({ type: 'GRADE_SUCCESS', quiz: updated })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            dispatch({ type: 'ERROR', message })
        }
    }, [state.status])

    const submit = useCallback(async (): Promise<boolean> => {
        const { cardId: id, quiz, answers } = latestRef.current
        // 防重入：已批改或正在提交时拒绝；批改前（含已提交未批改）允许反复提交
        if (!id || !quiz || quiz.results || state.status === 'grading')
            return false
        dispatch({ type: 'GRADE_START' })
        try {
            // 两步式：提交仅保存答案并标记已提交，批改由 grade 单独完成
            const { quiz: updated } = await studynotesApi.submitQuiz(
                id,
                quiz.id,
                answers,
            )
            savedSnapshotRef.current = JSON.stringify(answers)
            // 关键时序：dispatch 的重渲染走 MessageChannel 宏任务，而调用方
            // await submit() 的 continuation 是微任务——若不同步更新 ref，
            // 紧随的 grade() 会读到旧 quiz（submittedAt 仍为 null）而被防重拒绝，
            // 导致自动提交链路的批改静默失败
            latestRef.current = {
                ...latestRef.current,
                quiz: updated,
                status: 'graded',
            }
            dispatch({ type: 'GRADE_SUCCESS', quiz: updated })
            return true
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            dispatch({ type: 'ERROR', message })
            return false
        }
    }, [state.status])

    return {
        status: state.status,
        quiz: state.quiz,
        answers: state.answers,
        errorMsg: state.errorMsg,
        canQuiz,
        isEmpty: !state.quiz,
        isSubmitted: Boolean(state.quiz?.submittedAt),
        setAnswer,
        generate,
        grade,
        submit,
        saveRemainingSeconds,
    }
}

/** 历史测验摘要列表（仅已提交，倒序）；enabled 由调用方按面板展开状态控制 */
export function useStudynotesQuizHistory(
    cardId: number | null,
    enabled: boolean,
): UseQueryResult<StudynotesQuizHistoryItem[]> {
    return useQuery<StudynotesQuizHistoryItem[]>({
        queryKey: ['studynotes-quiz', cardId, 'history'],
        queryFn: async () => {
            if (cardId == null) {
                throw new Error('无效的卡片 ID')
            }
            const { history } = await studynotesApi.getQuizHistory(cardId)
            return history
        },
        enabled: enabled && cardId != null,
    })
}

/** 指定历史测验的完整内容（只读回看）；quizId 为 null 时不发起请求 */
export function useStudynotesQuizDetail(
    cardId: number | null,
    quizId: number | null,
): UseQueryResult<StudynotesQuiz> {
    return useQuery<StudynotesQuiz>({
        queryKey: ['studynotes-quiz', cardId, quizId, 'detail'],
        queryFn: async () => {
            if (cardId == null || quizId == null) {
                throw new Error('无效的记录 ID')
            }
            const { quiz } = await studynotesApi.getQuizDetail(cardId, quizId)
            return quiz
        },
        enabled: cardId != null && quizId != null,
    })
}

/** 单课程错题聚合列表（按题干去重，保留最近一次答错） */
export function useStudynotesQuizWrong(
    cardId: number | null,
    enabled: boolean,
): UseQueryResult<WrongQuestion[]> {
    return useQuery<WrongQuestion[]>({
        queryKey: ['studynotes-quiz', cardId, 'wrong'],
        queryFn: async () => {
            if (cardId == null) {
                throw new Error('无效的卡片 ID')
            }
            const { wrongQuestions } = await studynotesApi.getQuizWrong(cardId)
            return wrongQuestions
        },
        enabled: enabled && cardId != null,
    })
}

/** 全局错题本分页查询；params 为 null 时不发起请求（弹窗未打开） */
export function useStudynotesQuizWrongAll(
    params: WrongQuestionsAllQuery | null,
): UseQueryResult<WrongQuestionPage> {
    return useQuery<WrongQuestionPage>({
        queryKey: ['studynotes-quiz', 'wrong-all', params],
        queryFn: async () => {
            if (!params) {
                throw new Error('缺少查询参数')
            }
            return studynotesApi.getQuizWrongAll(params)
        },
        enabled: params !== null,
        // 翻页/筛选时保留上一页数据，避免列表闪烁回空
        placeholderData: (previous) => previous,
    })
}
