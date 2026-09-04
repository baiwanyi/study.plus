/**
 * 邮箱保留策略测试：以轻量替身驱动 ImapFlow 最小契约，覆盖份数计算、
 * 主题二次校验、文件夹探测失败与双文件夹独立清理等分支。
 * 全部用例不触达真实网络，重点验证「宁可少删、绝不误删」的防护是否生效。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RetentionConfig } from '../src/services/backup-retention'
import {
    pruneBackupMails,
    readRetentionConfig,
    selectStaleUids,
} from '../src/services/backup-retention'
import { BACKUP_SUBJECT_PREFIX } from '../src/services/mailer'
import type { MailConfig } from '../src/services/mailer'
import type { ListResponse, SearchObject } from 'imapflow'

interface MockOptions {
    mailboxes?: ListResponse[]
    uids?: number[]
    subjects?: Record<number, string>
    failingFolders?: string[]
}

function mailbox(path: string, specialUse?: string): ListResponse {
    return {
        path,
        pathAsListed: path,
        name: path,
        delimiter: '/',
        parent: [],
        parentPath: '',
        flags: new Set<string>(),
        ...(specialUse ? { specialUse } : {}),
        listed: true,
        subscribed: true,
    }
}

/** 标准三文件夹布局：收件箱、已发送(\Sent)、已删除(\Trash)。 */
const STANDARD_MAILBOXES = [
    mailbox('INBOX'),
    mailbox('Sent Messages', '\\Sent'),
    mailbox('Trash', '\\Trash'),
]

function createMockClient(options: MockOptions) {
    const moves: Array<{ uids: number[]; destination: string }> = []
    const searchQueries: SearchObject[] = []
    let logoutCount = 0
    // logoutCount 以 getter 暴露：它是基本类型，若用 Object.assign 挂载会被求值成快照，
    // 而 Object.assign 复制的是 getter 的返回值而非 getter 本身。
    const client = {
        moves,
        searchQueries,
        get logoutCount(): number {
            return logoutCount
        },
        async connect(): Promise<void> {},
        async list(): Promise<ListResponse[]> {
            return options.mailboxes ?? STANDARD_MAILBOXES
        },
        async getMailboxLock(folder: string) {
            if (options.failingFolders?.includes(folder)) {
                throw new Error(`无法打开文件夹 ${folder}`)
            }
            return {
                path: folder,
                release: () => {},
            }
        },
        async search(query: SearchObject): Promise<number[] | false> {
            searchQueries.push(query)
            return options.uids ?? []
        },
        async fetchAll(range: number[]) {
            return range.map((uid) => ({
                uid,
                envelope: {
                    subject:
                        options.subjects?.[uid] ??
                        `${BACKUP_SUBJECT_PREFIX} study-backup-2026-09-04`,
                },
            }))
        },
        async messageMove(
            range: number[],
            destination: string,
        ): Promise<unknown> {
            moves.push({ uids: range, destination })
            return {}
        },
        async logout(): Promise<void> {
            logoutCount += 1
        },
    }
    return client
}

function makeRetentionConfig(
    overrides: Partial<RetentionConfig> = {},
): RetentionConfig {
    return {
        host: 'imap.test.com',
        port: 993,
        secure: true,
        user: 'user@test.com',
        pass: 'secret',
        mailbox: 'INBOX',
        retention: 20,
        maxDeletePerRun: 5,
        ...overrides,
    }
}

function makeMailConfig(): MailConfig {
    return {
        host: 'smtp.test.com',
        port: 465,
        secure: true,
        user: 'user@test.com',
        pass: 'secret',
        from: 'user@test.com',
        to: ['user@test.com'],
    }
}

function sequence(count: number): number[] {
    return Array.from({ length: count }, (_unused, index) => index + 1)
}

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('保留策略：份数计算', () => {
    it('用例 11 - 备份邮件 25 封时每个文件夹各删最旧 5 封', async () => {
        const client = createMockClient({ uids: sequence(25) })
        await pruneBackupMails(makeRetentionConfig(), () => client)
        expect(client.moves).toHaveLength(2)
        expect(client.moves[0]?.uids).toEqual([1, 2, 3, 4, 5])
        expect(client.moves[0]?.destination).toBe('Trash')
        expect(client.moves[1]?.uids).toEqual([1, 2, 3, 4, 5])
    })

    it('用例 12 - 恰好 20 封时不删除', async () => {
        const client = createMockClient({ uids: sequence(20) })
        await pruneBackupMails(makeRetentionConfig(), () => client)
        expect(client.moves).toHaveLength(0)
    })

    it('用例 13 - 不足 20 封时不删除', async () => {
        const client = createMockClient({ uids: sequence(18) })
        await pruneBackupMails(makeRetentionConfig(), () => client)
        expect(client.moves).toHaveLength(0)
    })

    it('用例 11b - selectStaleUids 受单次上限截断', () => {
        expect(selectStaleUids(sequence(30), 20, 3)).toEqual([1, 2, 3])
    })
})

describe('保留策略：防误删校验', () => {
    it('用例 14 - 主题前缀不匹配时跳过且记录告警', async () => {
        const subjects: Record<number, string> = {}
        for (const uid of sequence(25)) {
            subjects[uid] = '普通邮件主题'
        }
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const client = createMockClient({ uids: sequence(25), subjects })
        await pruneBackupMails(makeRetentionConfig(), () => client)
        expect(client.moves).toHaveLength(0)
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('用例 15 - 按自定义头精确搜索，非备份邮件不进入候选', async () => {
        const client = createMockClient({ uids: sequence(25) })
        await pruneBackupMails(makeRetentionConfig(), () => client)
        expect(client.searchQueries.length).toBeGreaterThan(0)
        expect(client.searchQueries[0]?.header).toEqual({
            'X-StudyPlus-Backup': '1',
        })
    })
})

describe('保留策略：降级与配置', () => {
    it('用例 16 - 探测不到已删除文件夹时放弃清理且不抛错', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const client = createMockClient({
            uids: sequence(25),
            mailboxes: [mailbox('INBOX'), mailbox('Sent Messages', '\\Sent')],
        })
        await expect(
            pruneBackupMails(makeRetentionConfig(), () => client),
        ).resolves.toBeUndefined()
        expect(client.moves).toHaveLength(0)
        expect(client.logoutCount).toBe(1)
        errorSpy.mockRestore()
    })

    it('用例 17 - BACKUP_RETENTION 为 0 时不启用保留策略', () => {
        vi.stubEnv('BACKUP_RETENTION', '0')
        expect(readRetentionConfig(makeMailConfig())).toBeNull()
    })

    it('用例 17b - 未配置 IMAP_HOST 时返回禁用态', () => {
        vi.stubEnv('BACKUP_RETENTION', '20')
        vi.stubEnv('IMAP_HOST', '')
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(readRetentionConfig(makeMailConfig())).toBeNull()
        errorSpy.mockRestore()
    })

    it('用例 18 - 收件箱清理失败时已发送仍正常清理', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const client = createMockClient({
            uids: sequence(25),
            failingFolders: ['INBOX'],
        })
        await pruneBackupMails(makeRetentionConfig(), () => client)
        expect(client.moves).toHaveLength(1)
        expect(client.moves[0]?.uids).toEqual([1, 2, 3, 4, 5])
        errorSpy.mockRestore()
    })
})
