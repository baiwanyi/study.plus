import { COLLECTION_OPTIONS, nosql } from './nosql'

const CATEGORIES_KEY = 'categories'

export interface Category {
    id: string
    name: string
    icon: string
    sample: string
}

export async function readCategories(): Promise<Category[]> {
    try {
        const res = await nosql
            .collection(COLLECTION_OPTIONS)
            .where({ key: CATEGORIES_KEY })
            .get()
        const docs = res.data as Array<{ value: Category[] }>
        if (docs && docs.length > 0 && Array.isArray(docs[0].value)) {
            return docs[0].value
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[Read Categories Failed]', msg)
    }
    return []
}

export async function saveCategories(list: Category[]): Promise<void> {
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
