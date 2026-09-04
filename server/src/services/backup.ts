/**
 * 数据库每日备份编排：一致性快照、zip 打包、邮件外发与调度判定。
 * 数据库路径由外部注入（取自 db 模块的 DB_FILE_PATH），不在本模块重复解析，
 * 以免开发态与部署态指向不同的库；临时文件统一落在系统临时目录并兜底清理。
 * 快照前须执行 wal_checkpoint(TRUNCATE)，否则 WAL 中未落库的事务会被漏掉；
 * attachement 超限直接跳过发送，避免 SMTP 拒收后重试演变为无效流量。
 */
import { randomUUID } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ZipArchive } from 'archiver'
import { sql } from 'drizzle-orm'
import { db } from '../db/index'
import { pruneBackupMails, readRetentionConfig } from './backup-retention'
import type { MailConfig, MailPayload } from './mailer'
import { BACKUP_SUBJECT_PREFIX, sendBackupMail } from './mailer'

const DEFAULT_TRIGGER = '03:00'
const DEFAULT_MAX_ATTACHMENT_MB = 20

export interface BackupConfig {
    dbPath: string
    triggerHour: number
    triggerMinute: number
    maxAttachmentBytes: number
}

export type BackupStatus = 'sent' | 'skipped' | 'failed'

export interface BackupResult {
    status: BackupStatus
    reason?: string
}

/** 本地时区的日期键（YYYY-MM-DD），用于「每日至多一次」的幂等守卫。 */
export function toDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function parseTriggerTime(
    raw: string,
): { hour: number; minute: number } | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
    if (!match) {
        return null
    }
    const [, hourText, minuteText] = match
    if (hourText === undefined || minuteText === undefined) {
        return null
    }
    const hour = Number(hourText)
    const minute = Number(minuteText)
    if (hour > 23 || minute > 59) {
        return null
    }
    return { hour, minute }
}

/**
 * 解析备份配置。未启用、时刻格式非法或数据库不是文件库时返回 null，
 * 由调用方降级处理，保证备份功能缺失不影响主服务启动。
 */
export function readBackupConfig(dbFilePath: string | null): BackupConfig | null {
    if (process.env.BACKUP_ENABLED !== 'true') {
        return null
    }
    if (!dbFilePath) {
        console.error(
            '[Backup] 当前数据库非文件库（内存库或远程库），无法生成备份，备份任务已禁用',
        )
        return null
    }
    const trigger = parseTriggerTime(process.env.BACKUP_TIME || DEFAULT_TRIGGER)
    if (!trigger) {
        console.error(
            `[Backup] BACKUP_TIME 格式非法（应为 HH:mm，如 03:00），备份任务已禁用`,
        )
        return null
    }
    const maxMb = Number(process.env.BACKUP_MAX_ATTACHMENT_MB)
    return {
        dbPath: dbFilePath,
        triggerHour: trigger.hour,
        triggerMinute: trigger.minute,
        maxAttachmentBytes:
            (maxMb > 0 ? maxMb : DEFAULT_MAX_ATTACHMENT_MB) * 1024 * 1024,
    }
}

/**
 * 判定本次 tick 是否应执行备份：同日只跑一次，且必须已过当日触发时刻。
 * 抽为纯函数以便直接覆盖跨日、未到点等边界。
 */
export function shouldRunBackup(
    lastRunDate: string,
    now: Date,
    config: BackupConfig,
): boolean {
    if (lastRunDate === toDateKey(now)) {
        return false
    }
    const elapsed = now.getHours() * 60 + now.getMinutes()
    return elapsed >= config.triggerHour * 60 + config.triggerMinute
}

/** 落盘一致性快照：先截断 WAL 把未落库事务写回主库，再复制物理文件。 */
export async function createSnapshot(
    dbPath: string,
    targetPath: string,
): Promise<void> {
    await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`)
    await fs.promises.copyFile(dbPath, targetPath)
}

/** 把快照打包为 zip，返回前确保输出流已关闭，避免读到半截文件。 */
export async function createZip(
    sourcePath: string,
    zipPath: string,
    entryName: string,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath)
        const archive = new ZipArchive({ zlib: { level: 9 } })
        output.on('close', resolve)
        output.on('error', reject)
        archive.on('error', reject)
        archive.pipe(output)
        archive.file(sourcePath, { name: entryName })
        archive.finalize().catch(reject)
    })
}

async function removeTempFiles(targets: string[]): Promise<void> {
    await Promise.all(
        targets.map(async (target) => {
            try {
                await fs.promises.rm(target, { force: true })
            } catch (error) {
                console.error(`[Backup] 临时文件清理失败 ${target}:`, error)
            }
        }),
    )
}

function buildPayload(
    dateKey: string,
    zipPath: string,
    sizeBytes: number,
): MailPayload {
    const sizeMb = (sizeBytes / 1024 / 1024).toFixed(2)
    return {
        subject: `${BACKUP_SUBJECT_PREFIX} study-backup-${dateKey}`,
        text: [
            `学迹Plus 数据库每日备份`,
            ``,
            `备份日期：${dateKey}`,
            `压缩包体积：${sizeMb} MB`,
            `附件文件名：study-backup-${dateKey}.zip`,
            ``,
            `本邮件由服务端定时任务自动发送，内含数据库完整快照，请勿随意外传。`,
        ].join('\n'),
        attachment: {
            path: zipPath,
            filename: `study-backup-${dateKey}.zip`,
        },
    }
}

/**
 * 执行一次完整备份：快照 → 打包 → 发送 → 清理邮箱旧备份。
 * 清理失败不影响本次发送结果；任何路径下都保证临时文件被回收。
 */
export async function runDailyBackup(
    config: BackupConfig,
    mailConfig: MailConfig,
    now: Date,
): Promise<BackupResult> {
    const dateKey = toDateKey(now)
    const token = randomUUID()
    const snapshotPath = path.join(os.tmpdir(), `study-snapshot-${token}.db`)
    const zipPath = path.join(os.tmpdir(), `study-backup-${token}.zip`)
    try {
        await createSnapshot(config.dbPath, snapshotPath)
        await createZip(snapshotPath, zipPath, `study-${dateKey}.db`)
        const { size } = await fs.promises.stat(zipPath)
        if (size > config.maxAttachmentBytes) {
            const limitMb = Math.floor(config.maxAttachmentBytes / 1024 / 1024)
            console.error(
                `[Backup] 压缩包 ${(size / 1024 / 1024).toFixed(2)} MB 超出上限 ${limitMb} MB，已跳过发送`,
            )
            return { status: 'skipped', reason: '附件超出体积上限' }
        }
        await sendBackupMail(mailConfig, buildPayload(dateKey, zipPath, size))
        const retentionConfig = readRetentionConfig(mailConfig)
        if (retentionConfig) {
            try {
                await pruneBackupMails(retentionConfig)
            } catch (error) {
                console.error(
                    '[Backup] 邮箱保留策略执行失败，不影响本次备份:',
                    error,
                )
            }
        }
        return { status: 'sent' }
    } catch (error) {
        console.error('[Backup] 每日备份执行失败:', error)
        return {
            status: 'failed',
            reason: error instanceof Error ? error.message : String(error),
        }
    } finally {
        await removeTempFiles([snapshotPath, zipPath])
    }
}
