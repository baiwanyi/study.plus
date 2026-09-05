'use client'
/**
 * 课前预习课堂问答题状态管理：加载问答记录、生成 3 道题、提交作答并评分。
 * 复用约定：HTTP 走 lessonsApi；状态机用 useReducer 承载生成/提交/评分过程，
 * 请求序号防课程切换时的跨课程数据串扰（与 useStudynotesQuiz 一致）。
 * 关键约束：生成与提交均为写操作且调用 AI，服务端已加 aiLimiter；
 * 评分失败保留已生成题目以便重评；每次打开仅最新一次加载可见。
 */
import { useCallback, useReducer, useRef } from 'react'
import { useSnackbar } from '@components/Snackbar'
import { lessonsApi } from '@apps/services'
import type { StudyPreviewQuiz } from '@shared/types'

type Status =
    | 'idle'
    | 'loading'
    | 'generating'
    | 'answering'
    | 'grading'
    | 'graded'
    | 'error'

interface State {
    status: Status
    quiz: StudyPreviewQuiz | null
    errorMsg: string | null
}

type Action =
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; quiz: StudyPreviewQuiz | null }
    | { type: 'GEN_START' }
    | { type: 'GEN_SUCCESS'; quiz: StudyPreviewQuiz }
    | { type: 'SUBMIT_START' }
    | { type: 'SUBMIT_SUCCESS'; quiz: StudyPreviewQuiz }
    | { type: 'ERROR'; msg: string }

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'FETCH_START':
            return { ...state, status: 'loading', errorMsg: null }
        case 'FETCH_SUCCESS':
            return {
                ...state,
                status: action.quiz?.results ? 'graded' : action.quiz ? 'answering' : 'idle',
                quiz: action.quiz,
                errorMsg: null,
            }
        case 'GEN_START':
            return { ...state, status: 'generating', errorMsg: null }
        case 'GEN_SUCCESS':
            return { ...state, status: 'answering', quiz: action.quiz, errorMsg: null }
        case 'SUBMIT_START':
            return { ...state, status: 'grading', errorMsg: null }
        case 'SUBMIT_SUCCESS':
            return { ...state, status: 'graded', quiz: action.quiz, errorMsg: null }
        case 'ERROR':
            return { ...state, status: 'error', errorMsg: action.msg }
        default:
            return state
    }
}

interface UseStudynotesPreviewQuizResult {
    status: Status
    quiz: StudyPreviewQuiz | null
    errorMsg: string | null
    isGenerating: boolean
    isGrading: boolean
    hasQuiz: boolean
    isSubmitted: boolean
    load: (lessonId: number) => void
    generate: (lessonId: number) => Promise<void>
    submit: (lessonId: number, answers: string[]) => Promise<void>
}

export function useStudynotesPreviewQuiz(): UseStudynotesPreviewQuizResult {
    const { showSnackbar } = useSnackbar()
    const [state, dispatch] = useReducer(reducer, {
        status: 'idle',
        quiz: null,
        errorMsg: null,
    })
    const requestIdRef = useRef(0)

    const load = useCallback((lessonId: number) => {
        const myReq = ++requestIdRef.current
        dispatch({ type: 'FETCH_START' })
        lessonsApi
            .getPreviewQuiz(lessonId)
            .then(({ quiz }) => {
                if (myReq !== requestIdRef.current) return
                dispatch({ type: 'FETCH_SUCCESS', quiz })
            })
            .catch(() => {
                if (myReq !== requestIdRef.current) return
                dispatch({ type: 'ERROR', msg: '加载课堂问答题失败' })
            })
    }, [])

    const generate = useCallback(
        async (lessonId: number) => {
            const myReq = ++requestIdRef.current
            dispatch({ type: 'GEN_START' })
            try {
                const { quiz } = await lessonsApi.generatePreviewQuiz(lessonId)
                if (myReq !== requestIdRef.current) return
                dispatch({ type: 'GEN_SUCCESS', quiz })
                showSnackbar('已生成课堂问答题')
            } catch (err) {
                if (myReq !== requestIdRef.current) return
                const msg = err instanceof Error ? err.message : '生成失败'
                dispatch({ type: 'ERROR', msg })
                showSnackbar(msg, 'error')
            }
        },
        [showSnackbar],
    )

    const submit = useCallback(
        async (lessonId: number, answers: string[]) => {
            const myReq = ++requestIdRef.current
            dispatch({ type: 'SUBMIT_START' })
            try {
                const { quiz } = await lessonsApi.submitPreviewQuiz(lessonId, answers)
                if (myReq !== requestIdRef.current) return
                dispatch({ type: 'SUBMIT_SUCCESS', quiz })
                showSnackbar('提交成功，已评分')
            } catch (err) {
                if (myReq !== requestIdRef.current) return
                const msg = err instanceof Error ? err.message : '提交失败'
                dispatch({ type: 'ERROR', msg })
                showSnackbar(msg, 'error')
            }
        },
        [showSnackbar],
    )

    return {
        status: state.status,
        quiz: state.quiz,
        errorMsg: state.errorMsg,
        isGenerating: state.status === 'generating',
        isGrading: state.status === 'grading',
        hasQuiz: state.quiz != null,
        isSubmitted: state.quiz?.results != null,
        load,
        generate,
        submit,
    }
}
