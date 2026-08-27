'use client'

import { LoaderCircle } from 'lucide-react'

export const Loading = () => {
    return (
        <div className="flex items-center justify-center h-64">
            <LoaderCircle className="size-8 text-primary animate-spin" />
        </div>
    )
}
