import { query } from './db'
import { HttpError } from './errors'

export interface ChildItem {
    childId: number
    nickname: string
    grade: string
    sortOrder: number
}

/** 列出某家长名下所有活跃孩子 */
export async function listChildren(parentId: number): Promise<ChildItem[]> {
    return query<ChildItem>(
        `SELECT child_id AS childId, nickname, grade, sort_order AS sortOrder
     FROM family_bindings WHERE parent_id = ? AND is_active = 1 ORDER BY sort_order`,
        [parentId],
    )
}

/** 校验孩子确实属于该家长，否则抛 403 */
export async function assertOwnedChild(
    parentId: number,
    childId: number,
): Promise<void> {
    const rows = await query<{ child_id: number }>(
        'SELECT child_id FROM family_bindings WHERE parent_id = ? AND child_id = ? AND is_active = 1',
        [parentId, childId],
    )
    if (rows.length === 0) {
        throw new HttpError(403, '该孩子不属于当前家长')
    }
}
