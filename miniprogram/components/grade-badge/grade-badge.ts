import { gradeColors } from '../../utils/constants'

Component({
    properties: {
        grade: { type: String, value: '' },
        size: { type: String, value: 'normal' },
    },
    data: {
        color: '#6B7280',
    },
    observers: {
        grade(g: string) {
            this.setData({ color: (gradeColors as Record<string, string>)[g] || '#6B7280' })
        },
    },
})
