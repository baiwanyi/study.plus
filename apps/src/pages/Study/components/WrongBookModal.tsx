'use client'
/**
 * 全局错题本弹窗组件：跨课程聚合展示所有已批改测验的错题，支持搜索（防抖）、按科目筛选与分页。
 * 复用约定：数据经 useStudynotesQuizWrongAll 查询；科目选项/标签复用 @shared/utils 的
 * studynotesSubjectLabels；错题卡片复用 WrongQuestionCard。
 * 关键约束：仅 open 时发起查询；搜索/筛选变更均重置页码，避免停留在越界空页。
 */
import { useEffect, useState } from 'react'
import { Modal } from '@components/Modal'
import { studynotesSubjectLabels } from '@shared/utils'
import { useStudynotesQuizWrongAll } from '../hooks/useStudynotesQuiz'
import { WrongQuestionCard } from './QuizSidePanel'
import type { FC } from 'react'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

interface WrongBookModalProps {
    open: boolean
    onClose: () => void
}

export const WrongBookModal: FC<WrongBookModalProps> = ({ open, onClose }) => {
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [subject, setSubject] = useState('')
    const [page, setPage] = useState(1)

    // 搜索防抖：停止输入 300ms 后才同步到查询参数，并重置回第一页
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [searchInput])

    const { data, isLoading } = useStudynotesQuizWrongAll(
        open
            ? {
                  page,
                  pageSize: PAGE_SIZE,
                  ...(search ? { search } : {}),
                  ...(subject ? { subject } : {}),
              }
            : null,
    )

    const items = data?.items ?? []
    const total = data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    const handleSubjectChange = (value: string) => {
        setSubject(value)
        setPage(1)
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title="错题本"
            size="lg"
            isScroll>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="搜索题目或解析关键词"
                        className="form-input w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <select
                        value={subject}
                        onChange={(e) => handleSubjectChange(e.target.value)}
                        className="form-select w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        <option value="">全部科目</option>
                        {Object.entries(studynotesSubjectLabels).map(
                            ([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                    <span className="ml-auto text-xs text-gray-500">
                        共 {total} 条错题
                    </span>
                </div>

                {isLoading && items.length === 0 ? (
                    <div className="flex justify-center py-12 text-sm text-gray-400">
                        加载中…
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex justify-center py-12 text-sm text-gray-400">
                        没有找到错题，继续保持！
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <WrongQuestionCard
                                key={`${item.studyId}-${item.submittedAt}-${index}`}
                                item={item}
                                showSource={true}
                            />
                        ))}
                    </div>
                )}

                {total > PAGE_SIZE && (
                    <div className="flex items-center justify-center gap-3 text-sm">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((prev) => prev - 1)}
                            className="btn btn-outline px-3 py-1 disabled:opacity-40">
                            上一页
                        </button>
                        <span className="text-xs text-gray-500">
                            第 {page} / {totalPages} 页
                        </span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((prev) => prev + 1)}
                            className="btn btn-outline px-3 py-1 disabled:opacity-40">
                            下一页
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    )
}
