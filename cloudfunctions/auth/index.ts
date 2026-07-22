import { signToken, type Role } from '../common/auth'
import { listChildren } from '../common/children'
import { PRIVACY_VERSION } from '../common/config'
import { query, execute, insertAndGetId } from '../common/db'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'

interface LoginEvent {
    userInfo?: { openId?: string }
    openid?: string
    privacyAgreed?: boolean
    nickname?: string
    avatar?: string
}

interface UserRow {
    id: number
    nickname: string
    avatar: string
    role: Role
    privacy_agreed: number
}

function extractOpenid(event: LoginEvent): string {
    const openid = event?.userInfo?.openId || event?.openid
    if (!openid) {
        throw new HttpError(401, '无法获取微信身份')
    }
    return openid
}

async function getOrCreateParent(
    openid: string,
    nickname: string,
    avatar: string,
    privacyAgreed: boolean,
): Promise<{ id: number; nickname: string; avatar: string; isNew: boolean }> {
    if (!privacyAgreed) {
        throw new HttpError(403, '请先同意隐私协议后再登录')
    }

    const rows = await query<UserRow>(
        'SELECT id, nickname, avatar, role, privacy_agreed FROM users WHERE openid = ?',
        [openid],
    )
    if (rows.length > 0) {
        const u = rows[0]
        if (!u.privacy_agreed) {
            await execute(
                `UPDATE users SET privacy_agreed = 1, privacy_version = ?,
         nickname = COALESCE(NULLIF(?, ''), nickname),
         avatar = COALESCE(NULLIF(?, ''), avatar) WHERE id = ?`,
                [PRIVACY_VERSION, nickname || null, avatar || null, u.id],
            )
        }
        return { id: u.id, nickname: u.nickname, avatar: u.avatar, isNew: false }
    }

    const parentId = await insertAndGetId(
        `INSERT INTO users (openid, nickname, avatar, role, privacy_agreed, privacy_version)
     VALUES (?, ?, ?, 'parent', 1, ?)`,
        [openid, nickname || '', avatar || '', PRIVACY_VERSION],
    )

    // 首次注册自动创建默认孩子并绑定（家庭底座）
    const childOpenid = `child_${parentId}_1`
    const childId = await insertAndGetId(
        `INSERT INTO users (openid, nickname, role, privacy_agreed, privacy_version)
     VALUES (?, '默认孩子', 'child', 1, ?)`,
        [childOpenid, PRIVACY_VERSION],
    )
    await insertAndGetId(
        `INSERT INTO family_bindings (parent_id, child_id, nickname, grade, sort_order)
     VALUES (?, ?, '默认孩子', '未定级', 0)`,
        [parentId, childId],
    )

    return { id: parentId, nickname: nickname || '', avatar: avatar || '', isNew: true }
}

export async function main(event: LoginEvent): Promise<unknown> {
    return run(async () => {
        const openid = extractOpenid(event)
        const { id, nickname, avatar } = await getOrCreateParent(
            openid,
            event.nickname || '',
            event.avatar || '',
            Boolean(event.privacyAgreed),
        )

        const token = signToken({ userId: id, openid, role: 'parent' })
        const children = await listChildren(id)

        return {
            token,
            privacyVersion: PRIVACY_VERSION,
            user: { id, nickname, avatar, role: 'parent' as Role },
            children,
        }
    })
}
