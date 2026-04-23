import { useState, useEffect, useCallback, useRef } from 'react'
import Modal from '@apps/components/Modal'
import { ExternalLink } from 'lucide-react'

export default function Share() {
    const [showShare, setShowShare] = useState(false)
    const handleOpenShare = useCallback(() => setShowShare(true), [])
    const handleCloseShare = useCallback(() => setShowShare(false), [])

    return (
        <>
            <button onClick={handleOpenShare}>
                <ExternalLink className="w-5 h-5 flex-shrink-0 text-gray-600 hover:text-headline" />
            </button>
            <Modal
                open={showShare}
                onCancel={handleCloseShare}
                footer={false}
                title="分享">
                <div className="flex justify-center items-center space-y-4 flex-col">
                    <div
                        id="share"
                        className="aspect-[9/16] bg-slate-50 w-64"></div>
                    <button className="btn-outline">复制图片</button>
                </div>
            </Modal>
        </>
    )
}
