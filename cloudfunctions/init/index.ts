import { run } from '../common/entry'
import { COLLECTION_OPTIONS, nosql } from '../common/nosql'
import { getAuthContext, assertRole } from '../common/db-query'
import {
    defaultExamRules,
    defaultExchangeRules,
    defaultHomeworkRules,
    defaultSystemSettings,
} from '../common/constants'
import type { Category } from '../common/categories-store'

interface InitEvent {
    token?: string
    childId?: number
    action?: string
}

const DEFAULT_CATEGORIES: Category[] = [
    { id: 'cat_default_1', name: '书写工整', icon: 'discount', sample: '字迹清楚、卷面整洁' },
    { id: 'cat_default_2', name: '态度认真', icon: 'discount', sample: '专注投入、不敷衍' },
    { id: 'cat_default_3', name: '思考深入', icon: 'discount', sample: '能举一反三、提出问题' },
]

async function setIfAbsent(key: string, value: unknown): Promise<'created' | 'exists'> {
    const res = await nosql.collection(COLLECTION_OPTIONS).where({ key }).get()
    const docs = res.data as Array<{ _id: string }>
    if (docs && docs.length > 0) return 'exists'
    await nosql.collection(COLLECTION_OPTIONS).add({ key, value })
    return 'created'
}

export async function main(event: InitEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        assertRole(ctx.auth, 'parent')

        const results: Record<string, string> = {}
        results.rules = await setIfAbsent('rules', {
            homework: defaultHomeworkRules,
            exam: defaultExamRules,
            exchange: defaultExchangeRules,
            custom: [],
        })
        results.systemSettings = await setIfAbsent('systemSettings', defaultSystemSettings)
        results.categories = await setIfAbsent('categories', DEFAULT_CATEGORIES)

        return { success: true, results }
    })
}
