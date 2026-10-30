/**
 * 每日备份编排：数据库一致性快照、本地题库目录打包、zip 邮件外发与调度判定。
 * 数据库路径由外部注入（取自 db 模块的 DB_FILE_PATH），题库根目录由 services/library-root 解析，
 * 两者都不在本模块重复推导，以免开发态与部署态指向不同的位置；临时文件落在系统临时目录并兜底清理。
 * 快照前须执行 wal_checkpoint(TRUNCATE)，否则 WAL 中未落库的事务会被漏掉；
 * 题库目录递归收录普通文件并跳过软链（防止把题库之外的文件打进邮件附件），目录不存在时只备份数据库；
 * 附件超限直接跳过发送，避免 SMTP 拒收后重试演变为无效流量。
 */
import { randomUUID } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ZipArchive } from 'archiver'
import { sql } from 'drizzle-orm'
import { db } from '../db/index'
import { pruneBackupMails, readRetentionConfig } from './backup-retention'
import { resolveLibraryRoot } from './library-root'
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

/** 题库目录在压缩包内的根节点名，解压后与线上目录结构一致，便于直接回滚 */
const LIBRARY_ENTRY_ROOT = 'library'
/** 题库目录递归深度上限：题库实际只有一两层，超深目录多半是异常布局，直接停止避免拖垮打包 */
const LIBRARY_MAX_DEPTH = 20

/** 判断路径是否为已存在的目录（不存在或不可读都视为否，由调用方降级） */
async function isDirectory(target: string): Promise<boolean> {
    try {
        return (await fs.promises.stat(target)).isDirectory()
    } catch {
        return false
    }
}

/**
 * 递归把题库目录写入压缩包：只收普通文件，软链一律跳过，
 * 避免题库内的软链把目录之外的敏感文件带进邮件附件。
 */
async function appendLibraryFiles(
    archive: ZipArchive,
    rootDir: string,
    entryRoot: string,
    depth = 0,
): Promise<void> {
    if (depth > LIBRARY_MAX_DEPTH) {
        console.error(`[Backup] 题库目录层级过深，跳过打包: ${rootDir}`)
        return
    }
    const entries = await fs.promises.readdir(rootDir, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const absPath = path.join(rootDir, entry.name)
        const entryName = `${entryRoot}/${entry.name}`
        if (entry.isDirectory()) {
            await appendLibraryFiles(archive, absPath, entryName, depth + 1)
        } else if (entry.isFile()) {
            archive.file(absPath, { name: entryName })
        }
    }
}

/** 题库目录存在才追加，缺失时视为未启用本地题库，不影响数据库备份 */
async function appendLibrary(
    archive: ZipArchive,
    libraryDir: string | undefined,
): Promise<void> {
    if (!libraryDir || !(await isDirectory(libraryDir))) return
    await appendLibraryFiles(archive, libraryDir, LIBRARY_ENTRY_ROOT)
}

/**
 * 把快照打包为 zip（可选追加题库目录），返回前确保输出流已关闭，避免读到半截文件。
 * 题库收录失败时销毁输出流并抛错，绝不发出内容不完整的备份。
 */
export async function createZip(
    sourcePath: string,
    zipPath: string,
    entryName: string,
    libraryDir?: string,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath)
        const archive = new ZipArchive({ zlib: { level: 9 } })
        output.on('close', resolve)
        output.on('error', reject)
        archive.on('error', reject)
        archive.pipe(output)
        archive.file(sourcePath, { name: entryName })
        appendLibrary(archive, libraryDir)
            .then(() => archive.finalize())
            .catch((error: unknown) => {
                output.destroy()
                reject(error)
            })
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
    contents: string,
): MailPayload {
    const sizeMb = (sizeBytes / 1024 / 1024).toFixed(2)
    return {
        subject: `${BACKUP_SUBJECT_PREFIX} study-backup-${dateKey}`,
        text: [
            `学迹Plus 每日备份`,
            ``,
            `备份日期：${dateKey}`,
            `备份内容：${contents}`,
            `压缩包体积：${sizeMb} MB`,
            `附件文件名：study-backup-${dateKey}.zip`,
            ``,
            `本邮件由服务端定时任务自动发送，请勿随意外传。`,
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
        // 题库根目录与题库页面同源解析，目录不存在时只打包数据库
        const { rootDir } = await resolveLibraryRoot()
        const libraryIncluded = await isDirectory(rootDir)
        await createZip(
            snapshotPath,
            zipPath,
            `study-${dateKey}.db`,
            libraryIncluded ? rootDir : undefined,
        )
        const contents = libraryIncluded
            ? `数据库完整快照（study-${dateKey}.db）+ 本地题库目录（${LIBRARY_ENTRY_ROOT}/）`
            : `数据库完整快照（study-${dateKey}.db），题库目录不存在未收录`
        const { size } = await fs.promises.stat(zipPath)
        if (size > config.maxAttachmentBytes) {
            const limitMb = Math.floor(config.maxAttachmentBytes / 1024 / 1024)
            console.error(
                `[Backup] 压缩包 ${(size / 1024 / 1024).toFixed(2)} MB 超出上限 ${limitMb} MB，已跳过发送`,
            )
            return { status: 'skipped', reason: '附件超出体积上限' }
        }
        await sendBackupMail(
            mailConfig,
            buildPayload(dateKey, zipPath, size, contents),
        )
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
