import { WEBVIEW_BASE } from '../../utils/config'

Page({
    data: {
        src: '',
    },
    onLoad(query: Record<string, string>) {
        const title = query.title || '思维导图'
        const taskId = query.taskId || ''
        if (!WEBVIEW_BASE) {
            wx.showModal({
                title: '未配置资源地址',
                content: '请在 utils/config.ts 的 WEBVIEW_BASE 填入 mindmap.html 的 https 访问地址。',
                showCancel: false,
            })
            return
        }
        const url =
            `${WEBVIEW_BASE}/mindmap.html` +
            `?title=${encodeURIComponent(title)}` +
            `&taskId=${encodeURIComponent(taskId)}`
        this.setData({ src: url })
    },
    // 接收 web-view 通过 wx.miniProgram.postMessage 回传的思维导图数据
    onMessage(e: WechatMiniprogram.CustomEvent) {
        const data = e.detail?.data?.[e.detail.data.length - 1]
        if (data && data.action === 'save') {
            wx.showToast({ title: '已保存草稿', icon: 'success' })
        }
    },
})
