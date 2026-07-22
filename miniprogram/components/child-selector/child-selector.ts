interface ChildData {
    childId: number
    nickname: string
    grade: string
    sortOrder: number
}

Component({
    properties: {
        children: {
            type: Array<ChildData>,
            value: [],
        },
        value: {
            type: Number,
            value: null,
        },
    },
    methods: {
        onSelect(e: WechatMiniprogram.TouchEvent) {
            const id = Number(e.currentTarget.dataset.id)
            this.triggerEvent('change', { childId: id })
        },
    },
})
