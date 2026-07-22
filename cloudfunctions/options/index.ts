import { assertRole, getAuthContext } from '../common/db-query'
import { run } from '../common/entry'
import { invalidateRulesCache, invalidateSettingsCache } from '../common/rules'
import { HttpError } from '../common/errors'
import { COLLECTION_OPTIONS, nosql } from '../common/nosql'

interface OptionsEvent {
    token?: string
    childId?: number
    action: 'get' | 'set' | 'list'
    key?: string
    value?: unknown
}

async function readOption(key: string): Promise<{ _id: string; value: unknown } | null> {
    const res = await nosql.collection(COLLECTION_OPTIONS).where({ key }).get()
    const docs = res.data as Array<{ _id: string; value: unknown }>
    return docs && docs.length > 0 ? docs[0] : null
}

export async function main(event: OptionsEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'list') {
            const res = await nosql.collection(COLLECTION_OPTIONS).limit(100).get()
            return res.data
        }

        if (action === 'get') {
            if (!event.key) throw new HttpError(400, '缺少 key')
            return readOption(event.key)
        }

        if (action === 'set') {
            assertRole(ctx.auth, 'parent')
            if (!event.key) throw new HttpError(400, '缺少 key')
            if (event.value === undefined) throw new HttpError(400, '缺少 value')
            const existing = await readOption(event.key)
            if (existing) {
                await nosql
                    .collection(COLLECTION_OPTIONS)
                    .doc(existing._id)
                    .update({ value: event.value })
                if (event.key === 'rules') {
                    invalidateRulesCache()
                }
                if (event.key === 'systemSettings') {
                    invalidateSettingsCache()
                }
                return { success: true, updated: true }
            }
            await nosql
                .collection(COLLECTION_OPTIONS)
                .add({ key: event.key, value: event.value })
            if (event.key === 'rules') {
                invalidateRulesCache()
            }
            if (event.key === 'systemSettings') {
                invalidateSettingsCache()
            }
            return { success: true, created: true }
        }

        throw new HttpError(400, '未知的 action')
    })
}
