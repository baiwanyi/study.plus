import { run } from '../common/entry'
import { getAuthContext, assertRole } from '../common/db-query'
import { HttpError } from '../common/errors'
import { readCategories, saveCategories } from '../common/categories-store'

interface Category {
    id: string
    name: string
    icon: string
    sample: string
}

interface CategoriesEvent {
    token?: string
    childId?: number
    action: 'list' | 'add' | 'update' | 'remove'
    id?: string
    name?: string
    icon?: string
    sample?: string
}

function genId(): string {
    return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export async function main(event: CategoriesEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        const list = await readCategories()

        if (action === 'list') {
            return list
        }

        assertRole(ctx.auth, 'parent')

        if (action === 'add') {
            if (!event.name || !event.name.trim()) {
                throw new HttpError(400, '分类名称不能为空')
            }
            const item: Category = {
                id: genId(),
                name: event.name.trim(),
                icon: event.icon || 'discount',
                sample: event.sample || '',
            }
            list.push(item)
            await saveCategories(list)
            return item
        }

        if (action === 'update') {
            const item = list.find((c) => c.id === event.id)
            if (!item) throw new HttpError(404, '分类不存在')
            if (event.name != null) item.name = event.name.trim()
            if (event.icon != null) item.icon = event.icon
            if (event.sample != null) item.sample = event.sample
            await saveCategories(list)
            return item
        }

        if (action === 'remove') {
            const idx = list.findIndex((c) => c.id === event.id)
            if (idx === -1) throw new HttpError(404, '分类不存在')
            list.splice(idx, 1)
            await saveCategories(list)
            return { success: true }
        }

        throw new HttpError(400, '未知的 action')
    })
}
