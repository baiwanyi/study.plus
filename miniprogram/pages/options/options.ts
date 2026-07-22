import { callCloudFunction } from '../../utils/api'
import { getCurrentRole } from '../../utils/auth'

interface OptionItem {
    _id: string
    key: string
    value: unknown
    valueText: string
}

interface IOptionData {
    list: OptionItem[]
    loading: boolean
    isParent: boolean
    showForm: boolean
    editingId: string | null
    form: { key: string; valueText: string }
}

function toText(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

function parseValue(text: string): unknown {
    const t = text.trim()
    if (t === '') return ''
    if (t === 'true') return true
    if (t === 'false') return false
    if (!Number.isNaN(Number(t))) return Number(t)
    try {
        return JSON.parse(t)
    } catch {
        return t
    }
}

Page<IOptionData>({
    data: {
        list: [],
        loading: true,
        isParent: false,
        showForm: false,
        editingId: null,
        form: { key: '', valueText: '' },
    },
    onShow() {
        this.setData({ isParent: getCurrentRole() === 'parent' })
        this.loadList()
    },
    async loadList() {
        this.setData({ loading: true })
        try {
            const list = await callCloudFunction<OptionItem[]>('options', { action: 'list' })
            this.setData({
                list: (list || []).map((o) => ({ ...o, valueText: toText(o.value) })),
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
    openAdd() {
        this.setData({ showForm: true, editingId: null, form: { key: '', valueText: '' } })
    },
    openEdit(e: WechatMiniprogram.TouchEvent) {
        const id = e.currentTarget.dataset.id as string
        const item = this.data.list.find((o) => o._id === id)
        if (!item) return
        this.setData({
            showForm: true,
            editingId: id,
            form: { key: item.key, valueText: item.valueText },
        })
    },
    onCancel() {
        this.setData({ showForm: false })
    },
    onKeyChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ 'form.key': e.detail.value })
    },
    onValueChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ 'form.valueText': e.detail.value })
    },
    async onConfirm() {
        const { editingId, form } = this.data
        if (!form.key.trim()) {
            wx.showToast({ title: 'key 不能为空', icon: 'none' })
            return
        }
        try {
            const value = parseValue(form.valueText)
            if (editingId) {
                const item = this.data.list.find((o) => o._id === editingId)
                if (item) {
                    await callCloudFunction('options', { action: 'set', key: item.key, value })
                }
            } else {
                await callCloudFunction('options', {
                    action: 'set',
                    key: form.key.trim(),
                    value,
                })
            }
            this.setData({ showForm: false })
            wx.showToast({ title: '已保存', icon: 'success' })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '保存失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
})
