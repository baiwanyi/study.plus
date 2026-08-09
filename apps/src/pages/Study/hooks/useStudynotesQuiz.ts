'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { studynotesApi } from '../../../utils/api/studynotes'
import type { StudynotesQuiz } from '@shared/types'

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
            return { ...state, status: 'generating', errorMsg: '' }
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

    // 批改前（含已提交未批改）只要答案有变化即保存；已批改后停止。完全基于 ref 读取，避免依赖 state.status 闭包
    const shouldAutoSave = useCallback((): boolean => {
        const { quiz, answers, status } = latestRef.current
        if (!quiz || quiz.results) return false
        if (status !== 'answering') return false
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
            // 卸载/切卡前做一次最终保存（doAutoSave 读取最新 ref，不会被旧闭包污染）
            void doAutoSave()
            // 注意：快照清空已移至 LOAD effect（跟随新卡片数据），此处不再清空，
            // 避免旧卡片慢速保存的 await 落库后误写回已被清空的 ref，造成快照污染
        }
    }, [cardId, doAutoSave])

    // 仅依赖稳定的 dispatch / lastEditedAtRef，引用恒定，便于下游 React.memo 优化
    const setAnswer = useCallback((index: number, value: string) => {
        lastEditedAtRef.current = Date.now()
        dispatch({ type: 'SET_ANSWER', index, value })
    }, [])

    const generate = useCallback(async (): Promise<void> => {
        const { cardId: id } = latestRef.current
        // 防重入：正在生成或已有未提交测验时拒绝重复生成，避免重复 AI 调用
        if (
            !id ||
            state.status === 'generating' ||
            (state.quiz && !state.quiz.submittedAt)
        )
            return
        dispatch({ type: 'GENERATE_START' })
        try {
            const { quiz } = await studynotesApi.generateQuiz(id)
            savedSnapshotRef.current = JSON.stringify(Array(QUIZ_SIZE).fill(''))
            dispatch({ type: 'GENERATE_SUCCESS', quiz })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            dispatch({ type: 'ERROR', message })
        }
    }, [state.status, state.quiz])

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
    }
}
