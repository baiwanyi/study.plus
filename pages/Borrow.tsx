import { useState, useEffect } from 'react'
import { advancesApi } from '@apps/lib/api'
import type { PointAdvance } from '@apps/lib/types'
import { isAdmin } from '@apps/lib/utils'
import Loading from '@apps/components/Loading'
import BorrowListTable from '@layout/BorrowListTable'

const mockAdvances: PointAdvance[] = [
    {
        id: 1,
        amount: 100,
        totalRepayment: 116,
        installments: 6,
        installmentAmount: 20,
        paidInstallments: 2,
        status: 'active',
        createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
        id: 2,
        amount: 50,
        totalRepayment: 58,
        installments: 3,
        installmentAmount: 20,
        paidInstallments: 3,
        status: 'completed',
        createdAt: '2026-01-15T00:00:00.000Z',
    },
]

export default function Borrow() {
    const [advances, setAdvances] = useState<PointAdvance[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        advancesApi
            .list()
            .then((data) => {
                setAdvances(data)
                setLoading(false)
            })
            .catch(() => {
                // Fallback to mock data when API not available
                setAdvances(mockAdvances)
                setError(true)
                setLoading(false)
            })
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">积分预支</h2>
                {isAdmin() && (
                    <button
                        disabled={availableBalance < minPrivilege}
                        onClick={() => setShowCreate(true)}
                        className="btn-primary">
                        预支
                    </button>
                )}
            </div>
            {loading ? (
                <Loading />
            ) : (
                <BorrowListTable advances={advances} loading={false} />
            )}
        </div>
    )
}
