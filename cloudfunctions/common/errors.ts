/** 统一业务错误：携带 HTTP 状态码，由云函数入口统一包装为响应 */
export class HttpError extends Error {
    public readonly status: number

    public readonly details?: unknown

    public constructor(status: number, message: string, details?: unknown) {
        super(message)
        this.name = 'HttpError'
        this.status = status
        this.details = details
    }
}

/** 统一成功响应结构 */
export interface ApiSuccess<T> {
    code: 0
    data: T
}

/** 统一错误响应结构 */
export interface ApiFailure {
    code: number
    error: true
    message: string
    details?: unknown
}

/**
 * 云函数统一返回格式。
 * - 业务成功：{ code: 0, data }
 * - 业务失败：{ code: <httpStatus>, error: true, message }
 */
export function ok<T>(data: T): ApiSuccess<T> {
    return { code: 0, data }
}

export function fail(status: number, message: string, details?: unknown): ApiFailure {
    return { code: status, error: true, message, details }
}
