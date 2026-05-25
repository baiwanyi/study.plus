import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { videosApi } from '@apps/lib/api'
import type { Video } from '@apps/lib/types'
import { DataTable, type Column } from '@apps/components/DataTable'
import { formatDate } from '@apps/lib/utils'
import Loading from '@apps/components/Loading'
import { ChevronLeft } from 'lucide-react'

export default function TVFav() {
    const navigate = useNavigate()
    const [list, setList] = useState<Video[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        videosApi
            .listFavorites()
            .then((data) => {
                setList(data)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    if (loading) {
        return <Loading />
    }

    const columns: Column<Video>[] = [
        {
            key: 'title',
            header: '视频标题',
            render: (record) => (
                <span
                    className="cursor-pointer text-primary hover:underline"
                    onClick={() => navigate(`/tv/${record.md5}`)}>
                    {record.title}
                </span>
            ),
        },
        {
            key: 'views',
            header: '播放数',
            render: (record) => String(record.views),
        },
        {
            key: 'resumeTime',
            header: '上次播放',
            render: (record) => {
                const t = record.resumeTime
                if (!t || t <= 0) return '-'
                const m = Math.floor(t / 60)
                const s = Math.floor(t % 60)
                return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            },
        },
        {
            key: 'createdAt',
            header: '添加时间',
            render: (record) => formatDate(record.createdAt),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => (window.location.href = '/tv')}
                    className="btn-outline">
                    <ChevronLeft className="size-4" />
                </button>
                <h2 className="text-2xl font-bold text-gray-900">{`共 ${list.length} 个收藏视频`}</h2>
            </div>
            <div className="card p-0!">
                <DataTable
                    data={list}
                    columns={columns}
                    emptyText="暂无收藏视频"
                />
            </div>
        </div>
    )
}
