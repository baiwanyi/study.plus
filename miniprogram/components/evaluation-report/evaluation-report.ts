interface EvalSection {
    label: string
    value: string
}

Component({
    properties: {
        evaluation: { type: Object, value: null },
        score: { type: Number, value: -1 },
    },
    data: {
        scoreText: '',
        sections: [] as EvalSection[],
    },
    observers: {
        evaluation(obj: Record<string, unknown> | null) {
            if (!obj) {
                this.setData({ scoreText: '', sections: [] })
                return
            }
            const rawScore = obj.score ?? obj.掌握程度评分 ?? obj.评分
            const scoreText = typeof rawScore === 'number' ? String(rawScore) : ''
            const hidden = new Set(['score', '评分', '掌握程度评分'])
            const sections: EvalSection[] = []
            for (const [key, val] of Object.entries(obj)) {
                if (hidden.has(key)) continue
                if (val == null) continue
                const text = typeof val === 'string' ? val : JSON.stringify(val)
                if (!text.trim()) continue
                sections.push({ label: humanize(key), value: text })
            }
            this.setData({ scoreText, sections })
        },
    },
})

function humanize(key: string): string {
    const map: Record<string, string> = {
        summary: '总体点评',
        missingPoints: '遗漏点',
        corrections: '纠错建议',
        suggestions: '提升建议',
        strengths: '亮点',
        weakness: '不足',
        comment: '评语',
    }
    return map[key] || key
}
