import { callCloudFunction } from '../../utils/api'
import { getToken, getCurrentChildId } from '../../utils/auth'
import { taskTypeLabels, taskStatusLabels, gradeColors } from '../../utils/constants'

interface TaskItem {
    id: number
    title: string
    type: string
    status: string
    pointsEarned: number | null
    grade: string | null
    submission: {
        id: number
        content: string
        grade: string | null
        aiScore: string | null
        scoredAt: string | null
    } | null
    aiComment: string | null
    submittedAt: string | null
    gradedAt: string | null
    aiSuggestions: string[]
    userId: number
}

interface ScoreResult {
    grade: string
    comment: string
    suggestions: string[]
}

interface DisplayTask extends TaskItem {
    typeLabel: string
    statusLabel: string
    gradeColor: string
}

function decorate(task: TaskItem): DisplayTask {
    return {
        ...task,
        typeLabel: taskTypeLabels[task.type] || task.type,
        statusLabel: taskStatusLabels[task.status] || task.status,
        gradeColor: task.grade ? gradeColors[task.grade] || '#6B7280' : '#6B7280',
    }
}

interface TasksData {
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
    user: { nickname: string } | null
    isWide: boolean
    isParent: boolean
    list: TaskItem[]
    loading: boolean
    showCreate: boolean
    newTitle: string
    newType: string
    typeOptions: Array<{ label: string; value: string }>
    showTypePicker: boolean
    showDetail: boolean
    detail: TaskItem | null
    scoring: boolean
    scoreResult: ScoreResult | null
    showFilter: boolean
    filterType: string
    filterStatus: string
    filterTypeLabel: string
    newTypeLabel: string
}

const TYPE_OPTIONS = [
    { label: '作文', value: 'composition' },
    { label: '思维导图', value: 'mindmap' },
    { label: '读书笔记', value: 'notes' },
]

Page<TasksData>({
    data: {
        children: [],
        currentChildId: null,
        list: [],
        loading: false,
        showCreate: false,
        newTitle: '',
        newType: 'composition',
        typeOptions: TYPE_OPTIONS,
        showTypePicker: false,
        showDetail: false,
        detail: null,
        scoring: false,
        scoreResult: null,
        user: null,
        isWide: false,
        isParent: false,
        showFilter: false,
        filterType: '',
        filterStatus: '',
        filterTypeLabel: '',
        newTypeLabel: '作文',
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<AppOption>()
        this.setData({
            user: app.globalData.user,
            children: app.globalData.children,
            currentChildId: getCurrentChildId(),
            isWide: app.globalData.platform.isWide,
            isParent: app.globalData.user?.role === 'parent',
        })
        this.loadTasks()
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        const app = getApp<AppOption>()
        app.globalData.currentChildId = id
        wx.setStorageSync('currentChildId', id)
        this.setData({ currentChildId: id })
        this.loadTasks()
    },
    async loadTasks() {
        this.setData({ loading: true })
        try {
            const { filterType, filterStatus } = this.data
            const list = await callCloudFunction<TaskItem[]>('tasks', {
                action: 'list',
                type: filterType || undefined,
                status: filterStatus || undefined,
            })
            this.setData({ list: (list || []).map(decorate) })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
    openCreate() {
        this.setData({ showCreate: true, newTitle: '', newType: 'composition', newTypeLabel: '作文' })
    },
    closeCreate() {
        this.setData({ showCreate: false })
    },
    onTitleInput(e: WechatMiniprogram.Input) {
        this.setData({ newTitle: e.detail.value })
    },
    openTypePicker() {
        this.setData({ showTypePicker: true })
    },
    closeTypePicker() {
        this.setData({ showTypePicker: false })
    },
    onPickType(e: WechatMiniprogram.CustomEvent) {
        const item = this.data.typeOptions[e.detail.index]
        if (item) this.setData({ newType: item.value, newTypeLabel: item.label })
        this.setData({ showTypePicker: false })
    },
    async onCreateConfirm() {
        const { newTitle, newType } = this.data
        if (!newTitle.trim()) {
            wx.showToast({ title: '请输入作业标题', icon: 'none' })
            return
        }
        try {
            await callCloudFunction('tasks', {
                action: 'create',
                title: newTitle.trim(),
                type: newType,
            })
            this.setData({ showCreate: false })
            wx.showToast({ title: '已创建', icon: 'success' })
            this.loadTasks()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '创建失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    openDetail(e: WechatMiniprogram.TouchEvent) {
        const id = Number(e.currentTarget.dataset.id)
        const task = this.data.list.find((t) => t.id === id) ?? null
        this.setData({ showDetail: true, detail: task ? decorate(task) : null, scoreResult: null })
    },
    closeDetail() {
        this.setData({ showDetail: false, detail: null })
    },
    async onAiTitle() {
        const task = this.data.detail
        if (!task) return
        try {
            const res = await callCloudFunction<{ title: string }>('tasks', {
                action: 'ai-title',
                id: task.id,
            })
            wx.showToast({ title: '已生成标题', icon: 'success' })
            this.loadTasks()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '生成失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    async onAiScore() {
        const task = this.data.detail
        if (!task) return
        this.setData({ scoring: true })
        try {
            const res = await callCloudFunction<{
                aiResult: ScoreResult
                pointsEarned: number
            }>('tasks', { action: 'ai-score', id: task.id })
            this.setData({ scoreResult: res.aiResult })
            this.loadTasks()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '评分失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ scoring: false })
        }
    },
    async onDelete() {
        const task = this.data.detail
        if (!task) return
        const confirm = await new Promise<boolean>((resolve) => {
            wx.showModal({
                title: '删除作业',
                content: '删除后不可恢复，确定删除？',
                success: (r) => resolve(r.confirm),
            })
        })
        if (!confirm) return
        try {
            await callCloudFunction('tasks', { action: 'delete', id: task.id })
            this.setData({ showDetail: false, detail: null })
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadTasks()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '删除失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    openFilter() {
        this.setData({ showFilter: true })
    },
    closeFilter() {
        this.setData({ showFilter: false })
    },
    setFilterType(e: WechatMiniprogram.CustomEvent) {
        const item = this.data.typeOptions[e.detail.index]
        this.setData({
            filterType: item ? item.value : '',
            filterTypeLabel: item ? item.label : '',
            showFilter: false,
        })
        this.loadTasks()
    },
    clearFilter() {
        this.setData({ filterType: '', filterTypeLabel: '', filterStatus: '', showFilter: false })
        this.loadTasks()
    },
    openMindmap() {
        const task = this.data.detail
        if (!task) return
        wx.navigateTo({
            url: `/pages/mindmap/mindmap?taskId=${task.id}&title=${encodeURIComponent(task.title)}`,
        })
    },
    onLogout() {
        wx.switchTab({ url: '/pages/my/my' })
    },
})
