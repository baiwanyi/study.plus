/**
 * 日志时间戳模块：为前端控制台输出统一注入「本地时间 + 级别」前缀，与服务端日志格式保持一致。
 * 复用约定：应用入口（src/main.tsx）顶部显式调用 enableLogTimestamp() 即可，
 * 业务代码里的 console.error / warn / log 调用点无需逐处改造。
 * 关键约束：包装幂等（重复调用只生效一次）；级别前缀由本模块统一注入，避免各文件自行拼接格式。
 */

/** 生成形如 2026-09-13 17:32:05.123 的本地时间字符串 */
function formatTimestamp(date: Date): string {
    const pad = (value: number, length = 2): string =>
        String(value).padStart(length, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

let enabled = false

/** 为 console 的 error / warn / log 注入时间戳与级别前缀（幂等，重复调用无副作用） */
export function enableLogTimestamp(): void {
    if (enabled) return
    enabled = true

    const originalError = console.error.bind(console)
    const originalWarn = console.warn.bind(console)
    const originalLog = console.log.bind(console)

    console.error = (...args: unknown[]): void => {
        originalError(`[${formatTimestamp(new Date())}] [ERROR]`, ...args)
    }
    console.warn = (...args: unknown[]): void => {
        originalWarn(`[${formatTimestamp(new Date())}] [WARN]`, ...args)
    }
    console.log = (...args: unknown[]): void => {
        originalLog(`[${formatTimestamp(new Date())}] [INFO]`, ...args)
    }
}
