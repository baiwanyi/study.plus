import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { videosApi } from '@apps/lib/api'
import type { Video, ScanResult } from '@apps/lib/types'
import Loading from '@apps/components/Loading'
import { Film, Play, Eye, RefreshCw, CheckCircle } from 'lucide-react'

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('zh-CN')
    } catch {
        return dateStr
    }
}

export default function Video() {
    const navigate = useNavigate()
    const [videoList, setVideoList] = useState<Video[]>([])
    const [loading, setLoading] = useState(true)
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)

    const loadVideos = () => {
        setLoading(true)
        videosApi
            .list()
            .then((data) => {
                setVideoList(data)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }

    useEffect(() => {
        loadVideos()
    }, [])

    const handleScan = async () => {
        setScanning(true)
        setScanResult(null)
        try {
            const result = await videosApi.scan()
            setScanResult(result)
            loadVideos()
        } catch (err) {
            setScanResult({
                total: 0,
                new: 0,
                skipped: 0,
                errors: [(err as Error).message],
            })
        } finally {
            setScanning(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">本地视频</h2>
                <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="btn-primary flex items-center gap-2">
                    <RefreshCw
                        className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`}
                    />
                    {scanning ? '正在读取...' : '读取列表'}
                </button>
            </div>

            {/* Scan Result Toast */}
            {scanResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2 text-sm text-green-800">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p>扫描完成：共发现 {scanResult.total} 个视频文件</p>
                        <p>新增 {scanResult.new} 个，跳过 {scanResult.skipped} 个（已存在）</p>
                        {scanResult.errors.length > 0 && (
                            <div className="mt-1 text-red-600">
                                <p>错误 {scanResult.errors.length} 个：</p>
                                {scanResult.errors.map((err, i) => (
                                    <p key={i} className="truncate">{err}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Video Grid */}
            {loading ? (
                <Loading />
            ) : videoList.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">暂无视频</p>
                    <p className="text-sm mt-1">点击右上角"读取列表"扫描本地视频目录</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {videoList.map((video) => (
                        <div
                            key={video.md5}
                            onClick={() => navigate(`/video/${video.md5}`)}
                            className="card cursor-pointer hover:shadow-lg transition-shadow duration-200 overflow-hidden group">
                            {/* Thumbnail Placeholder */}
                            <div className="relative aspect-video bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <Play className="w-12 h-12 text-white/80 group-hover:scale-110 transition-transform" />
                            </div>
                            {/* Info */}
                            <div className="p-3 space-y-1.5">
                                <h3 className="font-medium text-gray-900 truncate">
                                    {video.title}
                                </h3>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <Eye className="w-3.5 h-3.5" />
                                        {video.views} 次播放
                                    </span>
                                    <span>{formatDate(video.createdAt)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
