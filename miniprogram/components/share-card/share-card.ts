interface ShareStats {
    month: string
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
    exchangeInfo: { totalDuration: number; longestDay: string; longestDayDuration: number }
    submissionEarnTotal: number
    examEarnTotal: number
}

Component({
    properties: {
        stats: { type: Object, value: null },
        childName: { type: String, value: '宝贝' },
    },
    methods: {
        draw() {
            const stats = this.data.stats as ShareStats | null
            if (!stats) return
            const query = wx.createSelectorQuery().in(this)
            query
                .select('#shareCanvas')
                .fields({ node: true, size: true })
                .exec((res) => {
                    if (!res || !res[0]) return
                    const canvas = res[0].node as WechatMiniprogram.Canvas
                    const ctx = canvas.getContext('2d')
                    const dpr = (wx.getWindowInfo?.()?.pixelRatio) || 2
                    const width = res[0].width
                    const height = res[0].height
                    canvas.width = width * dpr
                    canvas.height = height * dpr
                    ctx.scale(dpr, dpr)
                    this.render(ctx, width, height, stats)
                })
        },
        render(
            ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
            width: number,
            _height: number,
            stats: ShareStats,
        ) {
            ctx.fillStyle = '#F7F8FA'
            ctx.fillRect(0, 0, width, _height)
            const pad = 40
            const cardW = width - pad * 2
            ctx.fillStyle = '#FFFFFF'
            this.roundRect(ctx, pad, pad, cardW, _height - pad * 2, 24)
            ctx.fill()

            ctx.fillStyle = '#07C160'
            ctx.font = '600 20px sans-serif'
            ctx.fillText(`${stats.month} 学习报告`, pad + 32, pad + 70)

            ctx.fillStyle = '#6B7280'
            ctx.font = '13px sans-serif'
            ctx.fillText(`${this.data.childName} 的成长足迹`, pad + 32, pad + 110)

            const cards = [
                { label: '本月赚取', value: `+${stats.totalEarn}`, color: '#07C160' },
                { label: '本月消耗', value: `-${stats.totalDeduct}`, color: '#FA5151' },
                { label: '可用余额', value: `${stats.availableBalance}`, color: '#3A7AFE' },
                { label: '兑换次数', value: `${stats.totalExchanges}`, color: '#FF8C00' },
            ]
            const gap = 20
            const itemW = (cardW - gap * 3 - 64) / 4
            cards.forEach((c, i) => {
                const x = pad + 32 + i * (itemW + gap)
                const y = pad + 150
                ctx.fillStyle = '#F7F8FA'
                this.roundRect(ctx, x, y, itemW, 120, 16)
                ctx.fill()
                ctx.fillStyle = c.color
                ctx.font = '600 17px sans-serif'
                ctx.fillText(c.value, x + 16, y + 60)
                ctx.fillStyle = '#6B7280'
                ctx.font = '11px sans-serif'
                ctx.fillText(c.label, x + 16, y + 96)
            })

            const dur = stats.exchangeInfo?.totalDuration ?? 0
            const lines = [
                `作业奖励积分：${stats.submissionEarnTotal}`,
                `测评奖励积分：${stats.examEarnTotal}`,
                `娱乐兑换累计时长：${dur.toFixed(1)} 分钟`,
            ]
            ctx.fillStyle = '#1A1A1A'
            ctx.font = '13px sans-serif'
            lines.forEach((line, i) => {
                ctx.fillText(line, pad + 32, pad + 330 + i * 44)
            })
        },
        roundRect(
            ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
            x: number,
            y: number,
            w: number,
            h: number,
            r: number,
        ) {
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.arcTo(x + w, y, x + w, y + h, r)
            ctx.arcTo(x + w, y + h, x, y + h, r)
            ctx.arcTo(x, y + h, x, y, r)
            ctx.arcTo(x, y, x + w, y, r)
            ctx.closePath()
        },
        save() {
            const query = wx.createSelectorQuery().in(this)
            query
                .select('#shareCanvas')
                .fields({ node: true })
                .exec((res) => {
                    if (!res || !res[0]) return
                    const canvas = res[0].node as WechatMiniprogram.Canvas
                    wx.canvasToTempFilePath({
                        canvas,
                        success: (r) => {
                            wx.saveImageToPhotosAlbum({
                                filePath: r.tempFilePath,
                                success: () =>
                                    wx.showToast({ title: '已保存到相册', icon: 'success' }),
                                fail: () =>
                                    wx.showToast({ title: '保存失败', icon: 'none' }),
                            })
                        },
                    })
                })
        },
    },
})
