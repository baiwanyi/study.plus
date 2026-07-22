import { callCloudFunction } from '../../utils/api'
import { getCurrentRole } from '../../utils/auth'

interface Category {
    id: string
    name: string
    icon: string
    sample: string
}

interface ICategoryData {
    list: Category[]
    loading: boolean
    isParent: boolean
    showForm: boolean
    editingId: string | null
    form: { name: string; icon: string; sample: string }
}

Page<ICategoryData>({
    data: {
        list: [],
        loading: true,
        isParent: false,
        showForm: false,
        editingId: null,
        form: { name: '', icon: 'discount', sample: '' },
    },
    onShow() {
        this.setData({ isParent: getCurrentRole() === 'parent' })
        this.loadList()
    },
    async loadList() {
        this.setData({ loading: true })
        try {
            const list = await callCloudFunction<Category[]>('categories', { action: 'list' })
            this.setData({ list: list || [] })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
    openAdd() {
        this.setData({
            showForm: true,
            editingId: null,
            form: { name: '', icon: 'discount', sample: '' },
        })
    },
    openEdit(e: WechatMiniprogram.TouchEvent) {
        const id = e.currentTarget.dataset.id as string
        const item = this.data.list.find((c) => c.id === id)
        if (!item) return
        this.setData({
            showForm: true,
            editingId: id,
            form: { name: item.name, icon: item.icon, sample: item.sample },
        })
    },
    onCancel() {
        this.setData({ showForm: false })
    },
    onNameChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ 'form.name': e.detail.value })
    },
    onIconChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ 'form.icon': e.detail.value })
    },
    onSampleChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ 'form.sample': e.detail.value })
    },
    async onConfirm() {
        const { editingId, form } = this.data
        if (!form.name.trim()) {
            wx.showToast({ title: '名称不能为空', icon: 'none' })
            return
        }
        try {
            if (editingId) {
                await callCloudFunction('categories', { action: 'update', id: editingId, ...form })
            } else {
                await callCloudFunction('categories', { action: 'add', ...form })
            }
            this.setData({ showForm: false })
            wx.showToast({ title: '已保存', icon: 'success' })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '保存失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    onDelete(e: WechatMiniprogram.TouchEvent) {
        const id = e.currentTarget.dataset.id as string
        wx.showModal({
            title: '删除分类',
            content: '确认删除该评语分类？',
            success: async (r) => {
                if (!r.confirm) return
                try {
                    await callCloudFunction('categories', { action: 'remove', id })
                    wx.showToast({ title: '已删除', icon: 'success' })
                    this.loadList()
                } catch (err) {
                    const msg = err instanceof Error ? err.message : '删除失败'
                    wx.showToast({ title: msg, icon: 'none' })
                }
            },
        })
    },
})
