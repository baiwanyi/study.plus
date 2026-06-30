'use client'

import { LoaderCircle } from 'lucide-react'

export const Loading = () => {
    return (
        <div className="flex items-center justify-center h-64">
            <LoaderCircle className="w-8 h-8 text-gray-300 animate-spin" />
        </div>
    )
}
