/**
 * 备份邮件的邮箱保留策略：按自定义头精确命中，把超出份数的旧备份移入「已删除」。
 * 收件箱与「已发送」各自独立计数，因为自发自收会在两处各留一份副本；
 * 任一文件夹探测或清理失败不影响另一个，也不影响已完成的备份。
 * 删除前逐封按主题前缀二次校验，并限制单次移动封数，宁可少删也绝不误删；
 * 文件夹定位优先取显式配置，其次依赖 IMAP 的 special-use 标志，失败即放弃清理。
 */
import { ImapFlow } from 'imapflow'
import type {
    FetchMessageObject,
    FetchOptions,
    FetchQueryObject,
    ListOptions,
    ListResponse,
    MailboxLockObject,
    SearchObject,
} from 'imapflow'
import type { MailConfig } from './mailer'
import {
    BACKUP_HEADER,
    BACKUP_HEADER_VALUE,
    BACKUP_SUBJECT_PREFIX,
} from './mailer'

const CONNECTION_TIMEOUT_MS = 30_000
const GREETING_TIMEOUT_MS = 30_000
const SOCKET_TIMEOUT_MS = 120_000
const DEFAULT_PORT = 993
const DEFAULT_MAILBOX = 'INBOX'
const DEFAULT_MAX_DELETE = 5
const SPECIAL_USE_TRASH = '\\Trash'
const SPECIAL_USE_SENT = '\\Sent'

export interface RetentionConfig {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    mailbox: string
    sentFolder?: string
    trashFolder?: string
    retention: number
    maxDeletePerRun: number
}

/** ImapFlow 的最小子集，便于测试以轻量替身驱动清理流程。 */
export interface ImapClient {
    connect(): Promise<void>
    list(options?: ListOptions): Promise<ListResponse[]>
    getMailboxLock(path: string): Promise<MailboxLockObject>
    search(
        query: SearchObject,
        options?: { uid?: boolean },
    ): Promise<number[] | false>
    fetchAll(
        range: number[],
        query: FetchQueryObject,
        options?: FetchOptions,
    ): Promise<FetchMessageObject[]>
    messageMove(
        range: number[],
        destination: string,
        options?: { uid?: boolean },
    ): Promise<unknown>
    logout(): Promise<void>
}

export type ImapClientFactory = (config: RetentionConfig) => ImapClient

/**
 * 挑出应当被清理的 UID：按 UID 升序取最旧的若干封，并受单次上限截断。
 * UID 在同一文件夹内单调递增，等价于按时间排序且不受伪造 Date 头影响。
 */
export function selectStaleUids(
    uids: number[],
    retention: number,
    maxDeletePerRun: number,
): number[] {
    if (retention <= 0 || uids.length <= retention) {
        return []
    }
    const ascending = [...uids].sort((a, b) => a - b)
    const stale = ascending.slice(0, ascending.length - retention)
    return stale.slice(0, maxDeletePerRun)
}

/**
 * 解析保留策略配置。BACKUP_RETENTION 为 0 或未设置时返回 null（不清理）；
 * IMAP 账号与密码默认回退到 SMTP 凭据，适配自发自收的同一邮箱账号。
 */
export function readRetentionConfig(mail: MailConfig): RetentionConfig | null {
    const retention = Number(process.env.BACKUP_RETENTION)
    if (!Number.isFinite(retention) || retention <= 0) {
        return null
    }
    const host = process.env.IMAP_HOST
    if (!host) {
        console.error(
            '[Backup] 未配置 IMAP_HOST，邮箱保留策略已禁用（邮件将只增不减）',
        )
        return null
    }
    const port = Number(process.env.IMAP_PORT)
    const maxDelete = Number(process.env.BACKUP_RETENTION_MAX_DELETE)
    const sentFolder = process.env.IMAP_SENT_FOLDER
    const trashFolder = process.env.IMAP_TRASH_FOLDER
    return {
        host,
        port: port > 0 ? port : DEFAULT_PORT,
        secure: process.env.IMAP_SECURE !== 'false',
        user: process.env.IMAP_USER || mail.user,
        pass: process.env.IMAP_PASS || mail.pass,
        mailbox: process.env.IMAP_MAILBOX || DEFAULT_MAILBOX,
        ...(sentFolder ? { sentFolder } : {}),
        ...(trashFolder ? { trashFolder } : {}),
        retention: Math.floor(retention),
        maxDeletePerRun: maxDelete > 0 ? maxDelete : DEFAULT_MAX_DELETE,
    }
}

function createImapClient(config: RetentionConfig): ImapClient {
    return new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
    })
}

// 显式配置的文件夹路径通过 special-use 提示注入，让 list() 能据此标注
// 服务器未上报特殊用途标志的文件夹（部分邮箱如 QQ 不上报该标志）。
function buildListOptions(config: RetentionConfig): ListOptions {
    return {
        specialUseHints: {
            ...(config.sentFolder ? { sent: config.sentFolder } : {}),
            ...(config.trashFolder ? { trash: config.trashFolder } : {}),
        },
    }
}

function describeMailboxes(mailboxes: ListResponse[]): string {
    return mailboxes
        .map((item) => `${item.path}(${item.specialUse ?? '无特殊用途'})`)
        .join('，')
}

/** 定位特殊用途文件夹：显式配置优先，其次按 special-use 标志匹配，失败返回 null。 */
async function resolveSpecialFolder(
    client: ImapClient,
    options: ListOptions,
    explicit: string | undefined,
    specialUse: string,
    label: string,
): Promise<string | null> {
    if (explicit) {
        return explicit
    }
    const mailboxes = await client.list(options)
    const matched = mailboxes.find((item) => item.specialUse === specialUse)
    if (matched) {
        return matched.path
    }
    console.error(
        `[Backup] 未探测到「${label}」文件夹，已跳过该文件夹的清理。可用文件夹：${describeMailboxes(mailboxes)}`,
    )
    return null
}

/** 清理单个文件夹：命中标识头 → 挑最旧的 → 校验主题 → 移入已删除。 */
async function pruneFolder(
    client: ImapClient,
    folder: string,
    trash: string,
    config: RetentionConfig,
): Promise<number> {
    const lock = await client.getMailboxLock(folder)
    try {
        const uids = await client.search(
            { header: { [BACKUP_HEADER]: BACKUP_HEADER_VALUE } },
            { uid: true },
        )
        if (!uids || uids.length === 0) {
            return 0
        }
        console.log(`[Backup] ${folder} 中现有 ${uids.length} 封备份邮件`)
        const stale = selectStaleUids(
            uids,
            config.retention,
            config.maxDeletePerRun,
        )
        if (stale.length === 0) {
            return 0
        }
        const messages = await client.fetchAll(
            stale,
            { envelope: true, uid: true },
            { uid: true },
        )
        const verified: number[] = []
        for (const message of messages) {
            if (message.uid === undefined) {
                continue
            }
            if (
                (message.envelope?.subject ?? '').startsWith(
                    BACKUP_SUBJECT_PREFIX,
                )
            ) {
                verified.push(message.uid)
                continue
            }
            console.error(
                `[Backup] UID ${message.uid} 主题不匹配备份前缀，已跳过以防误删`,
            )
        }
        if (verified.length === 0) {
            return 0
        }
        await client.messageMove(verified, trash, { uid: true })
        console.log(
            `[Backup] 已将 ${folder} 中 ${verified.length} 封旧备份移入「已删除」`,
        )
        return verified.length
    } finally {
        lock.release()
    }
}

/** 连接 IMAP 并清理收件箱与「已发送」，任一环节失败仅记录日志不抛出。 */
export async function pruneBackupMails(
    config: RetentionConfig,
    factory: ImapClientFactory = createImapClient,
): Promise<void> {
    const client = factory(config)
    try {
        await client.connect()
        const listOptions = buildListOptions(config)
        const trash = await resolveSpecialFolder(
            client,
            listOptions,
            config.trashFolder,
            SPECIAL_USE_TRASH,
            '已删除',
        )
        if (!trash) {
            return
        }
        const sent = await resolveSpecialFolder(
            client,
            listOptions,
            config.sentFolder,
            SPECIAL_USE_SENT,
            '已发送',
        )
        const folders = sent ? [config.mailbox, sent] : [config.mailbox]
        for (const folder of folders) {
            try {
                await pruneFolder(client, folder, trash, config)
            } catch (error) {
                console.error(`[Backup] 清理文件夹 ${folder} 失败:`, error)
            }
        }
    } finally {
        await client.logout()
    }
}
