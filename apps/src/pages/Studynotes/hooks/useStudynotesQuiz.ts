'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { studynotesApi } from '../../../utils/api/studynotes'
import type { StudynotesQuiz } from '@shared/types'

const QUIZ_SIZE = 10
const AUTO_SAVE_INTERVAL_MS = 30_000
const AUTO_SAVE_DEBOUNCE_MS = 1_000

type QuizStatus = 'idle' | 'generating' | 'answering' | 'grading' | 'graded' | 'error'

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
                    ? [...action.quiz.answers, ...Array(QUIZ_SIZE).fill('')].slice(0, QUIZ_SIZE)
                    : Array(QUIZ_SIZE).fill(''),
                status: action.quiz ? (action.quiz.submittedAt ? 'graded' : 'answering') : 'idle',
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

export function useStudynotesQuiz(cardId: number | null, canQuiz: boolean) {
    const [state, dispatch] = useReducer(reducer, initialState)
    const savedSnapshotRef = useRef<string>('')
    const lastEditedAtRef = useRef<number>(0)

    // 仅在「已出题、未提交、且答案有变化」时保存
    const shouldAutoSave = useCallback((): boolean => {
        if (!state.quiz || state.quiz.submittedAt) return false
        if (state.status !== 'answering') return false
        const current = JSON.stringify(state.answers)
        return current !== savedSnapshotRef.current
    }, [state.quiz, state.status, state.answers])

    const doAutoSave = useCallback(async (): Promise<void> => {
        if (!state.quiz || !cardId || !shouldAutoSave()) return
        try {
            await studynotesApi.saveQuizAnswers(cardId, state.quiz.id, state.answers)
            savedSnapshotRef.current = JSON.stringify(state.answers)
        } catch (error: unknown) {
            // 自动保存失败不阻断用户，仅记录日志
            const message = error instanceof Error ? error.message : String(error)
            console.warn('自动保存答题内容失败：', message)
        }
    }, [cardId, shouldAutoSave, state.quiz, state.answers])

    // 打开卡片时恢复现场
    useEffect(() => {
        if (!cardId) {
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
                if (quiz && !quiz.submittedAt) {
                    savedSnapshotRef.current = JSON.stringify(quiz.answers ?? Array(QUIZ_SIZE).fill(''))
                }
            })
            .catch((error: unknown) => {
                if (cancelled) return
                const message = error instanceof Error ? error.message : String(error)
                dispatch({ type: 'ERROR', message })
            })
        return () => {
            cancelled = true
        }
    }, [cardId])

    // 30 秒自动保存定时器
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
            // 卸载前做一次最终保存
            void doAutoSave()
        }
    }, [cardId, doAutoSave])

    const setAnswer = useCallback((index: number, value: string) => {
        lastEditedAtRef.current = Date.now()
        dispatch({ type: 'SET_ANSWER', index, value })
    }, [])

    const generate = useCallback(async (): Promise<void> => {
        if (!cardId) return
        dispatch({ type: 'GENERATE_START' })
        try {
            const { quiz } = await studynotesApi.generateQuiz(cardId)
            savedSnapshotRef.current = JSON.stringify(Array(QUIZ_SIZE).fill(''))
            dispatch({ type: 'GENERATE_SUCCESS', quiz })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            dispatch({ type: 'ERROR', message })
        }
    }, [cardId])

    const submit = useCallback(async (): Promise<void> => {
        if (!cardId || !state.quiz) return
        dispatch({ type: 'GRADE_START' })
        try {
            const { quiz } = await studynotesApi.submitQuiz(cardId, state.quiz.id, state.answers)
            savedSnapshotRef.current = JSON.stringify(state.answers)
            dispatch({ type: 'GRADE_SUCCESS', quiz })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            dispatch({ type: 'ERROR', message })
        }
    }, [cardId, state.quiz, state.answers])

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
        submit,
    }
}
