Component({
    properties: {
        isWide: {
            type: Boolean,
            value: false,
        },
        user: {
            type: Object,
            value: null,
        },
        children: {
            type: Array,
            value: [],
        },
        currentChildId: {
            type: Number,
            value: null,
        },
        currentPage: {
            type: String,
            value: '',
        },
    },
    methods: {
        onChildChange(e: WechatMiniprogram.CustomEvent) {
            this.triggerEvent('childchange', e.detail)
        },
        onLogout() {
            this.triggerEvent('logout')
        },
    },
})
