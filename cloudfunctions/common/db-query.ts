import { verifyToken, type JwtClaims, type Role } from './auth'
import { queryOne } from './db'
import { HttpError } from './errors'

/** 云函数事件通用字段 */
export interface BaseEvent {
    token?: string
    childId?: number
}

export interface AuthContext {
    auth: JwtClaims
    /** 实际查看/操作的孩子用户ID；孩子自身即自己，家长未指定时为空（代表全部孩子） */
    targetUserId: number | null
    /** 注入 SQL 的数据隔离条件（已确保为整数或来自已校验的子查询，安全） */
    userFilter: string
}

/** 角色前置校验，不满足抛 403 */
export function assertRole(auth: JwtClaims, role: Role): void {
    if (auth.role !== role) {
        throw new HttpError(403, `权限不足，需要「${role === 'parent' ? '家长' : '孩子'}」角色`)
    }
}

/**
 * 解析调用方身份并产出数据隔离条件。
 * - 孩子：只能看到自己的数据（user_id = 自己）。
 * - 家长指定 childId：校验该孩子确属自己后，仅看该孩子。
 * - 家长未指定 childId：看名下所有孩子（IN 子查询）。
 * 所有 userFilter 中的数值均来自已校验的 JWT 或数据库校验结果，杜绝注入。
 */
export async function getAuthContext(event: BaseEvent): Promise<AuthContext> {
    if (!event.token) {
        throw new HttpError(401, '未登录或登录已过期')
    }
    const auth = verifyToken(event.token)

    if (auth.role === 'child') {
        return {
            auth,
            targetUserId: auth.userId,
            userFilter: `user_id = ${auth.userId}`,
        }
    }

    if (event.childId != null) {
        const childId = Number(event.childId)
        if (!Number.isInteger(childId)) {
            throw new HttpError(400, 'childId 非法')
        }
        const binding = await queryOne<{ child_id: number }>(
            'SELECT child_id FROM family_bindings WHERE parent_id = ? AND child_id = ? AND is_active = 1',
            [auth.userId, childId],
        )
        if (!binding) {
            throw new HttpError(403, '该孩子不属于当前家长')
        }
        return {
            auth,
            targetUserId: childId,
            userFilter: `user_id = ${childId}`,
        }
    }

    return {
        auth,
        targetUserId: null,
        userFilter: `user_id IN (SELECT child_id FROM family_bindings WHERE parent_id = ${auth.userId})`,
    }
}

/** 写操作必须落在一个具体孩子上：孩子即自己，家长须先指定 childId，否则抛 400 */
export function requireTargetUser(ctx: AuthContext): number {
    if (ctx.targetUserId == null) {
        throw new HttpError(400, '请先选择孩子')
    }
    return ctx.targetUserId
}
