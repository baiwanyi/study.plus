/**
 * 生成题目弹窗：选择年级与学科（下拉）、填写题目要求、题目数量，可附参考图片，提交后由服务端
 * 调用模型生成整份练习卷并保存为题库目录下的 Markdown 文件；标题由模型自拟。
 * 复用约定：@components/Modal 承载交互与加载态，libraryApi.generate 负责请求（自带 180s 超时），
 * formatErrorMessage 统一错误文案；年级与学科选项复用 @shared/utils 的既有常量。
 * 关键约束：参考图片最多 9 张，统一经 canvas 缩到长边 1600px 内再编码为 data URL 随 JSON 提交
 * （服务端按 data URL 白名单校验、不做远程抓取）；截图工具常见的 BMP 等位图也走同一转码路径；
 * 在要求框内粘贴剪贴板图片时直接进列表并阻止默认粘贴，items 与 files 只取其一避免重复添加；
 * 生成期间忽略取消与重复提交（一次出卷即一次计费）；成功后由 onGenerated 交回新文件路径，
 * 由页面刷新清单并打开该文件。
 */
'use client'

import { ImagePlus, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent } from 'react'
import { libraryApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'
import { Modal } from '@components/Modal'
import {
    studynotesSubjectLabels,
    studynotesSubjectValues,
    taskClassLabels,
} from '@shared/utils'

interface LibraryModalGenerateProps {
    open: boolean
    onCancel: () => void
    /** 生成并落盘成功后的回调，参数为新文件的相对路径 */
    onGenerated: (path: string) => void
}

/** 年级选项复用作业分级常量，出卷不需要「未定级」 */
const GRADE_OPTIONS = taskClassLabels.filter((label) => label !== '未定级')
/** 学科选项取学习管理支持的科目，展示中文名 */
const SUBJECT_OPTIONS = studynotesSubjectValues.map(
    (value) => studynotesSubjectLabels[value],
)

const DEFAULT_GRADE = '六年级'
const DEFAULT_SUBJECT = '数学'
const DEFAULT_QUESTION_COUNT = 10

/** 参考图片限制：与服务端保持一致，避免提交后才被拒绝 */
const MAX_IMAGES = 9
/** 单张 data URL 字符数上限，对应约 1.1MB 二进制；9 张合计仍小于服务端 20mb 的 body 上限 */
const MAX_IMAGE_CHARS = 1_500_000
/** 图片长边上限：超出则等比缩小，控制 base64 体积与视觉模型的输入成本 */
const MAX_IMAGE_EDGE = 1600

/**
 * 统一转成白名单图片的 data URL：先把长边压到 MAX_IMAGE_EDGE 内再编码，
 * 优先输出 PNG（截图文字更清晰），体积超标时退到 JPEG；
 * 解不出的文件（损坏、非常规位图）抛错，由调用方提示。
 */
function toSupportedDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
            try {
                const longestEdge = Math.max(
                    image.naturalWidth,
                    image.naturalHeight,
                )
                const scale = Math.min(1, MAX_IMAGE_EDGE / longestEdge)
                const canvas = document.createElement('canvas')
                canvas.width = Math.max(
                    1,
                    Math.round(image.naturalWidth * scale),
                )
                canvas.height = Math.max(
                    1,
                    Math.round(image.naturalHeight * scale),
                )
                const context = canvas.getContext('2d')
                if (!context) {
                    reject(new Error('当前浏览器无法处理该图片'))
                    return
                }
                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                const png = canvas.toDataURL('image/png')
                resolve(
                    png.length > MAX_IMAGE_CHARS
                        ? canvas.toDataURL('image/jpeg', 0.85)
                        : png,
                )
            } finally {
                URL.revokeObjectURL(objectUrl)
            }
        }
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('图片格式不受支持，请改用 PNG / JPEG / WebP'))
        }
        image.src = objectUrl
    })
}

/**
 * 从剪贴板收集图片：items 与 files 描述的是同一批图片（getAsFile 每次都会新建对象，
 * 按引用去重无效），故只取其一——优先 items（截图粘贴走 file 项），为空时回落到 files，
 * 避免同一张图被添加两次。
 */
function collectClipboardImages(data: DataTransfer): File[] {
    const fromItems = Array.from(data.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
    if (fromItems.length > 0) return fromItems
    return Array.from(data.files).filter((file) =>
        file.type.startsWith('image/'),
    )
}

export function LibraryModalGenerate({
    open,
    onCancel,
    onGenerated,
}: LibraryModalGenerateProps) {
    const [grade, setGrade] = useState(DEFAULT_GRADE)
    const [subject, setSubject] = useState(DEFAULT_SUBJECT)
    const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT)
    const [requirements, setRequirements] = useState('')
    const [images, setImages] = useState<string[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [error, setError] = useState('')
    const [imageError, setImageError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setGrade(DEFAULT_GRADE)
        setSubject(DEFAULT_SUBJECT)
        setQuestionCount(DEFAULT_QUESTION_COUNT)
        setRequirements('')
        setImages([])
        setError('')
        setImageError('')
    }

    const handleCancel = () => {
        // 生成中不允许关闭：请求已发出并计费，中途取消只会让用户看不到结果
        if (isGenerating) return
        reset()
        onCancel()
    }

    /** 逐张校验并追加，超出张数或体积不合规时给出明确提示而不是静默丢弃 */
    const appendImages = async (files: File[]) => {
        setImageError('')
        const imageFiles = files.filter((file) =>
            file.type.startsWith('image/'),
        )
        if (imageFiles.length === 0) {
            setImageError('仅支持图片内容')
            return
        }
        const remaining = MAX_IMAGES - images.length
        if (remaining <= 0) {
            setImageError(`最多添加 ${MAX_IMAGES} 张图片`)
            return
        }
        const accepted = imageFiles.slice(0, remaining)
        try {
            const dataUrls = await Promise.all(
                accepted.map(toSupportedDataUrl),
            )
            if (dataUrls.some((url) => url.length > MAX_IMAGE_CHARS)) {
                setImageError('单张图片过大，请裁剪或压缩后重试')
                return
            }
            setImages((prev) => [...prev, ...dataUrls])
            if (imageFiles.length > accepted.length) {
                setImageError(`最多添加 ${MAX_IMAGES} 张图片，多余的已忽略`)
            }
        } catch (err) {
            setImageError(formatErrorMessage(err))
        }
    }

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])
        // 清空 value，保证再次选择同一文件仍能触发 change
        event.target.value = ''
        if (files.length > 0) await appendImages(files)
    }

    const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const imageFiles = collectClipboardImages(event.clipboardData)
        if (imageFiles.length === 0) return
        // 剪贴板里是图片时阻止默认粘贴，避免把文件名或二进制内容塞进文本
        event.preventDefault()
        await appendImages(imageFiles)
    }

    const removeImage = (index: number) => {
        setImages((prev) => prev.filter((_, position) => position !== index))
        setImageError('')
    }

    const handleGenerate = async () => {
        if (isGenerating) return
        setIsGenerating(true)
        setError('')
        try {
            const result = await libraryApi.generate({
                grade,
                subject,
                requirements: requirements.trim(),
                questionCount,
                images: images.length > 0 ? images : undefined,
            })
            reset()
            onGenerated(result.path)
        } catch (err) {
            setError(formatErrorMessage(err))
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <Modal
            open={open}
            title="生成题目"
            size="lg"
            isScroll
            isLoading={isGenerating}
            isDisabled={isGenerating}
            onCancel={handleCancel}
            onConfirm={handleGenerate}
            confirmLabel="生成题目">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                        <label className="label">适用年级</label>
                        <select
                            className="regular-text"
                            value={grade}
                            disabled={isGenerating}
                            onChange={(event) => setGrade(event.target.value)}>
                            {GRADE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="label">学科</label>
                        <select
                            className="regular-text"
                            value={subject}
                            disabled={isGenerating}
                            onChange={(event) =>
                                setSubject(event.target.value)
                            }>
                            {SUBJECT_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="label">题目数量</label>
                        <input
                            className="regular-text"
                            type="number"
                            min={1}
                            max={40}
                            value={questionCount}
                            disabled={isGenerating}
                            onChange={(event) =>
                                setQuestionCount(Number(event.target.value))
                            }
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="label">题目要求</label>
                    <textarea
                        className="regular-text"
                        rows={4}
                        value={requirements}
                        disabled={isGenerating}
                        onChange={(event) =>
                            setRequirements(event.target.value)
                        }
                        onPaste={handlePaste}
                        placeholder="如：重点考查分数除法的变式与迁移，含 2 道工程问题；可直接粘贴截图，AI 会识别图片内容出题"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500">
                            上传或在要求框内 Ctrl+V 粘贴截图，最多 {MAX_IMAGES}{' '}
                            张，长边超过 {MAX_IMAGE_EDGE}px 会自动缩小
                        </p>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isGenerating || images.length >= MAX_IMAGES}
                            className="btn btn-outline btn-sm gap-1.5 shrink-0">
                            <ImagePlus className="size-4" />
                            上传图片
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={handleFileChange}
                        />
                    </div>
                    {images.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {images.map((url, index) => (
                                <div
                                    key={`${index}-${url.slice(-24)}`}
                                    className="relative">
                                    <img
                                        src={url}
                                        alt={`参考图片 ${index + 1}`}
                                        className="size-20 rounded-lg border border-gray-200 object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(index)}
                                        disabled={isGenerating}
                                        aria-label={`移除参考图片 ${index + 1}`}
                                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-gray-700 text-white transition-colors hover:bg-gray-900">
                                        <X className="size-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {imageError && (
                        <p className="text-xs text-danger">{imageError}</p>
                    )}
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 leading-relaxed">
                    <Sparkles className="size-4 shrink-0 text-primary" />
                    <p>
                        生成约需 30～90 秒。题目会侧重检验是否真正理解、能否迁移运用，
                        并按题库既有格式（做题要求、做题建议、连续题号、参考答案与易错点）
                        保存为 .md 文件，标题由 AI 根据年级、学科与题目要求自拟。
                    </p>
                </div>

                {error && <p className="text-sm text-danger">{error}</p>}
            </div>
        </Modal>
    )
}
