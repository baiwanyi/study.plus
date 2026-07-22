import { fail, ok, HttpError, type ApiFailure, type ApiSuccess } from './errors'

/**
 * 云函数统一入口包装：捕获 HttpError 转为标准错误响应，
 * 未知异常记录日志并返回 500（不向客户端暴露堆栈）。
 */
export async function run<R>(
    fn: () => Promise<R>,
): Promise<ApiSuccess<R> | ApiFailure> {
    try {
        return ok(await fn())
    } catch (err) {
        if (err instanceof HttpError) {
            return fail(err.status, err.message, err.details)
        }
        const msg = err instanceof Error ? err.message : '服务器内部错误'
        console.error('[Function Error]', msg, err)
        return fail(500, msg)
    }
}
