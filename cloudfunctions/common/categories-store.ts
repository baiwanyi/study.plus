import { COLLECTION_OPTIONS, nosql } from './nosql'

const CATEGORIES_KEY = 'categories'

export interface Category {
    id: string
    name: string
    icon: string
    sample: string
}

/** 分类读取带内存缓存，减少 NoSQL 频繁读取 */
let categoriesCache: { data: Category[]; expiresAt: number } | null = null
const CATEGORIES_CACHE_TTL_MS = 30_000

export async function readCategories(): Promise<Category[]> {
    if (categoriesCache && Date.now() < categoriesCache.expiresAt) {
        return categoriesCache.data
    }
    try {
        const res = await nosql
            .collection(COLLECTION_OPTIONS)
            .where({ key: CATEGORIES_KEY })
            .get()
        const docs = res.data as Array<{ value: Category[] }>
        if (docs && docs.length > 0 && Array.isArray(docs[0].value)) {
            categoriesCache = { data: docs[0].value, expiresAt: Date.now() + CATEGORIES_CACHE_TTL_MS }
            return docs[0].value
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[Read Categories Failed]', msg)
    }
    return []
}

/** 保存分类（写入时清除内存缓存，下次读取重新从 NoSQL 拉取） */
export async function saveCategories(list: Category[]): Promise<void> {
    categoriesCache = null
    const res = await nosql
        .collection(COLLECTION_OPTIONS)
        .where({ key: CATEGORIES_KEY })
        .get()
    const docs = res.data as Array<{ _id: string }>
    if (docs && docs.length > 0) {
        await nosql
            .collection(COLLECTION_OPTIONS)
            .doc(docs[0]._id)
            .update({ value: list })
    } else {
        await nosql
            .collection(COLLECTION_OPTIONS)
            .add({ key: CATEGORIES_KEY, value: list })
    }
}
