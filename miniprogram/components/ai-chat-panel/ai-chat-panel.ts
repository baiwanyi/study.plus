import { callCloudFunction } from '../../utils/api'

interface ChatItem {
    role: 'user' | 'assistant'
    content: string
}

Component({
    properties: {
        cloudFunction: { type: String, value: '' },
        fetchAction: { type: String, value: '' },
        sendAction: { type: String, value: '' },
        refId: { type: Number, value: 0 },
        placeholder: { type: String, value: '问问 AI 老师…' },
        emptyHint: { type: String, value: '还没有对话，开始和 AI 老师聊聊吧' },
    },
    data: {
        messages: [] as ChatItem[],
        inputValue: '',
        loading: true,
        sending: false,
    },
    lifetimes: {
        attached() {
            this.loadHistory()
        },
    },
    methods: {
        async loadHistory() {
            if (!this.data.cloudFunction || !this.data.fetchAction) {
                this.setData({ loading: false })
                return
            }
            try {
                const res = await callCloudFunction<{ messages?: ChatItem[] }>(
                    this.data.cloudFunction,
                    { action: this.data.fetchAction, id: this.data.refId },
                )
                const list = res?.messages ?? []
                this.setData({ messages: list, loading: false })
            } catch (err) {
                const msg = err instanceof Error ? err.message : '加载失败'
                wx.showToast({ title: msg, icon: 'none' })
                this.setData({ loading: false })
            }
        },
        onInput(e: WechatMiniprogram.Input) {
            this.setData({ inputValue: e.detail.value })
        },
        async onSend() {
            const text = this.data.inputValue.trim()
            if (!text || this.data.sending) return
            this.setData({
                sending: true,
                inputValue: '',
                messages: [...this.data.messages, { role: 'user', content: text }],
            })
            try {
                await callCloudFunction(this.data.cloudFunction, {
                    action: this.data.sendAction,
                    id: this.data.refId,
                    message: text,
                })
                await this.loadHistory()
            } catch (err) {
                const msg = err instanceof Error ? err.message : '发送失败'
                wx.showToast({ title: msg, icon: 'none' })
            } finally {
                this.setData({ sending: false })
            }
        },
    },
})
