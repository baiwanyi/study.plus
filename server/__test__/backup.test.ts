/**
 * 每日备份主流程测试：配置解析、调度判定、快照一致性、zip 打包与发送编排。
 * 快照与打包走真实临时文件以校验物理产物，邮件发送统一用替身隔离外部网络；
 * 环境变量通过 vi.stubEnv 注入并在每条用例后回滚，避免污染同进程的其他测试。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BackupConfig } from '../src/services/backup'
import {
    createSnapshot,
    createZip,
    readBackupConfig,
    runDailyBackup,
    shouldRunBackup,
} from '../src/services/backup'
import type { MailConfig, MailPayload, MailSender } from '../src/services/mailer'
import { deliverMail, readMailConfig, sendBackupMail } from '../src/services/mailer'

// 保留模块内常量与解析函数的真实实现，仅替换真正会联网的发送入口。
vi.mock('../src/services/mailer', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../src/services/mailer')>()
    return { ...actual, sendBackupMail: vi.fn() }
})

const mockedSendBackupMail = vi.mocked(sendBackupMail)

function makeBackupConfig(overrides: Partial<BackupConfig> = {}): BackupConfig {
    return {
        dbPath: '/tmp/study.db',
        triggerHour: 3,
        triggerMinute: 0,
        maxAttachmentBytes: 20 * 1024 * 1024,
        ...overrides,
    }
}

function makeMailConfig(): MailConfig {
    return {
        host: 'smtp.test.com',
        port: 465,
        secure: true,
        user: 'sender@test.com',
        pass: 'secret',
        from: 'sender@test.com',
        to: ['receiver@test.com'],
    }
}

function makePayload(): MailPayload {
    return {
        subject: '[StudyPlus Backup] study-backup-2026-09-04',
        text: '测试',
        attachment: { path: '/tmp/backup.zip', filename: 'backup.zip' },
    }
}

async function withTempDir(
    task: (dir: string) => Promise<void>,
): Promise<void> {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'backup-test-'))
    try {
        await task(dir)
    } finally {
        await fs.promises.rm(dir, { recursive: true, force: true })
    }
}

async function countStudyTempFiles(): Promise<number> {
    const entries = await fs.promises.readdir(os.tmpdir())
    return entries.filter(
        (name) =>
            name.startsWith('study-snapshot-') || name.startsWith('study-backup-'),
    ).length
}

afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
})

describe('每日备份：配置解析与调度判定', () => {
    it('用例 1 - BACKUP_ENABLED 未启用时返回禁用态', () => {
        vi.stubEnv('BACKUP_ENABLED', 'false')
        expect(readBackupConfig('/tmp/study.db')).toBeNull()
    })

    it('用例 2 - 缺少 SMTP_PASS 时返回禁用态并记录中文告警', () => {
        vi.stubEnv('SMTP_HOST', 'smtp.test.com')
        vi.stubEnv('SMTP_USER', 'sender@test.com')
        vi.stubEnv('SMTP_PASS', '')
        vi.stubEnv('MAIL_TO', 'receiver@test.com')
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(readMailConfig()).toBeNull()
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('用例 3 - 同一天已执行过则跳过', () => {
        const now = new Date(2026, 8, 4, 5, 0)
        expect(shouldRunBackup('2026-09-04', now, makeBackupConfig())).toBe(false)
    })

    it('用例 4 - 未到触发时刻则跳过', () => {
        const now = new Date(2026, 8, 4, 1, 30)
        expect(shouldRunBackup('2026-09-03', now, makeBackupConfig())).toBe(false)
    })

    it('用例 5 - 跨日且已过触发时刻则执行', () => {
        const now = new Date(2026, 8, 4, 3, 0)
        expect(shouldRunBackup('2026-09-03', now, makeBackupConfig())).toBe(true)
    })
})

describe('每日备份：快照与打包', () => {
    it('用例 6 - 快照与原数据库文件字节一致', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'study.db')
            const target = path.join(dir, 'snapshot.db')
            await fs.promises.writeFile(source, 'sqlite-binary-payload')
            await createSnapshot(source, target)
            const original = await fs.promises.readFile(source)
            const copied = await fs.promises.readFile(target)
            expect(copied.equals(original)).toBe(true)
        })
    })

    it('用例 7 - 打包产物为合法 zip 且非空', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'study.db')
            const zipPath = path.join(dir, 'backup.zip')
            await fs.promises.writeFile(source, 'x'.repeat(4096))
            await createZip(source, zipPath, 'study-2026-09-04.db')
            const buffer = await fs.promises.readFile(zipPath)
            expect(buffer.subarray(0, 4).toString('hex')).toBe('504b0304')
            expect(buffer.length).toBeGreaterThan(0)
        })
    })
})

describe('每日备份：发送编排', () => {
    it('用例 8 - 首次发送失败时退避后重试成功', async () => {
        const sendMail = vi
            .fn()
            .mockRejectedValueOnce(new Error('SMTP 连接失败'))
            .mockResolvedValueOnce({ messageId: 'ok' })
        const sender: MailSender = { sendMail }
        await deliverMail(sender, makeMailConfig(), makePayload())
        expect(sendMail).toHaveBeenCalledTimes(2)
    })

    it('用例 9 - 附件超出体积上限时跳过发送', async () => {
        await withTempDir(async (dir) => {
            const dbPath = path.join(dir, 'study.db')
            await fs.promises.writeFile(dbPath, 'x'.repeat(4096))
            const result = await runDailyBackup(
                makeBackupConfig({ dbPath, maxAttachmentBytes: 1 }),
                makeMailConfig(),
                new Date(2026, 8, 4, 3, 0),
            )
            expect(result.status).toBe('skipped')
            expect(mockedSendBackupMail).not.toHaveBeenCalled()
        })
    })

    it('用例 10 - 发送异常后临时文件无残留', async () => {
        await withTempDir(async (dir) => {
            mockedSendBackupMail.mockRejectedValueOnce(
                new Error('邮件服务不可用'),
            )
            const dbPath = path.join(dir, 'study.db')
            await fs.promises.writeFile(dbPath, 'x'.repeat(1024))
            const before = await countStudyTempFiles()
            const result = await runDailyBackup(
                makeBackupConfig({ dbPath }),
                makeMailConfig(),
                new Date(2026, 8, 4, 3, 0),
            )
            expect(result.status).toBe('failed')
            expect(await countStudyTempFiles()).toBe(before)
        })
    })
})
