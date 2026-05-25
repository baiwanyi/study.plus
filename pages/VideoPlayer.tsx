import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { videosApi } from '@apps/lib/api'
import type { Video, ScanResult } from '@apps/lib/types'
import Loading from '@apps/components/Loading'
import {
    Edit3,
    Check,
    X,
    ChevronUp,
    ChevronDown,
    RefreshCw,
    CheckCircle,
    Play,
    CirclePlay,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Heart,
    Star,
    House,
    ShieldAlert,
} from 'lucide-react'
import { isAdmin } from '@/apps/lib/utils'
import { useSnackbar } from '@components/Snackbar'

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

export default function VideoPlayer() {
    const { md5 } = useParams<{ md5: string }>()
    const { showSnackbar } = useSnackbar()
    const navigate = useNavigate()
    const [video, setVideo] = useState<Video | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [editing, setEditing] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [saving, setSaving] = useState(false)
    const [currentIndex, setCurrentIndex] = useState(-1)
    const [totalVideos, setTotalVideos] = useState(0)
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [scanProgress, setScanProgress] = useState(0)
    const [showResetBtn, setShowResetBtn] = useState(true)
    const [playing, setPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)

    // 缓存全量视频列表和播放队列，避免重复请求
    const videoListRef = useRef<Video[]>([])
    const queueRef = useRef<string[]>([]) // 排好序的 md5 列表
    const loadedRef = useRef(false)

    // 构建播放队列：未播放（views===0）随机在前 → 已播放随机在后
    const buildQueue = useCallback((list: Video[]): Video[] => {
        const unwatched = list.filter((v) => v.views === 0)
        const watched = list.filter((v) => v.views > 0)
        return [...shuffle(unwatched), ...shuffle(watched)]
    }, [])

    // 切入指定索引的视频（纯状态更新，不转跳 URL）
    const playAt = useCallback(
        (idx: number) => {
            const queue = queueRef.current
            if (idx < 0 || idx >= queue.length) return
            const targetMd5 = queue[idx]
            const target = videoListRef.current.find((v) => v.md5 === targetMd5)
            if (!target) return

            // 保存当前视频播放进度（已播完的不保存，避免记录 duration）
            const currentVideo = videoRef.current
            if (currentVideo && video?.md5 && currentVideo.currentTime > 0) {
                const ct = currentVideo.currentTime
                const dur = currentVideo.duration
                if (!dur || ct < dur - 1) {
                    videosApi.saveResumeTime(video.md5, ct).catch(() => {})
                }
            }

            setVideo(target)
            setCurrentIndex(idx)
            setEditTitle(target.title)
            setEditing(false)
            videosApi.addView(targetMd5).catch(() => {})
        },
        [video],
    )

    // 页面关闭/刷新前保存播放进度（使用 Blob 设置正确 Content-Type）
    useEffect(() => {
        const onBeforeUnload = () => {
            const el = videoRef.current
            if (el && video?.md5 && el.currentTime > 0) {
                navigator.sendBeacon(
                    `${window.location.origin}/api/videos/${video.md5}/resume-time`,
                    new Blob([JSON.stringify({ time: el.currentTime })], {
                        type: 'application/json',
                    }),
                )
            }
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [video?.md5])

    // 收藏切换
    const toggleFavorite = useCallback(async () => {
        if (!video?.md5) return
        try {
            const updated = await videosApi.toggleFavorite(video.md5)
            setVideo(updated)
            // 同步更新缓存
            const idx = videoListRef.current.findIndex(
                (v) => v.md5 === updated.md5,
            )
            if (idx >= 0) videoListRef.current[idx] = updated
            showSnackbar(
                updated.favorite ? '已收藏' : '已取消收藏',
                updated.favorite ? 'success' : 'info',
            )
        } catch {
            showSnackbar('操作失败', 'error')
        }
    }, [video?.md5, showSnackbar])

    const playNext = useCallback(() => {
        const queue = queueRef.current
        if (queue.length === 0) return
        playAt((currentIndex + 1) % queue.length)
    }, [currentIndex, playAt])

    const playPrev = useCallback(() => {
        const queue = queueRef.current
        if (queue.length === 0) return
        playAt((currentIndex - 1 + queue.length) % queue.length)
    }, [currentIndex, playAt])

    // 鼠标滚轮切换视频（节流 800ms）
    const scrollThrottleRef = useRef(0)
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            const now = Date.now()
            if (now - scrollThrottleRef.current < 800) return
            scrollThrottleRef.current = now
            if (e.deltaY > 0) playNext()
            else playPrev()
        },
        [playNext, playPrev],
    )

    // 键盘控制（document 级别，排除输入框编辑状态）
    const videoRef = useRef<HTMLVideoElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
    keyHandlerRef.current = (e) => {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        const el = videoRef.current
        if (!el) return
        if (e.key === 'ArrowRight') {
            e.preventDefault()
            el.currentTime = Math.min(el.currentTime + 5, el.duration)
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            el.currentTime = Math.max(el.currentTime - 5, 0)
        } else if (e.key === ' ') {
            e.preventDefault()
            if (el.paused) el.play()
            else el.pause()
        }
    }
    useEffect(() => {
        const handler = (e: KeyboardEvent) => keyHandlerRef.current(e)
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [])

    // 有续播记录时，3 秒后隐藏「从头播放」按钮
    useEffect(() => {
        if (!video?.resumeTime || video.resumeTime <= 0) return
        setShowResetBtn(true)
        const timer = setTimeout(() => setShowResetBtn(false), 3000)
        return () => clearTimeout(timer)
    }, [video?.md5, video?.resumeTime])

    const handleResetPlay = useCallback(() => {
        const el = videoRef.current
        if (!el) return
        el.currentTime = 0
        setShowResetBtn(false)
        if (video?.md5) videosApi.saveResumeTime(video.md5, 0).catch(() => {})
    }, [video?.md5])

    // 60fps 顺滑更新进度条（直接操作 DOM，不触发 React 重渲染）
    useEffect(() => {
        let rafId: number
        const tick = () => {
            const v = videoRef.current
            const bar = progressRef.current
            if (v && bar && !bar.dataset.dragging) {
                const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0
                bar.style.width = `${pct}%`
            }
            rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafId)
    }, [])

    // 播放进度同步
    const handleTimeUpdate = useCallback(() => {
        const v = videoRef.current
        if (v) setCurrentTime(v.currentTime)
    }, [])
    const resumeRef = useRef<string | null>(null)
    const handleLoadedMetadata = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        setDuration(v.duration)
        // 元数据加载完成后从上次位置续播
        if (
            video?.resumeTime &&
            video.resumeTime > 0 &&
            resumeRef.current !== video.md5
        ) {
            v.currentTime = video.resumeTime
            resumeRef.current = video.md5
        }
    }, [video?.resumeTime, video?.md5])

    // 播放/暂停
    const togglePlay = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) {
            v.play()
            setPlaying(true)
        } else {
            v.pause()
            setPlaying(false)
        }
    }, [])

    // 音量
    const handleVolumeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = Number(e.target.value)
            setVolume(v)
            setMuted(v === 0)
            const el = videoRef.current
            if (el) el.volume = v
        },
        [],
    )
    const toggleMute = useCallback(() => {
        const el = videoRef.current
        if (!el) return
        if (el.muted) {
            el.muted = false
            setMuted(false)
        } else {
            el.muted = true
            setMuted(true)
        }
    }, [])

    // 全屏
    const toggleFullscreen = useCallback(() => {
        const el = videoRef.current?.parentElement
        if (!el) return
        if (document.fullscreenElement) document.exitFullscreen()
        else el.requestFullscreen()
    }, [])

    // 格式化时间 mm:ss
    function fmt(s: number): string {
        if (!isFinite(s) || s < 0) return '00:00'
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }

    // 首次加载：获取全量列表，构建播放队列
    useEffect(() => {
        if (loadedRef.current) return

        setLoading(true)
        videosApi
            .list(100)
            .then((list) => {
                if (list.length === 0) {
                    setError('暂无视频')
                    setLoading(false)
                    return
                }

                const queue = buildQueue(list)
                videoListRef.current = list
                queueRef.current = queue.map((v) => v.md5)
                loadedRef.current = true
                setTotalVideos(queue.length)

                // 定位当前视频
                const idx = queue.findIndex((v) => v.md5 === md5)
                const videoIdx = idx >= 0 ? idx : 0
                setCurrentIndex(videoIdx)
                const currentVideo = queue[videoIdx]
                setVideo(currentVideo)
                setEditTitle(currentVideo.title)
                setLoading(false)

                // 自动增加播放次数
                videosApi.addView(currentVideo.md5).catch(() => {})
            })
            .catch((err) => {
                setError((err as Error).message)
                setLoading(false)
            })
    }, [md5, buildQueue])

    // 处理外部 URL 跳转（列表页点击另一视频直接进入）
    useEffect(() => {
        if (!loadedRef.current || !md5) return
        const queue = queueRef.current
        const idx = queue.indexOf(md5)
        if (idx >= 0 && idx !== currentIndex) {
            const v = videoListRef.current.find((x) => x.md5 === md5)
            if (v) {
                setVideo(v)
                setCurrentIndex(idx)
                setEditTitle(v.title)
                setEditing(false)
            }
        }
    }, [md5, currentIndex])

    // 重新加载播放队列
    const reloadQueue = useCallback(() => {
        loadedRef.current = false
        videosApi
            .list(100)
            .then((list) => {
                if (list.length === 0) {
                    setError('暂无视频')
                    return
                }
                const queue = buildQueue(list)
                videoListRef.current = list
                queueRef.current = queue.map((v) => v.md5)
                loadedRef.current = true
                setTotalVideos(queue.length)
                // 播放下一个有效视频（队列第一个）
                playAt(0)
            })
            .catch(() => {})
    }, [buildQueue, playAt])

    const handleScan = async () => {
        setScanning(true)
        setScanResult(null)
        setScanProgress(0)
        try {
            const result = await videosApi.scanWithProgress(
                (current, total) => {
                    setScanProgress(Math.round((current / total) * 100))
                },
            )
            setScanResult(result)
            // 扫描成功后刷新队列并播放
            reloadQueue()
        } catch (err) {
            setScanResult({
                total: 0,
                new: 0,
                skipped: 0,
                deleted: 0,
                errors: [(err as Error).message],
            })
        } finally {
            setScanning(false)
        }
    }

    const handleSaveTitle = useCallback(async () => {
        const currentMd5 = video?.md5
        if (!currentMd5 || !editTitle.trim()) return
        setSaving(true)
        try {
            const updated = await videosApi.updateTitle(
                currentMd5,
                editTitle.trim(),
            )
            // 同时更新缓存中的标题
            const idx = videoListRef.current.findIndex(
                (v) => v.md5 === updated.md5,
            )
            if (idx >= 0) videoListRef.current[idx] = updated
            setVideo(updated)
            setEditing(false)
        } catch (err) {
            // Keep editing open on error
        } finally {
            setSaving(false)
        }
    }, [video?.md5, editTitle])

    const handleCancelEdit = useCallback(() => {
        setEditing(false)
        if (video) setEditTitle(video.title)
    }, [video])

    if (loading) {
        return <Loading />
    }

    const scanResultComponent = scanResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2 text-sm text-green-800 relative">
            <CheckCircle className="size-5 shrink-0 mt-0.5" />
            <button
                onClick={() => setScanResult(null)}
                className="absolute top-2 right-2 text-green-600 hover:text-green-800 transition-colors">
                <X className="size-4" />
            </button>
            <div className="flex-1">
                <p>扫描完成：共发现 {scanResult.total} 个视频文件</p>
                <p>
                    新增 {scanResult.new} 个，跳过 {scanResult.skipped}{' '}
                    个（已存在）
                </p>
                {scanResult.deleted > 0 && (
                    <p className="text-red-600">
                        清理失效记录 {scanResult.deleted} 个（文件已删除）
                    </p>
                )}
                {scanResult.errors.length > 0 && (
                    <div className="mt-1 text-red-600">
                        <p>错误 {scanResult.errors.length} 个：</p>
                        {scanResult.errors.map((err, i) => (
                            <p key={i} className="truncate">
                                {err}
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

    const scanButtonComponent = isAdmin() && (
        <button
            onClick={handleScan}
            disabled={scanning}
            className="btn btn-primary flex items-center gap-2">
            <RefreshCw className={`size-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? `正在扫描...${scanProgress}%` : '扫描目录'}
        </button>
    )

    const homeButtonComponent = (
        <button onClick={() => navigate('/tv')} className="btn btn-outline">
            <House className="size-4" />
        </button>
    )

    const favButtonComponent = (
        <button onClick={() => navigate('/tv/fav')} className="btn btn-outline">
            <Star className="size-4" />
        </button>
    )

    const editTitleComponent = (
        <div className="flex w-[50%] items-center gap-2">
            <input
                className="regular-text flex-1"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={saving}
            />
            <button
                onClick={handleSaveTitle}
                disabled={saving || !editTitle.trim()}
                className="btn btn-primary p-2">
                <Check className="size-4" />
            </button>
            <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="btn btn-outline p-2">
                <X className="size-4" />
            </button>
        </div>
    )

    const showTitleComponent = video && (
        <h2 className="text-xl font-semibold text-gray-900">
            {video.title.length > 55
                ? `${video.title.slice(0, 55)}...`
                : video.title}
            {isAdmin() && (
                <button
                    onClick={() => setEditing(true)}
                    className="text-muted hover:text-gray-600 transition-colors p-1">
                    <Edit3 className="size-4" />
                </button>
            )}
        </h2>
    )

    const showResetPlayButton = video?.resumeTime != null &&
        video.resumeTime > 0 && (
            <div
                className={`absolute bottom-4 left-4 z-10 transition-opacity duration-500 ${
                    showResetBtn
                        ? 'opacity-100'
                        : 'opacity-0 pointer-events-none'
                }`}>
                <div
                    className="cursor-pointer text-xs text-white hover:text-white/90  rounded px-4 py-2 transition-colors bg-white/10"
                    onClick={handleResetPlay}>
                    从头播放
                </div>
            </div>
        )

    const showTogglePlayButton = (
        <div
            className={`absolute inset-0 p-6 flex transition-opacity duration-200 ${
                playing ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}>
            <div className="flex items-end justify-between w-full">
                <div
                    className="cursor-pointer text-white/70 hover:text-white/90 ml-auto"
                    onClick={togglePlay}>
                    <CirclePlay className="size-16" />
                </div>
            </div>
        </div>
    )

    const customControlsComponent = (
        <div className="w-[70vw] bg-black/80 text-white rounded-lg px-4 py-2 flex items-center gap-3 select-none">
            <button
                onClick={togglePlay}
                className="hover:text-primary transition-colors shrink-0">
                {playing ? (
                    <Pause className="size-5" />
                ) : (
                    <Play className="size-5" />
                )}
            </button>
            <span className="text-xs tabular-nums shrink-0">
                {fmt(currentTime)}
            </span>
            <div
                className="flex-1 h-5 flex items-center cursor-pointer group"
                onClick={(e) => {
                    const v = videoRef.current
                    if (!v || !v.duration) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const ratio = (e.clientX - rect.left) / rect.width
                    v.currentTime = ratio * v.duration
                }}>
                <div className="w-full h-1 bg-white/20 rounded-full relative overflow-hidden">
                    <div
                        ref={progressRef}
                        className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-75"
                        style={{ width: '0%' }}
                    />
                </div>
            </div>
            <span className="text-xs tabular-nums shrink-0">
                {fmt(duration)}
            </span>
            <button
                onClick={toggleMute}
                className="hover:text-primary transition-colors shrink-0">
                {muted || volume === 0 ? (
                    <VolumeX className="size-4" />
                ) : (
                    <Volume2 className="size-4" />
                )}
            </button>
            <input
                type="range"
                className="w-16 h-1 accent-primary cursor-pointer"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolumeChange}
            />
            <button
                onClick={toggleFullscreen}
                className="hover:text-primary transition-colors shrink-0">
                <Maximize className="size-4" />
            </button>
        </div>
    )

    const NavigationComponent = (
        <div className="flex flex-col space-y-4 items-center">
            <button
                onClick={playPrev}
                disabled={totalVideos <= 1}
                className="btn btn-outline rounded-full p-5">
                <ChevronUp className="size-4" />
            </button>
            <button
                onClick={toggleFavorite}
                className="btn btn-outline bg-white/50 rounded-full p-5">
                <Heart
                    className={`size-4 ${video?.favorite ? 'fill-red-500 text-red-500' : ''}`}
                />
            </button>
            <button
                onClick={playNext}
                disabled={totalVideos <= 1}
                className="btn btn-outline rounded-full p-5">
                <ChevronDown className="size-4" />
            </button>
        </div>
    )

    const showVideoPlayer = video && (
        <video
            ref={videoRef}
            tabIndex={0}
            key={video.md5}
            src={`/api/videos/stream/${video.md5}`}
            autoPlay
            className="w-full h-full"
            playsInline
            onEnded={playNext}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onVolumeChange={() => {
                const v = videoRef.current
                if (v) {
                    setVolume(v.volume)
                    setMuted(v.muted)
                }
            }}
        />
    )

    if (error || !video) {
        return (
            <div className="flex justify-center flex-col items-center mt-24 space-y-6">
                <ShieldAlert className="size-20" />
                <h1>视频加载失败</h1>
                <p>{error || '未知错误'}</p>
                <div className="flex gap-4">
                    {homeButtonComponent}
                    {scanButtonComponent}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between space-x-4">
                {editing ? editTitleComponent : showTitleComponent}
                <div className="flex items-center gap-4">
                    {md5 && homeButtonComponent}
                    {favButtonComponent}
                    {scanButtonComponent}
                </div>
            </div>

            {scanResultComponent}

            <div className="flex items-center justify-center space-x-10">
                <div className="flex flex-col items-center gap-2">
                    <div
                        className="rounded-xl w-[70vw] overflow-hidden aspect-video bg-black relative"
                        onWheel={handleWheel}>
                        {/* 视频播放器 */}
                        {showVideoPlayer}

                        {/* 从头播放按钮（渐变消失） */}
                        {showResetPlayButton}

                        {/* 覆盖层：暂停时显示播放按钮 */}
                        {showTogglePlayButton}
                    </div>

                    {/* 自定义控件栏 */}
                    {customControlsComponent}
                </div>

                {/* 导航按钮控件 */}
                {NavigationComponent}
            </div>
        </div>
    )
}
