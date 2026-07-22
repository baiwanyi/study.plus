import { listChildren, assertOwnedChild, type ChildItem } from '../common/children'
import { PRIVACY_VERSION } from '../common/config'
import { query, execute, insertAndGetId } from '../common/db'
import { getAuthContext, assertRole } from '../common/db-query'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'

interface FamilyEvent {
    token?: string
    action: 'add' | 'list' | 'update' | 'remove'
    childId?: number
    nickname?: string
    grade?: string
}

export async function main(event: FamilyEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        assertRole(ctx.auth, 'parent')
        const parentId = ctx.auth.userId

        if (event.action === 'list') {
            return { children: await listChildren(parentId) }
        }

        if (event.action === 'add') {
            const nickname = (event.nickname || '').trim() || '新孩子'
            const grade = event.grade || '未定级'
            const count = await query<{ c: number }>(
                'SELECT COUNT(*) AS c FROM family_bindings WHERE parent_id = ? AND is_active = 1',
                [parentId],
            )
            const sort = (count[0]?.c ?? 0) + 1
            const childOpenid = `child_${parentId}_${Date.now()}`
            const childId = await insertAndGetId(
                `INSERT INTO users (openid, nickname, role, privacy_agreed, privacy_version)
       VALUES (?, ?, 'child', 1, ?)`,
                [childOpenid, nickname, PRIVACY_VERSION],
            )
            await insertAndGetId(
                `INSERT INTO family_bindings (parent_id, child_id, nickname, grade, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
                [parentId, childId, nickname, grade, sort],
            )
            return {
                child: { childId, nickname, grade, sortOrder: sort } as ChildItem,
            }
        }

        if (event.action === 'update') {
            if (!event.childId) throw new HttpError(400, 'childId 必填')
            await assertOwnedChild(parentId, event.childId)
            const sets: string[] = []
            const params: unknown[] = []
            if (event.nickname) {
                sets.push('nickname = ?')
                params.push(event.nickname)
            }
            if (event.grade) {
                sets.push('grade = ?')
                params.push(event.grade)
            }
            if (sets.length > 0) {
                params.push(parentId, event.childId)
                await execute(
                    `UPDATE family_bindings SET ${sets.join(', ')} WHERE parent_id = ? AND child_id = ? AND is_active = 1`,
                    params,
                )
            }
            return { success: true }
        }

        if (event.action === 'remove') {
            if (!event.childId) throw new HttpError(400, 'childId 必填')
            await assertOwnedChild(parentId, event.childId)
            await execute(
                'UPDATE family_bindings SET is_active = 0 WHERE parent_id = ? AND child_id = ?',
                [parentId, event.childId],
            )
            await execute('UPDATE users SET is_active = 0 WHERE id = ?', [event.childId])
            return { success: true }
        }

        throw new HttpError(400, '未知 action')
    })
}
