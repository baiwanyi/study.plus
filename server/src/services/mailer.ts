/**
 * 备份邮件投递：SMTP 配置解析、传输器构建与带超时、退避重试的发送。
 * 复用于数据库备份等需要外发文件的场景，传输统一由 nodemailer 提供，
 * 备份邮件的识别常量（自定义头与主题前缀）也在此定义，供清理模块复用。
 * 凭据仅取自环境变量且缺失即返回禁用态，避免辅助功能拖垮主服务；
 * 连接/问候/套接字三类超时必须显式声明，杜绝网络异常时请求永久挂起；
 * 重试采用指数退避加抖动并设上限，防止连续失败演变为对 SMTP 的流量洪峰。
 */
import nodemailer from 'nodemailer'
import type { SendMailOptions, Transporter } from 'nodemailer'

/** 备份邮件标识头，IMAP 清理按此头精确命中，避免误伤普通邮件 */
export const BACKUP_HEADER = 'X-StudyPlus-Backup'
export const BACKUP_HEADER_VALUE = '1'
/**
 * 主题前缀，清理时逐封二次校验，与标识头构成双重防护。
 * 刻意使用纯 ASCII：中文前缀在 SMTP 传输中会被 MIME 编码为 =?UTF-8?B?…?=，
 * 导致 IMAP 侧取回的 subject 无法按前缀匹配，二次校验将恒定失效。
 */
export const BACKUP_SUBJECT_PREFIX = '[StudyPlus Backup]'

const CONNECTION_TIMEOUT_MS = 30_000
const GREETING_TIMEOUT_MS = 30_000
const SOCKET_TIMEOUT_MS = 180_000
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 2_000

export interface MailConfig {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
    to: string[]
}

export interface MailAttachment {
    path: string
    filename: string
}

export interface MailPayload {
    subject: string
    text: string
    attachment: MailAttachment
}

/** 发送器最小契约，测试可用轻量替身驱动重试逻辑而无需构造真实传输器。 */
export interface MailSender {
    sendMail(options: SendMailOptions): Promise<unknown>
}

function parseRecipients(raw: string | undefined): string[] {
    if (!raw) {
        return []
    }
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
}

/**
 * 解析 SMTP 配置。任一必填项缺失即返回 null 并记录中文告警，
 * 由调用方决定降级策略，不在解析阶段抛错。
 */
export function readMailConfig(): MailConfig | null {
    const host = process.env.SMTP_HOST
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const to = parseRecipients(process.env.MAIL_TO)
    if (!host || !user || !pass || to.length === 0) {
        console.error(
            '[Backup] SMTP 配置不完整（需 SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_TO），备份邮件功能已禁用',
        )
        return null
    }
    const port = Number(process.env.SMTP_PORT)
    return {
        host,
        port: port > 0 ? port : 465,
        secure: process.env.SMTP_SECURE !== 'false',
        user,
        pass,
        from: process.env.MAIL_FROM || user,
        to,
    }
}

export function createTransporter(config: MailConfig): Transporter {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
    })
}

function delayWithJitter(attempt: number): Promise<void> {
    const backoff = BASE_DELAY_MS * 2 ** (attempt - 1)
    const jitter = backoff * (0.5 + Math.random() * 0.5)
    return new Promise((resolve) => {
        setTimeout(resolve, jitter)
    })
}

/**
 * 投递邮件并在失败时重试。发送器由外部传入以便替换为测试替身，
 * 重试次数耗尽后抛出最后一次错误，交由调用方决定是否影响备份结果。
 */
export async function deliverMail(
    sender: MailSender,
    config: MailConfig,
    payload: MailPayload,
): Promise<void> {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            await sender.sendMail({
                from: config.from,
                to: config.to.join(', '),
                subject: payload.subject,
                text: payload.text,
                headers: { [BACKUP_HEADER]: BACKUP_HEADER_VALUE },
                attachments: [
                    {
                        path: payload.attachment.path,
                        filename: payload.attachment.filename,
                    },
                ],
            })
            return
        } catch (error) {
            lastError = error
            console.error(
                `[Backup] 邮件发送失败（第 ${attempt}/${MAX_ATTEMPTS} 次）:`,
                error,
            )
            if (attempt < MAX_ATTEMPTS) {
                await delayWithJitter(attempt)
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** 构建传输器、投递邮件并在结束时释放连接，保证连接池不被占满。 */
export async function sendBackupMail(
    config: MailConfig,
    payload: MailPayload,
): Promise<void> {
    const transporter = createTransporter(config)
    try {
        await deliverMail(transporter, config, payload)
    } finally {
        transporter.close()
    }
}
